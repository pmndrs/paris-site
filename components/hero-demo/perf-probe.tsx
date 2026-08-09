"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber/webgpu";

export interface PerfSample {
  fps: number;
  /** Mean CPU frame time over the sample window, ms. */
  ms: number;
  drawCalls: number;
  triangles: number;
}

/**
 * Frame-time and geometry readout, sampled once a second.
 *
 * Triangle and draw-call counts come from `renderer.info`, and they are the
 * point: the Stage 0 perf work is a claim about how much geometry the frame
 * submits, and `info.render.triangles` is the number that either backs it up or
 * doesn't. FPS alone would hide a vsync ceiling.
 */
export function PerfProbe({ onSample }: { onSample: (s: PerfSample) => void }) {
  const renderer = useThree((state) => state.renderer);
  const frames = useRef(0);
  const accum = useRef(0);
  const report = useRef(onSample);

  useEffect(() => {
    report.current = onSample;
  }, [onSample]);

  useFrame((_, delta) => {
    frames.current += 1;
    accum.current += delta;

    if (accum.current < 1) return;

    const info = (renderer as { info?: { render?: Record<string, number> } })
      .info;

    report.current({
      fps: Math.round(frames.current / accum.current),
      ms: Number(((accum.current / frames.current) * 1000).toFixed(2)),
      drawCalls: info?.render?.drawCalls ?? 0,
      triangles: info?.render?.triangles ?? 0,
    });

    frames.current = 0;
    accum.current = 0;
  });

  return null;
}
