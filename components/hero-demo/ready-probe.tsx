"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber/webgpu";

/**
 * Frames that must complete before the canvas counts as presentable. The
 * first frame is what triggers the WebGPU pipeline compiles and it blocks on
 * them, so by the time callback N runs, frames 1..N-1 have reached the
 * screen with every load-critical pipeline built.
 */
const SETTLED_FRAMES = 3;

/**
 * Reports when the scene has really rendered.
 *
 * Mounted inside the canvas's `Suspense` boundary, so the frame count starts
 * only once every asset in the tree (tower model, glyph font, sky) has
 * resolved. `invalidate` keeps demand-mode frameloops ticking until the count
 * lands. `useFrame` never fires while the render job is paused, which is why
 * the loading screen keeps its own escape hatches.
 */
export function ReadyProbe({ onReady }: { onReady: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const frames = useRef(0);
  const done = useRef(false);

  useFrame(() => {
    if (done.current) return;
    if (frames.current >= SETTLED_FRAMES) {
      done.current = true;
      onReady();
      return;
    }
    frames.current += 1;
    invalidate();
  });

  return null;
}
