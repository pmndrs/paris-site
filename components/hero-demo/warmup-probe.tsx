"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber/webgpu";

import type { HeroGateController, HeroGateState } from "@/lib/hero-gate";

/** A frame slower than this still counts as jank, not just a slow machine. */
const SETTLED_DELTA = 0.04;
/** Consecutive smooth frames before the scene counts as warmed up. */
const SETTLED_STREAK = 12;
/** Give up and reveal after this long — late jank beats a stranded page. */
const WARMUP_BUDGET = 8;
/**
 * Keep the gate opaque through two renders of the rewound pose. Besides
 * removing callback-order ambiguity, the extra frame covers queued WebGPU
 * presentation before the DOM overlay begins its fade.
 */
const POSE_CONFIRMATION_FRAMES = 2;
/** Run before the intro and its animated dependants in the update phase. */
const HANDOFF_PRIORITY = 100;

/**
 * Reports when the scene is ready to be shown without jank.
 *
 * Mounted inside the canvas's `Suspense` boundary, so measuring starts only
 * once every asset in the tree (tower model, glyph font, sky) has resolved.
 * While the gate is `warming`, IntroClock parks at the final pose, so every
 * draw the entrance will ever issue is on screen behind the opaque overlay.
 * Once frame pacing settles, the machine moves to `priming-intro`; the clock
 * rewinds, and two finish-phase confirmations must render before the overlay
 * may fade. Playback remains blocked until the overlay reports its own exit.
 *
 * `invalidate` keeps demand-mode frameloops ticking until the streak lands.
 * `useFrame` never fires while the render job is paused, which is why the
 * loading screen keeps its own escape hatches.
 */
export function WarmupProbe({
  gate,
  replayIntro,
}: {
  gate: HeroGateController;
  replayIntro: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const elapsed = useRef(0);
  const streak = useRef(0);
  const confirmationFrames = useRef(0);
  const confirmingState = useRef<HeroGateState | null>(null);

  useFrame(
    (_, delta) => {
      const gateState = gate.getState();

      if (
        gateState === "priming-final" &&
        confirmingState.current !== gateState
      ) {
        // A bypass landed after the intro had rewound. Confirm the restored
        // final pose before allowing the overlay to continue its exit.
        confirmingState.current = gateState;
        confirmationFrames.current = POSE_CONFIRMATION_FRAMES;
        invalidate();
        return;
      }

      if (gateState !== "warming") return;

      elapsed.current += delta;
      streak.current = delta <= SETTLED_DELTA ? streak.current + 1 : 0;

      if (streak.current < SETTLED_STREAK && elapsed.current < WARMUP_BUDGET) {
        invalidate();
        return;
      }

      gate.warmupFinished(replayIntro);
      if (gate.getState() === "priming-intro") {
        // IntroClock runs later in this update phase and applies time zero to
        // every animation subscriber before the renderer sees the scene.
        confirmingState.current = "priming-intro";
        confirmationFrames.current = POSE_CONFIRMATION_FRAMES;
        invalidate();
      }
    },
    { phase: "update", priority: HANDOFF_PRIORITY },
  );

  useFrame(
    () => {
      if (confirmationFrames.current === 0) return;

      if (gate.getState() !== confirmingState.current) {
        confirmationFrames.current = 0;
        confirmingState.current = null;
        return;
      }

      confirmationFrames.current -= 1;
      if (confirmationFrames.current > 0) {
        invalidate();
        return;
      }

      // The renderer has submitted the requested pose twice. Only this event
      // can open the next gate and allow the loading overlay to fade.
      confirmingState.current = null;
      gate.poseRendered();
    },
    { phase: "finish" },
  );

  return null;
}
