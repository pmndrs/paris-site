"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber/webgpu";

import type { HeroGateController } from "@/lib/hero-gate";

/**
 * Shared clock for the hero entrance.
 * Rendered time and a capped step keep the animation stable.
 */
export const INTRO_COMPLETE = 6.2;
export const LETTER_CHAIN_START = 2.65;
/** The letter chain is past halfway and beginning to settle. */
export const UI_REVEAL_START = 3.72;
/** Let the fully revealed start pose register before motion begins. */
const INTRO_START_BEAT = 0.3;

const MAX_DT = 1 / 20;
/** Run after the gate handoff but before clock consumers such as lettering. */
const INTRO_CLOCK_PRIORITY = 50;

export function IntroClock({
  clock,
  enabled,
  gate,
  onUiReveal,
}: {
  clock: RefObject<number>;
  enabled: boolean;
  /**
   * Optional first-load state machine. It hard-gates warmup, the hidden start
   * pose, overlay exit, and playback. Without it the demo plays immediately.
   */
  gate?: HeroGateController;
  onUiReveal?: () => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const cueSent = useRef(false);
  const beatElapsed = useRef(0);
  // Mounting after the overlay has already exited means this is a client-side
  // return, not the original handoff. Show the final pose instead of replaying.
  const eligibleForPlayback = useRef(
    !gate ||
      gate.getState() === "warming" ||
      gate.getState() === "priming-intro" ||
      gate.getState() === "priming-final" ||
      gate.getState() === "revealing-intro" ||
      gate.getState() === "revealing-final",
  );

  useEffect(() => {
    clock.current = enabled && !gate ? 0 : INTRO_COMPLETE;
    cueSent.current = !enabled;
    if (!enabled) onUiReveal?.();
    // Request one frame so the current machine pose is applied immediately.
    invalidate();
  }, [clock, enabled, gate, invalidate, onUiReveal]);

  useFrame(
    (_, delta) => {
      const revealUi = () => {
        if (cueSent.current) return;
        cueSent.current = true;
        onUiReveal?.();
      };

      if (!enabled) {
        clock.current = INTRO_COMPLETE;
        revealUi();
        if (gate?.getState() === "playing") gate.introFinished();
        return;
      }

      if (gate) {
        const state = gate.getState();

        if (state === "warming") {
          // Final pose rehearsal: compile everything behind an opaque gate.
          clock.current = INTRO_COMPLETE;
          return;
        }

        if (state === "priming-intro" || state === "revealing-intro") {
          // The intro remains exactly at zero through pose confirmation and
          // the entire DOM fade. It cannot advance underneath the overlay.
          clock.current = 0;
          beatElapsed.current = 0;
          cueSent.current = false;
          return;
        }

        if (state === "armed" && eligibleForPlayback.current) {
          clock.current = 0;
          beatElapsed.current += Math.min(delta, MAX_DT);
          if (beatElapsed.current >= INTRO_START_BEAT) gate.beatElapsed();
          return;
        }

        if (state !== "playing" || !eligibleForPlayback.current) {
          clock.current = INTRO_COMPLETE;
          revealUi();
          if (state === "armed" || state === "playing") gate.bypass();
          return;
        }
      }

      clock.current = Math.min(
        INTRO_COMPLETE,
        clock.current + Math.min(delta, MAX_DT),
      );

      if (clock.current >= UI_REVEAL_START) revealUi();
      if (clock.current >= INTRO_COMPLETE) gate?.introFinished();
    },
    { phase: "update", priority: INTRO_CLOCK_PRIORITY },
  );

  return null;
}
