"use client";

import { useFrame, useThree } from "@react-three/fiber/webgpu";
import { useEffect, useMemo, useRef } from "react";
import {
  color,
  cos,
  float,
  instanceIndex,
  length,
  mix,
  normalLocal,
  positionLocal,
  sin,
  smoothstep,
  uniform,
  varying,
  vec2,
  vec3,
} from "three/tsl";
import { DoubleSide, Vector2 } from "three/webgpu";

import { SectionCanvas } from "./section-canvas";

/**
 * A fine grid of tiles that flip to gold under the cursor.
 *
 * Every tile's position, rotation, normal and material is computed on the GPU
 * from `instanceIndex` — the CPU only ever writes a two-float pointer uniform,
 * so the instance count is close to free. That's the reason this section is the
 * one making the WebGPU argument: the same effect on the WebGL path means
 * writing ~1800 matrices per frame from JavaScript.
 */

const COLS = 56;
const ROWS = 32;
const COUNT = COLS * ROWS;

/** Tile edge as a fraction of the cell, so a hairline gutter shows through. */
const FILL = 0.82;
/** Flip radius, in cells. */
const RADIUS_CELLS = 4.2;

const FRONT = "#15151a";
const GOLD = "#e0b365";

function Grid() {
  const { viewport, renderer } = useThree();

  const uPointer = useMemo(() => uniform(new Vector2(1e6, 1e6)), []);
  const uStep = useMemo(() => uniform(1), []);
  const uTile = useMemo(() => uniform(1), []);
  const uRadius = useMemo(() => uniform(1), []);

  // One cell spans whichever axis needs more coverage, so the grid always
  // overfills the section rather than leaving a margin.
  const step = Math.max(viewport.width / COLS, viewport.height / ROWS);
  uStep.value = step;
  uTile.value = step * FILL;
  uRadius.value = step * RADIUS_CELLS;

  const target = useRef(new Vector2(1e6, 1e6));

  // Read the cursor from the window, not from R3F's pointer events: this canvas
  // is `pointer-events: none` so it never steals clicks or text selection from
  // the copy sitting on top of it.
  useEffect(() => {
    const el = renderer?.domElement;
    if (!el) return;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      target.current.set((nx * viewport.width) / 2, (ny * viewport.height) / 2);
    };

    // Park the cursor far away when it leaves, so tiles settle back to front.
    const onLeave = () => target.current.set(1e6, 1e6);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [renderer, viewport.width, viewport.height]);

  useFrame((_, delta) => {
    // Ease toward the cursor so the flip trails it instead of snapping.
    const k = 1 - Math.pow(0.001, delta);
    uPointer.value.lerp(target.current, k);
  });

  const nodes = useMemo(() => {
    const ix = float(instanceIndex.mod(COLS));
    const iy = float(instanceIndex.div(COLS));

    // Centre the grid on the origin.
    const cell = vec2(ix.sub((COLS - 1) / 2), iy.sub((ROWS - 1) / 2));
    const world = cell.mul(uStep);

    const falloff = smoothstep(uRadius, 0, length(world.sub(uPointer)));
    // Carried to the fragment stage once, rather than recomputed there.
    const flip = varying(falloff, "vFlip");

    const angle = falloff.mul(Math.PI);
    const c = cos(angle);
    const s = sin(angle);

    // Rotation about X, written out per component rather than as a matrix —
    // it's three lines and it keeps the generated shader flat.
    const local = positionLocal.mul(uTile);
    const spun = vec3(
      local.x,
      local.y.mul(c).sub(local.z.mul(s)),
      local.y.mul(s).add(local.z.mul(c)),
    );
    const spunNormal = vec3(
      normalLocal.x,
      normalLocal.y.mul(c).sub(normalLocal.z.mul(s)),
      normalLocal.y.mul(s).add(normalLocal.z.mul(c)),
    );

    const gold = smoothstep(0.42, 0.82, flip);

    return {
      positionNode: spun.add(vec3(world, 0)),
      // The normal has to turn with the tile or the lighting won't sell the
      // flip — the back face would stay lit as if it still faced front.
      normalNode: spunNormal,
      colorNode: mix(color(FRONT), color(GOLD), gold),
      metalnessNode: gold.mul(0.94).add(0.04),
      roughnessNode: mix(float(0.82), float(0.15), gold),
    };
  }, [uPointer, uRadius, uStep, uTile]);

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[2, 3, 6]} intensity={2.4} color="#fff4e0" />
      <directionalLight
        position={[-3, -2, 4]}
        intensity={1.1}
        color="#9aa8d0"
      />

      <instancedMesh
        args={[undefined, undefined, COUNT]}
        // Instance transforms live in the shader, so the CPU-side bounding
        // volume is meaningless here.
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshStandardNodeMaterial side={DoubleSide} {...nodes} />
      </instancedMesh>
    </>
  );
}

export function TileGridCanvas() {
  return (
    <SectionCanvas
      className="absolute inset-0"
      orthographic
      camera={{ position: [0, 0, 10], zoom: 1 }}
      fps={45}
    >
      <Grid />
    </SectionCanvas>
  );
}
