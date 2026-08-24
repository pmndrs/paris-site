"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber/webgpu";

/**
 * Shared clock for the hero entrance.
 * Rendered time and a capped step keep the animation stable.
 */
export const INTRO_COMPLETE = 6.2;
export const LETTER_CHAIN_START = 2.65;
/** The letter chain is past halfway and beginning to settle. */
export const UI_REVEAL_START = 3.72;

const MAX_DT = 1 / 20;

export function IntroClock({
  clock,
  enabled,
  hold,
  onUiReveal,
}: {
  clock: RefObject<number>;
  enabled: boolean;
  /**
   * While set, park the clock at the final pose instead of playing: the
   * dress rehearsal behind the loading screen that compiles every pipeline
   * the entrance will need. `WarmupProbe` clears it and rewinds the clock.
   */
  hold?: RefObject<boolean>;
  onUiReveal?: () => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const cueSent = useRef(false);

  useEffect(() => {
    clock.current = enabled && !hold?.current ? 0 : INTRO_COMPLETE;
    cueSent.current = !enabled;
    if (!enabled) onUiReveal?.();
    // Request one frame so reduced motion reaches the final state.
    invalidate();
  }, [clock, enabled, hold, invalidate, onUiReveal]);

  useFrame((_, delta) => {
    if (!enabled) {
      clock.current = INTRO_COMPLETE;
      return;
    }

    if (hold?.current) {
      clock.current = INTRO_COMPLETE;
      return;
    }

    clock.current = Math.min(
      INTRO_COMPLETE,
      clock.current + Math.min(delta, MAX_DT),
    );

    if (!cueSent.current && clock.current >= UI_REVEAL_START) {
      cueSent.current = true;
      onUiReveal?.();
    }
  });

  return null;
}
