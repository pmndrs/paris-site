"use client";

import { Moon, Sun, SunDim, Sunset } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { Phase } from "@/lib/time-of-day";
import { cn } from "@/lib/utils";

/** A rotary time control with a wrapping value and audible detents. */

const FULL_TURN = 360;
/** Value units between audible detents. */
const DETENT = 4;

/** Local solar hours for dawn, dusk, and golden light in Paris on June 25. */
const BEAUTY_ZONES = [
  { label: "Dawn", startHour: 3.24, endHour: 4.05, color: "#c4b5fd" },
  {
    label: "Morning golden hour",
    startHour: 4.05,
    endHour: 4.78,
    color: "#fde68a",
  },
  {
    label: "Evening golden hour",
    startHour: 19.29,
    endHour: 20.02,
    color: "#f59e0b",
  },
  { label: "Dusk", startHour: 20.02, endHour: 20.84, color: "#a78bfa" },
] as const;

const PHASE_ICON: Record<Phase, typeof Sun> = {
  NIGHT: Moon,
  DUSK: Sunset,
  GOLDEN: SunDim,
  DAY: Sun,
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Wraps clockwise and counterclockwise turns into the range [0, 100). */
const wrapValue = (v: number) => ((v % 100) + 100) % 100;

/** Plays a noise click over a sine knock with pitch based on the dial value. */
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
  const dragRef = useRef<{
    x: number;
    y: number;
    lastAngle: number | null;
    value: number;
  } | null>(null);
  const lastDetent = useRef(Math.round(value / DETENT));

  useEffect(() => {
    return () => void audioRef.current?.ctx.close();
  }, []);

  // Create the audio context during a user gesture to satisfy autoplay policy.
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
      const v = clamp(next, 0, 100);
      const detent = Math.round(v / DETENT);
      if (detent !== lastDetent.current) {
        lastDetent.current = detent;
        tick(v);
      }
      if (v !== value) onValueChange(v);
    },
    [value, onValueChange, tick],
  );

  const updateFromPointer = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      // Wait for a stable angle when a drag starts near the center.
      if (Math.hypot(dx, dy) < 4) return;

      // Unwrap the clockwise angle so crossing zero produces a small delta.
      const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (drag.lastAngle === null) {
        drag.lastAngle = angle;
        return;
      }

      let delta = angle - drag.lastAngle;
      if (delta > 180) delta -= FULL_TURN;
      if (delta < -180) delta += FULL_TURN;

      drag.lastAngle = angle;
      // Keep drag distance unbounded and wrap only the emitted value.
      drag.value += (delta / FULL_TURN) * 100;
      setValue(wrapValue(drag.value));
    },
    [setValue],
  );

  const normalizedValue = wrapValue(value);
  const angle = (normalizedValue / 100) * FULL_TURN;
  const solarHour = (normalizedValue / 100) * 24;
  const activeBeautyZone =
    BEAUTY_ZONES.find(
      (zone) => solarHour >= zone.startHour && solarHour <= zone.endHour,
    ) ?? null;
  const Icon = PHASE_ICON[phase];

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-valuetext={
        activeBeautyZone
          ? `${phase.toLowerCase()}, ${activeBeautyZone.label.toLowerCase()}`
          : phase.toLowerCase()
      }
      aria-orientation="vertical"
      {...aria}
      onPointerDown={(e) => {
        e.preventDefault();
        const rect = ref.current!.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const dx = e.clientX - x;
        const dy = e.clientY - y;
        dragRef.current = {
          x,
          y,
          lastAngle:
            Math.hypot(dx, dy) < 4
              ? null
              : (Math.atan2(dx, -dy) * 180) / Math.PI,
          value,
        };
        ref.current?.setPointerCapture(e.pointerId);
        ref.current?.focus();
      }}
      onPointerMove={(e) => {
        if (ref.current?.hasPointerCapture(e.pointerId)) {
          updateFromPointer(e);
        }
      }}
      onLostPointerCapture={() => {
        dragRef.current = null;
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
        "relative isolate size-14 shrink-0 cursor-pointer touch-none rounded-full border border-white/25 bg-white/5 select-none",
        "transition-colors hover:border-white/50 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none",
        className,
      )}
      style={{ contain: "layout style" }}
    >
      {/* Day quadrants and solar lighting zones. */}
      <svg
        viewBox="0 0 56 56"
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden
      >
        {BEAUTY_ZONES.map((zone) => {
          const start = (zone.startHour / 24) * 100;
          const length = ((zone.endHour - zone.startHour) / 24) * 100;
          const active = activeBeautyZone?.label === zone.label;
          return (
            <circle
              key={zone.label}
              cx={28}
              cy={28}
              r={23}
              pathLength={100}
              fill="none"
              stroke={zone.color}
              strokeWidth={active ? 4 : 3}
              strokeLinecap="round"
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-start}
              transform="rotate(-90 28 28)"
              opacity={active ? 1 : 0.62}
            />
          );
        })}

        {[0, 0.25, 0.5, 0.75].map((t) => {
          const a = (t * FULL_TURN * Math.PI) / 180;
          const sin = Math.sin(a);
          const cos = Math.cos(a);
          return (
            <line
              key={t}
              x1={28 + 21 * sin}
              y1={28 - 21 * cos}
              x2={28 + 25 * sin}
              y2={28 - 25 * cos}
              stroke="rgb(255 255 255 / 0.32)"
              strokeWidth={1}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* The needle tracks the pointer without interpolation. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          transform: `translateZ(0) rotate(${angle}deg)`,
          willChange: "transform",
        }}
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
