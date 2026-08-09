"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { Leva } from "leva";

import type { PerfSample } from "./perf-probe";

/**
 * `@react-three/fiber/webgpu` touches `localStorage` at module scope, so nothing
 * 3D can appear in the server render graph — same client-only boundary the rest
 * of the site uses via `components/three/scenes.tsx`.
 */
const HeroDemoScene = dynamic(
  () => import("./scene").then((m) => m.HeroDemoScene),
  { ssr: false },
);

const EMPTY: PerfSample = {
  fps: 0,
  ms: 0,
  drawCalls: 0,
  triangles: 0,
  hasControls: false,
  cameraPos: [0, 0, 0],
  target: [0, 0, 0],
  distance: 0,
  near: 0,
  far: 0,
};

const vec = (v: [number, number, number]) => v.join(", ");

export function HeroDemo() {
  const [perf, setPerf] = useState<PerfSample>(EMPTY);
  const onSample = useCallback((s: PerfSample) => setPerf(s), []);

  return (
    <main className="relative h-svh w-full bg-black">
      <HeroDemoScene onSample={onSample} />

      <Leva collapsed={false} titleBar={{ title: "hero demo" }} />

      <div className="pointer-events-none absolute top-4 left-4 z-10 font-mono text-[11px] leading-relaxed tracking-[0.06em] text-white/70">
        <div className="text-white/40">STAGE 1 — sky</div>
        <div className="mt-1.5 tabular-nums">
          {perf.fps} fps · {perf.ms.toFixed(2)} ms
        </div>
        {/* `renderer.info` reports the last pass, so under the post pipeline
            this is the present quad, not the scene. Kept as a liveness signal. */}
        <div className="tabular-nums text-white/45">
          {perf.drawCalls.toLocaleString()} draws ·{" "}
          {perf.triangles.toLocaleString()} tris <span>(final pass)</span>
        </div>
        <div className="mt-2 text-white/40">
          controls:{" "}
          <span className={perf.hasControls ? "text-white/70" : "text-red-400"}>
            {perf.hasControls ? "yes" : "NONE"}
          </span>
        </div>
        <div className="tabular-nums text-white/45">
          cam [{vec(perf.cameraPos)}]
        </div>
        <div className="tabular-nums text-white/45">
          tgt [{vec(perf.target)}] · dist {perf.distance}
        </div>
        <div className="tabular-nums text-white/45">
          near {perf.near} · far {perf.far}
        </div>
      </div>
    </main>
  );
}
