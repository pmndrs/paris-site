"use client";

import {
  useFrame,
  useGPUStorage,
  useLocalNodes,
  useThree,
  useUniforms,
} from "@react-three/fiber/webgpu";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  abs,
  clamp,
  cos,
  dot,
  exp,
  float,
  Fn,
  hash,
  instancedArray,
  instanceIndex,
  length,
  max,
  mix,
  normalLocal,
  positionLocal,
  reflectVector,
  select,
  sin,
  smoothstep,
  struct,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import {
  Color,
  Vector2,
  type Node,
  type WebGPURenderer,
} from "three/webgpu";

import type { FlipGridConfig } from "./config";

/**
 * A grid of tiles that flip to gold as the cursor sweeps them, and hold that
 * pose for a few seconds before falling back.
 *
 * The whole simulation lives on the GPU. A storage buffer holds one `Tile`
 * struct per instance — flip angle, angular velocity, and the hold timer — a
 * compute pass integrates it, and the vertex stage reads the angle back out.
 * The CPU writes five floats a frame (dt plus two pointer positions) no matter
 * how many tiles there are.
 *
 * That is the whole argument for the WebGPU path. Per-instance *state* is what
 * a stateless version can't have: with the flip angle derived from cursor
 * distance every frame, there is nowhere to put a timer, so "stay flipped for
 * three seconds" is unrepresentable. Doing it on WebGL means either ~1800
 * matrix writes per frame from JavaScript or a ping-pong float-texture dance.
 */

/**
 * Per-instance simulation state.
 *
 * Only genuinely *stateful* fields live here. Per-tile mass is derived from a
 * hash of the instance index instead — deterministic, free, and it needs no
 * init pass, which means the zero-filled buffer three allocates is already a
 * valid starting state.
 */
const Tile = struct(
  {
    /** Flip angle in radians. 0 rests dark side out, π shows the gold. */
    angle: "float",
    angVel: "float",
    /** Seconds left before this tile is allowed to fall back. */
    hold: "float",
  },
  "Tile",
);

/** Parking spot for the cursor when it's off the element. */
const AWAY = 1e6;

/**
 * The largest timestep the spring integrator is allowed to see. A backgrounded
 * tab or a long frame hitch would otherwise hand it a delta big enough to
 * explode a semi-implicit Euler step.
 */
const MAX_DT = 1 / 20;

/**
 * three's TSL types tag every node with its GLSL type. Struct members come back
 * as untyped nodes, so these name the shapes we know those reads produce and
 * keep the casts in one place.
 */
type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;

export function FlipGrid({
  config,
  /**
   * The element whose bounds map the cursor into the scene. Not the canvas:
   * these canvases are `pointer-events: none` so they never steal clicks, and
   * under a shared renderer `renderer.domElement` may well be someone else's.
   */
  bounds,
}: {
  config: FlipGridConfig;
  bounds: RefObject<HTMLElement | null>;
}) {
  const { cols, rows } = config;
  const count = cols * rows;
  const { viewport } = useThree();
  // `useThree` types `renderer` as the WebGL/WebGPU union even on the /webgpu
  // entry, and `compute` only exists on the WebGPU one.
  const renderer = useThree((s) => s.renderer) as unknown as WebGPURenderer;

  // One cell spans whichever axis needs more coverage, so the grid always
  // overfills rather than leaving a margin.
  const step = Math.max(viewport.width / cols, viewport.height / rows);

  // Built with TSL's own `uniform()` rather than from raw values, because the
  // store hands everything back as `UniformNode<unknown>` and the node graph
  // below needs the concrete types. `useUniforms` still owns them — it accepts
  // existing uniform nodes as-is — so they stay visible to HMR and to anything
  // else reading the store.
  const u = useMemo(
    () => ({
      uStep: uniform(1),
      uTile: uniform(1),
      uThickness: uniform(config.thickness),
      uRadius: uniform(1),
      uHold: uniform(config.hold),
      uStiffness: uniform(config.stiffness),
      uDamping: uniform(config.damping),
      uMassJitter: uniform(config.massJitter),
      uDt: uniform(0),
      uPointer: uniform(new Vector2(AWAY, AWAY)),
      uPointerPrev: uniform(new Vector2(AWAY, AWAY)),
      uFront: uniform(new Color(config.front)),
      uBack: uniform(new Color(config.back)),
      uEdge: uniform(new Color(config.edge)),
      uGoldRoughness: uniform(config.goldRoughness),
      uGround: uniform(new Color(config.ground)),
      uSky: uniform(new Color(config.sky)),
      uStrip: uniform(new Color(config.strip)),
      uStripHeight: uniform(config.stripHeight),
      uStripWidth: uniform(config.stripWidth),
      uEnv: uniform(config.envStrength),
    }),
    // Created once for the life of the component; every later change is a value
    // write below, not a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Scoped, because uniforms resolve against the *primary* store — on the site
  // this canvas shares one renderer with the hero, and unscoped names would
  // collide with it.
  useUniforms(() => u, "flipGrid");

  // Writing values instead of rebuilding the graph is what makes the Leva panel
  // feel instant rather than recompiling a shader per slider tick.
  useEffect(() => {
    u.uStep.value = step;
    u.uTile.value = step * config.fill;
    u.uThickness.value = config.thickness;
    u.uRadius.value = step * config.radius;
    u.uHold.value = config.hold;
    u.uStiffness.value = config.stiffness;
    u.uDamping.value = config.damping;
    u.uMassJitter.value = config.massJitter;
    u.uGoldRoughness.value = config.goldRoughness;
    u.uStripHeight.value = config.stripHeight;
    u.uStripWidth.value = config.stripWidth;
    u.uEnv.value = config.envStrength;
    u.uFront.value.set(config.front);
    u.uBack.value.set(config.back);
    u.uEdge.value.set(config.edge);
    u.uGround.value.set(config.ground);
    u.uSky.value.set(config.sky);
    u.uStrip.value.set(config.strip);
  });

  // Zero-filled at allocation, which is exactly "flat, still, not held".
  // `instancedArray` accepts a struct type at runtime but isn't typed for one
  // yet; the buffer it hands back behaves as a flat float array either way.
  const tiles = useMemo(
    () => instancedArray(count, Tile as unknown as "float"),
    [count],
  );
  // Registered at the root with a prefixed key rather than in a "flipGrid"
  // scope, because r3f names scoped storage `scope.name` — and three builds the
  // WGSL struct name off that, so the dot lands in an identifier and the shader
  // fails to parse. (Scoped *uniforms* use `scope_name`, which is fine; it's
  // only the storage path that differs. Worth an upstream issue.)
  useGPUStorage(() => ({ flipGridTiles: tiles }));

  const nodes = useLocalNodes(() => {
    /** This instance's cell centre, in world units. */
    const cellCentre = () => {
      const ix = float(instanceIndex.mod(cols));
      const iy = float(instanceIndex.div(cols));
      return vec2(ix.sub((cols - 1) / 2), iy.sub((rows - 1) / 2)).mul(u.uStep);
    };

    /**
     * Distance to the segment the cursor swept this frame, not to where it
     * happens to be right now.
     *
     * This canvas runs at a throttled framerate, so a fast sweep moves the
     * pointer several cells between samples. Testing against the point leaves
     * gaps in the trail; testing against the segment fills them in, for the
     * cost of one dot product.
     */
    const distanceToSweep = (p: Vec2Node) => {
      const a = u.uPointer;
      const ab = u.uPointerPrev.sub(a);
      const t = clamp(dot(p.sub(a), ab).div(max(dot(ab, ab), 1e-6)), 0, 1);
      return length(p.sub(a.add(ab.mul(t))));
    };

    const update = Fn(() => {
      const tile = tiles.element(instanceIndex);
      const angle = tile.get("angle") as FloatNode;
      const angVel = tile.get("angVel") as FloatNode;
      const hold = tile.get("hold") as FloatNode;

      // Pinned full while the cursor is on the tile, draining once it leaves.
      // Counting down rather than storing an absolute deadline keeps the shader
      // free of a clock and immune to float drift over a long session.
      const held = select(
        distanceToSweep(cellCentre()).lessThan(u.uRadius),
        u.uHold,
        hold.sub(u.uDt).max(0),
      ) as FloatNode;
      hold.assign(held);

      const target = select(held.greaterThan(0), float(Math.PI), float(0));

      // Heavier tiles accelerate more slowly into the flip and overshoot more
      // on arrival, so a sweep breaks up into a ripple instead of a wavefront.
      const mass = float(1).add(hash(instanceIndex).mul(u.uMassJitter));

      angVel.addAssign(target.sub(angle).mul(u.uStiffness).div(mass).mul(u.uDt));
      // Exponential decay rather than a bare multiply, so damping means the same
      // thing whatever framerate this canvas ends up running at.
      angVel.mulAssign(exp(u.uDamping.mul(u.uDt).negate()));
      angle.addAssign(angVel.mul(u.uDt));
    })().compute(count);

    // Read-only here: three forces storage access to `read` outside the compute
    // stage, so one node serves both without any juggling.
    const angle = tiles.element(instanceIndex).get("angle") as FloatNode;
    const c = cos(angle);
    const s = sin(angle);

    /** Rotation about X, per component — three lines, and the shader stays flat. */
    const spin = (v: Node<"vec3">) =>
      vec3(v.x, v.y.mul(c).sub(v.z.mul(s)), v.y.mul(s).add(v.z.mul(c)));

    const local = positionLocal.mul(
      vec3(u.uTile, u.uTile, u.uTile.mul(u.uThickness)),
    );

    // Which face of the box a fragment belongs to, decided from the *unrotated*
    // normal — the geometry's own identity, independent of where the flip has
    // got to. That is the whole point of using a box: the gold doesn't fade in,
    // it arrives, because you are now looking at a different face.
    const isFront = normalLocal.z.greaterThan(0.5);
    const isBack = normalLocal.z.lessThan(-0.5);

    // `.rgb`/`float` here are coercions, not conversions: uniform colours carry
    // the `color` node type, and the arithmetic below wants a plain vector.
    const base = select(isFront, u.uFront, select(isBack, u.uBack, u.uEdge)).rgb;
    const metalness = float(
      select(isFront, float(0.12), select(isBack, float(1), float(0.85))),
    );
    const roughness = float(
      select(isFront, float(0.78), select(isBack, u.uGoldRoughness, float(0.38))),
    );

    // A stand-in environment: a ground-to-sky gradient with one bright band in
    // it, sampled by the reflect vector. Metal with nothing to reflect renders
    // black, and a real IBL would mean shipping an HDR for a background — this
    // is four lines and no bytes. As a tile turns, its reflect vector sweeps the
    // band across the face, which is the "expensive metal" read.
    // A tile at rest faces the camera dead-on, so its reflect vector points
    // straight back down the view axis: `r.y` is ~0. That's why the band sits
    // near the horizon rather than up in the "sky" — it is the softbox a flat
    // panel actually looks at. Tilting through the flip walks `r.y` out to ±1,
    // off the band and into the gradient, so the highlight rolls off the face
    // and comes back as the tile settles.
    const r = reflectVector.normalize();
    const band = smoothstep(u.uStripWidth, 0, abs(r.y.sub(u.uStripHeight)));
    const environment = mix(
      u.uGround,
      u.uSky,
      smoothstep(-0.8, 0.8, r.y),
    ).rgb.add(u.uStrip.rgb.mul(band));

    return {
      update,
      positionNode: spin(local).add(vec3(cellCentre(), 0)),
      // The normal has to turn with the tile or the lighting won't sell the
      // flip. `normalNode` is read in view space, so the rotated local normal
      // goes through the model-normal matrix on the way out.
      normalNode: transformNormalToView(spin(normalLocal)),
      colorNode: base,
      metalnessNode: metalness,
      roughnessNode: roughness,
      // Tinted by the face colour and gated on metalness, so the dark side stays
      // matte and only the gold picks the environment up.
      emissiveNode: environment.mul(base).mul(metalness).mul(u.uEnv),
    };
  });

  const pointer = useRef(new Vector2(AWAY, AWAY));
  /**
   * Set when the cursor teleports — entering the element, or leaving it. The
   * sweep test has to collapse to a point on those frames, or the segment from
   * "parked at infinity" to "over the grid" would flip everything it crosses.
   */
  const warped = useRef(true);

  useEffect(() => {
    const el = bounds.current;
    if (!el) return;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      if (nx < -1 || nx > 1 || ny < -1 || ny > 1) {
        if (pointer.current.x !== AWAY) warped.current = true;
        pointer.current.set(AWAY, AWAY);
        return;
      }

      if (pointer.current.x === AWAY) warped.current = true;
      pointer.current.set((nx * viewport.width) / 2, (ny * viewport.height) / 2);
    };

    // Listen on the window rather than the element: the canvas doesn't take
    // pointer events, and on the site the copy sitting on top of it would eat
    // them before the section ever saw them.
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [bounds, viewport.width, viewport.height]);

  useFrame((_, delta) => {
    u.uDt.value = Math.min(delta, MAX_DT);

    // On a teleport the segment collapses to a point, so nothing between the
    // old and new cursor positions gets swept.
    u.uPointerPrev.value.copy(
      warped.current ? pointer.current : u.uPointer.value,
    );
    warped.current = false;
    u.uPointer.value.copy(pointer.current);

    // `useFrame` runs in the scheduler's update phase, ahead of this canvas's
    // render, so the vertex stage always reads angles the compute pass just
    // wrote.
    renderer.compute(nodes.update);
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[2, 3, 6]} intensity={2.2} color="#fff4e0" />
      <directionalLight
        position={[-3, -2, 4]}
        intensity={0.9}
        color="#9aa8d0"
      />

      <instancedMesh
        args={[undefined, undefined, count]}
        // Instance transforms live in the shader, so the CPU-side bounding
        // volume is meaningless here.
        frustumCulled={false}
      >
        {/* A unit box, scaled in the vertex stage — so the thickness slider is
            a uniform write rather than a geometry rebuild. */}
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardNodeMaterial
          positionNode={nodes.positionNode}
          normalNode={nodes.normalNode}
          colorNode={nodes.colorNode}
          metalnessNode={nodes.metalnessNode}
          roughnessNode={nodes.roughnessNode}
          emissiveNode={nodes.emissiveNode}
        />
      </instancedMesh>
    </>
  );
}
