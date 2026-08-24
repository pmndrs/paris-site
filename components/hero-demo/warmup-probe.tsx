"use client";

import { useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber/webgpu";

/** A frame slower than this still counts as jank, not just a slow machine. */
const SETTLED_DELTA = 0.04;
/** Consecutive smooth frames before the scene counts as warmed up. */
const SETTLED_STREAK = 12;
/** Give up and reveal after this long — late jank beats a stranded page. */
const WARMUP_BUDGET = 8;

/**
 * Reports when the scene is ready to be shown without jank.
 *
 * Mounted inside the canvas's `Suspense` boundary, so measuring starts only
 * once every asset in the tree (tower model, glyph font, sky) has resolved.
 * While `hold` keeps the intro parked at its final pose, every draw the
 * entrance will ever issue is on screen — behind the opaque loading screen —
 * so the WebGPU pipeline compiles all land during this rehearsal. Frames
 * stay long as long as compiles stall the queue; once a streak of them
 * comes in at speed, the rehearsal is over: rewind the clock, lift the gate,
 * and the entrance plays from the top against warm pipelines.
 *
 * `invalidate` keeps demand-mode frameloops ticking until the streak lands.
 * `useFrame` never fires while the render job is paused, which is why the
 * loading screen keeps its own escape hatches.
 */
export function WarmupProbe({
  clock,
  hold,
  onReady,
}: {
  clock: RefObject<number>;
  hold: RefObject<boolean>;
  onReady: () => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const elapsed = useRef(0);
  const streak = useRef(0);
  const done = useRef(false);

  useFrame((_, delta) => {
    if (done.current) return;

    elapsed.current += delta;
    streak.current = delta <= SETTLED_DELTA ? streak.current + 1 : 0;

    if (streak.current < SETTLED_STREAK && elapsed.current < WARMUP_BUDGET) {
      invalidate();
      return;
    }

    done.current = true;
    if (hold.current) {
      hold.current = false;
      // Roll the entrance from the top, now that its pipelines are warm.
      clock.current = 0;
    }
    onReady();
  });

  return null;
}
