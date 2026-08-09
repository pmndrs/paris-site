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
  normalize,
  normalLocal,
  positionLocal,
  select,
  sin,
  struct,
  texture,
  transformNormalToView,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import {
  Color,
  RepeatWrapping,
  TextureLoader,
  Vector2,
  type Node,
  type PointLight,
  type WebGPURenderer,
} from "three/webgpu";

import type { FlipGridConfig } from "./config";

const FLAKE_DIR = "/materials/Gold_Parametric_Imperfections_1k_8b/textures";

const FLAKE_NORMAL = `${FLAKE_DIR}/Gold_Parametric_Imperfections_normal.png`;
const FLAKE_ROUGHNESS = `${FLAKE_DIR}/Gold_Parametric_Imperfections_roughness.png`;

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
      uRoughness: uniform(config.roughness),
      uFlakeRepeat: uniform(config.flakeRepeat),
      uFlakeStrength: uniform(config.flakeStrength),
      uFlakeRoughness: uniform(config.flakeRoughness),
      uTiltJitter: uniform(config.tiltJitter),
      uCurvature: uniform(config.curvature),
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
    u.uRoughness.value = config.roughness;
    u.uFlakeRepeat.value = config.flakeRepeat;
    u.uFlakeStrength.value = config.flakeStrength;
    u.uFlakeRoughness.value = config.flakeRoughness;
    u.uTiltJitter.value = config.tiltJitter;
    u.uCurvature.value = config.curvature;
    u.uFront.value.set(config.front);
    u.uBack.value.set(config.back);
    u.uEdge.value.set(config.edge);
  });

  // The microfacet maps out of `Gold_Parametric_Imperfections.mtlx`. The MaterialX
  // graph around them is a `standard_surface` with two constants and these two
  // images, so the maps are the whole substance of it — running the graph through
  // `MaterialXLoader` would hand back a complete material whose position and
  // normal we'd immediately have to override for the per-instance flip. Loading
  // an actual .mtlx is worth doing as its own demo, not smuggled into this one.
  // Loaded imperatively rather than through `useTexture`, which suspends. With
  // no `<Suspense>` inside the canvas the nearest boundary is outside it, so
  // suspending tears the whole subtree down and rebuilds it — taking the
  // storage buffer with it. A grid whose state is re-zeroed on every remount
  // can never hold a flip, which is exactly the symptom.
  //
  // (Its array and record forms have a second problem anyway: `useLoader` maps
  // over the keys and returns a fresh array each render, so the hook's registry
  // effect re-runs, calls `store.setState`, and re-renders every store
  // subscriber, without end.)
  //
  // `TextureLoader.load` hands back the Texture straight away and fills it in
  // when the bytes arrive, which is the right trade for a decoration: the grid
  // renders un-flaked for a frame or two instead of blocking on two PNGs.
  const [flakeNormal, flakeRoughness] = useMemo(() => {
    const loader = new TextureLoader();
    const load = (url: string) => {
      const map = loader.load(url);
      map.wrapS = RepeatWrapping;
      map.wrapT = RepeatWrapping;
      return map;
    };
    return [load(FLAKE_NORMAL), load(FLAKE_ROUGHNESS)];
  }, []);

  useEffect(
    () => () => {
      flakeNormal.dispose();
      flakeRoughness.dispose();
    },
    [flakeNormal, flakeRoughness],
  );

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
      select(isFront, float(0.12), select(isBack, float(1), float(0.9))),
    );

    /**
     * Microfacet break-up — the thing that actually makes this read as metal.
     *
     * A flat tile has one normal, so it reflects exactly one direction of the
     * environment and comes out a single flat colour however good the BRDF is.
     * A curved surface reads as metal precisely because every fragment samples
     * somewhere different. Perturbing the normal with a fine flake pattern buys
     * that variation back on a flat face.
     *
     * The two flip faces are the box's ±Z, so their tangent space is just local
     * XY and the map drops straight in with no tangent attribute. The four thin
     * edges are left alone; nobody is reading microfacets off a 2px sliver.
     */
    const tileUv = uv()
      .mul(u.uFlakeRepeat)
      // Offset per instance, or all 1800 tiles wear an identical flake pattern
      // and the grid reads as printed wallpaper.
      .add(vec2(hash(instanceIndex), hash(instanceIndex.add(9871))));

    const flake = texture(flakeNormal, tileUv).xyz.mul(2).sub(1);
    const flakeRough = texture(flakeRoughness, tileUv).x;

    /**
     * A few degrees of per-tile lean, on top of the per-fragment flakes.
     *
     * Under an orthographic camera a distant environment doesn't care where a
     * tile *is*, only which way it faces — so a grid of perfectly flat tiles
     * with identical normals reflects one identical direction and settles into
     * one identical colour, which is what makes it read as a painted swatch
     * rather than a hundred small mirrors. Tilting each plate slightly is what
     * real stamped metal does anyway, and it's what breaks the grid up.
     */
    const tilt = vec2(
      hash(instanceIndex.add(31)),
      hash(instanceIndex.add(77)),
    )
      .sub(0.5)
      .mul(u.uTiltJitter);

    /**
     * A gentle dome across each tile — the single thing that makes this read as
     * metal rather than as gold paint.
     *
     * A perfectly flat face has one normal, samples one direction, and comes
     * back one colour; the choice is then between a mirror finish (binary: a
     * tile either catches the key or goes black) and a rough one (everything
     * averages to the same flat cream). Neither looks like metal. A curved face
     * sweeps its normal across the environment and picks up a *gradient* —
     * bright falling to dark within the same tile — which is exactly why a
     * rounded object reads as gold and a flat swatch of the same material
     * doesn't. Two lines of maths stand in for the curvature.
     */
    const dome = uv().sub(0.5).mul(2).mul(u.uCurvature);

    const perturbed = normalize(
      vec3(
        dome.x.add(flake.x.mul(u.uFlakeStrength)).add(tilt.x),
        dome.y.add(flake.y.mul(u.uFlakeStrength)).add(tilt.y),
        // Sign follows the face, so the perturbation leans out of whichever
        // side we're looking at rather than into it.
        select(isBack, float(-1), float(1)),
      ),
    );
    const faceNormal = select(
      isFront.or(isBack),
      perturbed,
      normalLocal,
    ) as Node<"vec3">;

    // Roughness: near-mirror base, modulated by the map. Perfectly uniform
    // roughness is another tell that a surface isn't real.
    const roughness = float(
      select(
        isFront,
        float(0.78),
        select(
          isBack,
          u.uRoughness.add(flakeRough.mul(u.uFlakeRoughness)),
          float(0.38),
        ),
      ),
    ).clamp(0.02, 1);

    return {
      update,
      positionNode: spin(local).add(vec3(cellCentre(), 0)),
      // The normal has to turn with the tile or the lighting won't sell the
      // flip. `normalNode` is read in view space, so the rotated local normal
      // goes through the model-normal matrix on the way out.
      normalNode: transformNormalToView(spin(faceNormal)),
      colorNode: base,
      metalnessNode: metalness,
      roughnessNode: roughness,
      // No emissive term any more. The previous version faked reflections by
      // adding a gradient to emissive, which is why the gold read as coloured
      // plastic: emissive ignores fresnel, ignores roughness, and can't be
      // occluded. The scene's environment map now drives real image-based
      // lighting instead, and metalness routes it through the proper specular
      // path.
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

    /**
     * Park the cursor. `pointermove` only fires while the cursor is *in* the
     * document, so without these the last position sticks and whatever it was
     * over stays flipped forever — leave the window and you leave a permanent
     * gold blot behind. Each of these is a different way to lose the cursor
     * without a final move event:
     *  - `pointerout` with no `relatedTarget`: left the document entirely.
     *  - `blur`: focus went to another window, or the OS took over.
     *  - `visibilitychange`: tab hidden, or the machine slept.
     */
    const park = () => {
      if (pointer.current.x === AWAY) return;
      pointer.current.set(AWAY, AWAY);
      warped.current = true;
    };

    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) park();
    };
    const onVisibility = () => {
      if (document.hidden) park();
    };

    // Listen on the window rather than the element: the canvas doesn't take
    // pointer events, and on the site the copy sitting on top of it would eat
    // them before the section ever saw them.
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    window.addEventListener("blur", park);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", park);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [bounds, viewport.width, viewport.height]);

  const cursorLight = useRef<PointLight>(null);

  useFrame((_, delta) => {
    u.uDt.value = Math.min(delta, MAX_DT);

    // On a teleport the segment collapses to a point, so nothing between the
    // old and new cursor positions gets swept.
    u.uPointerPrev.value.copy(
      warped.current ? pointer.current : u.uPointer.value,
    );
    warped.current = false;
    u.uPointer.value.copy(pointer.current);

    // A specular highlight that travels is one of the strongest metal cues
    // there is — a static one reads as a painted-on shine. Parked far away the
    // light simply stops reaching the grid, so it needs no separate on/off.
    const light = cursorLight.current;
    if (light) {
      light.position.set(
        pointer.current.x,
        pointer.current.y,
        config.cursorLightHeight,
      );
    }

    // `useFrame` runs in the scheduler's update phase, ahead of this canvas's
    // render, so the vertex stage always reads angles the compute pass just
    // wrote.
    renderer.compute(nodes.update);
  });

  return (
    <>
      {/* Deliberately dim. The environment map is doing the lighting now; these
          only keep the dark front faces from crushing to black. */}
      <ambientLight intensity={0.12} />
      <directionalLight position={[2, 3, 6]} intensity={0.5} color="#fff4e0" />

      <pointLight
        ref={cursorLight}
        intensity={config.cursorLight}
        color={config.cursorLightColor}
        distance={0}
        decay={1.6}
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
        />
      </instancedMesh>
    </>
  );
}
