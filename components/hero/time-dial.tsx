"use client";

import { Moon, Sun, SunDim, Sunset } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { Phase } from "@/lib/time-of-day";
import { cn } from "@/lib/utils";

/**
 * A rotary replacement for the hero's time-of-day slider.
 *
 * The value stays the slider's 0..100 so `todAt` and the scene props don't
 * move; only the control changes. The needle sweeps 270° with the dead gap
 * at the bottom, like a stove knob, and every few units of travel lands on a
 * detent that ticks — synthesized on the fly so no audio asset ships with
 * the hero.
 */

/** Degrees of needle travel; the remaining 90° gap is centred at the bottom. */
const SWEEP = 270;
/** Value units between audible detents — 25 ticks across the full range. */
const DETENT = 4;

const PHASE_ICON: Record<Phase, typeof Sun> = {
  NIGHT: Moon,
  DUSK: Sunset,
  GOLDEN: SunDim,
  DAY: Sun,
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * One mechanical detent: a bandpassed noise burst (the click's texture) over
 * a low sine knock (its body). Pitch creeps up slightly toward DAY so
 * scrubbing the whole arc reads as a rising scale.
 */
function playClick(ctx: AudioContext, noise: AudioBuffer, t01: number) {
  const now = ctx.currentTime;

  const burst = ctx.createBufferSource();
  burst.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 3200 + t01 * 1400;
  band.Q.value = 1.2;
  const burstGain = ctx.createGain();
  burstGain.gain.setValueAtTime(0.5, now);
  burstGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
  burst.connect(band).connect(burstGain).connect(ctx.destination);
  burst.start(now);

  const knock = ctx.createOscillator();
  knock.type = "sine";
  knock.frequency.value = 260 + t01 * 80;
  const knockGain = ctx.createGain();
  knockGain.gain.setValueAtTime(0.06, now);
  knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
  knock.connect(knockGain).connect(ctx.destination);
  knock.start(now);
  knock.stop(now + 0.04);
}

export function TimeDial({
  value,
  onValueChange,
  phase,
  className,
  ...aria
}: {
  value: number;
  onValueChange: (value: number) => void;
  phase: Phase;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const audioRef = useRef<{ ctx: AudioContext; noise: AudioBuffer } | null>(
    null,
  );
  const lastDetent = useRef(Math.round(value / DETENT));

  useEffect(() => {
    return () => void audioRef.current?.ctx.close();
  }, []);

  // Lazily built inside a user gesture, where autoplay policy allows it.
  const tick = useCallback((v: number) => {
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const noise = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      audioRef.current = { ctx, noise };
    }
    const { ctx, noise } = audioRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    playClick(ctx, noise, v / 100);
  }, []);

  const setValue = useCallback(
    (next: number) => {
      const v = Math.round(clamp(next, 0, 100));
      const detent = Math.round(v / DETENT);
      if (detent !== lastDetent.current) {
        lastDetent.current = detent;
        tick(v);
      }
      if (v !== value) onValueChange(v);
    },
    [value, onValueChange, tick],
  );

  /** Pointer angle from the dial centre → value along the 270° arc. */
  const valueFromPointer = useCallback((e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    // 0° at twelve o'clock, clockwise positive, so the bottom gap is ±180.
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return ((clamp(deg, -SWEEP / 2, SWEEP / 2) + SWEEP / 2) / SWEEP) * 100;
  }, []);

  const angle = -SWEEP / 2 + (clamp(value, 0, 100) / 100) * SWEEP;
  const Icon = PHASE_ICON[phase];

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-valuetext={phase.toLowerCase()}
      aria-orientation="vertical"
      {...aria}
      onPointerDown={(e) => {
        e.preventDefault();
        ref.current?.setPointerCapture(e.pointerId);
        ref.current?.focus();
        setValue(valueFromPointer(e));
      }}
      onPointerMove={(e) => {
        if (ref.current?.hasPointerCapture(e.pointerId)) {
          setValue(valueFromPointer(e));
        }
      }}
      onKeyDown={(e) => {
        const steps: Record<string, number | undefined> = {
          ArrowUp: 2,
          ArrowRight: 2,
          ArrowDown: -2,
          ArrowLeft: -2,
          PageUp: 10,
          PageDown: -10,
        };
        const jumps: Record<string, number | undefined> = { Home: 0, End: 100 };
        const step = steps[e.key];
        const jump = jumps[e.key];
        if (step === undefined && jump === undefined) return;
        e.preventDefault();
        setValue(jump ?? value + (step ?? 0));
      }}
      className={cn(
        "relative size-14 cursor-pointer touch-none rounded-full border border-white/25 bg-white/5 select-none",
        "transition-colors hover:border-white/50 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none",
        className,
      )}
    >
      {/* Quarter-arc tick marks, matching the four keyframes. */}
      <svg
        viewBox="0 0 56 56"
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const a = ((-SWEEP / 2 + t * SWEEP) * Math.PI) / 180;
          const sin = Math.sin(a);
          const cos = Math.cos(a);
          return (
            <line
              key={t}
              x1={28 + 22 * sin}
              y1={28 - 22 * cos}
              x2={28 + 25 * sin}
              y2={28 - 25 * cos}
              stroke="rgb(255 255 255 / 0.25)"
              strokeWidth={1}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* The needle. No transition — it tracks the pointer 1:1. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ transform: `rotate(${angle}deg)` }}
      >
        <div className="absolute top-[4px] left-1/2 h-[7px] w-[2px] -translate-x-1/2 rounded-full bg-white" />
      </div>

      <Icon
        className="pointer-events-none absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-white/80"
        strokeWidth={1.75}
        aria-hidden
      />
    </div>
  );
}
