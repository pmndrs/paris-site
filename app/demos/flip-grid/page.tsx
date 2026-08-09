"use client";

import { Leva, useControls, folder } from "leva";
import dynamic from "next/dynamic";
import { useRef } from "react";

import { FLIP_GRID_DEFAULTS } from "@/components/three/flip-grid/config";
import { useWebGPU } from "@/lib/use-webgpu";

// `@react-three/fiber/webgpu` touches `localStorage` at module scope, so it can
// never appear in the server render graph.
const FlipGridScene = dynamic(
  () => import("./scene").then((m) => m.FlipGridScene),
  { ssr: false },
);

const d = FLIP_GRID_DEFAULTS;

export default function FlipGridDemo() {
  const bounds = useRef<HTMLDivElement>(null);
  const support = useWebGPU();

  // One Leva folder per demo. The panel is a DOM overlay with a global store,
  // so it is entirely indifferent to how many canvases are on the page —
  // namespacing is all it takes to keep demos from colliding.
  const config = useControls("flip grid", {
    grid: folder({
      cols: { value: d.cols, min: 8, max: 120, step: 1 },
      rows: { value: d.rows, min: 6, max: 80, step: 1 },
      fill: { value: d.fill, min: 0.3, max: 1, step: 0.01 },
      thickness: { value: d.thickness, min: 0.01, max: 0.5, step: 0.005 },
    }),
    cursor: folder({
      radius: { value: d.radius, min: 0.5, max: 12, step: 0.1 },
      hold: { value: d.hold, min: 0, max: 10, step: 0.1 },
    }),
    spring: folder({
      stiffness: { value: d.stiffness, min: 5, max: 300, step: 1 },
      damping: { value: d.damping, min: 0.5, max: 60, step: 0.5 },
      massJitter: { value: d.massJitter, min: 0, max: 6, step: 0.05 },
    }),
    faces: folder({
      front: d.front,
      back: d.back,
      edge: d.edge,
      goldRoughness: { value: d.goldRoughness, min: 0, max: 1, step: 0.01 },
    }),
    environment: folder({
      ground: d.ground,
      sky: d.sky,
      strip: d.strip,
      stripHeight: { value: d.stripHeight, min: -1, max: 1, step: 0.01 },
      stripWidth: { value: d.stripWidth, min: 0.01, max: 1, step: 0.01 },
      envStrength: { value: d.envStrength, min: 0, max: 4, step: 0.05 },
    }),
  });

  return (
    <main className="relative min-h-svh bg-[#08080b] text-white">
      <Leva collapsed={false} />

      <div ref={bounds} className="absolute inset-0">
        {support === "yes" ? (
          <FlipGridScene config={config} bounds={bounds} />
        ) : null}
      </div>

      <div className="pointer-events-none relative z-10 p-8">
        <div className="font-mono text-[11px] tracking-[0.13em] text-white/40 uppercase">
          demo · flip grid
        </div>
        <p className="mt-3 max-w-[38ch] text-[15px] leading-[1.6] text-white/55">
          {support === "checking"
            ? "Checking for WebGPU…"
            : support === "no"
              ? "This demo needs WebGPU — the whole simulation is a compute pass over a storage buffer, so there is no WebGL path to fall back to."
              : "Sweep the cursor across the grid. Tiles flip to gold and hold the pose before falling back."}
        </p>
      </div>
    </main>
  );
}
