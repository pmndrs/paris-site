"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber/webgpu";

/**
 * One clock for the whole hero entrance.
 *
 * It advances by rendered time rather than wall time, so a background tab does
 * not return to an animation that finished without ever drawing. The timestep
 * cap also keeps the letter springs stable after a long frame.
 */
export const INTRO_COMPLETE = 6.2;
export const LETTER_CHAIN_START = 2.65;
/** The letter chain is past halfway and beginning to settle. */
export const UI_REVEAL_START = 3.72;

const MAX_DT = 1 / 20;

export function IntroClock({
  clock,
  enabled,
  onUiReveal,
}: {
  clock: RefObject<number>;
  enabled: boolean;
  onUiReveal?: () => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const cueSent = useRef(false);

  useEffect(() => {
    clock.current = enabled ? 0 : INTRO_COMPLETE;
    cueSent.current = !enabled;
    if (!enabled) onUiReveal?.();
    // Reduced motion switches the canvas to demand mode. Request one frame so
    // every animated object sees the completed clock and snaps to its rest pose.
    invalidate();
  }, [clock, enabled, invalidate, onUiReveal]);

  useFrame((_, delta) => {
    if (!enabled) {
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
