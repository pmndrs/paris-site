"use client";

import { Moon, Sun, SunDim, Sunrise, Sunset } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { phaseFor, SOLAR_ZONES, zoneAt, type Phase } from "@/lib/time-of-day";
import { cn } from "@/lib/utils";

/** A rotary time control with a wrapping value and audible detents. */

const FULL_TURN = 360;
/** Value units between audible detents. */
const DETENT = 4;

const PHASE_ICON: Record<Phase, typeof Sun> = {
  NIGHT: Moon,
  DUSK: Sunset,
  GOLDEN: SunDim,
  DAY: Sun,
};

/** Wraps clockwise and counterclockwise turns into the range [0, 100). */
const wrapValue = (v: number) => ((v % 100) + 100) % 100;

/** Formats dial units as a 24-hour clock. */
const clockLabel = (v: number) => {
  const minutes = Math.round((wrapValue(v) / 100) * 24 * 60) % (24 * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
};

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
  className,
  ...aria
}: {
  value: number;
  onValueChange: (value: number) => void;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const audioRef = useRef<{ ctx: AudioContext; noise: AudioBuffer } | null>(
    null,
  );
  const dragRef = useRef<{
    x: number;
    y: number;
    lastAngle: number | null;
    value: number;
    moved: boolean;
  } | null>(null);
  const lastDetent = useRef(Math.round(value / DETENT));

  useEffect(() => {
    return () => void audioRef.current?.ctx.close();
  }, []);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

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
      valueRef.current = next;
      const detent = Math.round(next / DETENT);
      if (detent !== lastDetent.current) {
        lastDetent.current = detent;
        tick(wrapValue(next));
      }
      // Preserve whole turns for delayed replay.
      onValueChange(next);
    },
    [onValueChange, tick],
  );

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = clientX - drag.x;
      const dy = clientY - drag.y;
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
      if (Math.abs(delta) < 0.001) return;
      drag.moved = true;
      // Keep drag distance unbounded so replay preserves whole turns.
      drag.value += (delta / FULL_TURN) * 100;
      setValue(drag.value);
    },
    [setValue],
  );

  const normalizedValue = wrapValue(value);
  const angle = (normalizedValue / 100) * FULL_TURN;
  const solarHour = (normalizedValue / 100) * 24;
  const activeZone = zoneAt(solarHour);
  // The dial reflects live input while the scene catches up.
  const phase = phaseFor(solarHour);
  // Dawn uses Sunrise because dawn and dusk share a phase.
  const Icon = activeZone?.label === "Dawn" ? Sunrise : PHASE_ICON[phase];

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalizedValue)}
      aria-valuetext={`${clockLabel(normalizedValue)}, ${(
        activeZone?.label ?? phase
      ).toLowerCase()}`}
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
          value: valueRef.current,
          moved: false,
        };
        ref.current?.setPointerCapture(e.pointerId);
        ref.current?.focus();
      }}
      onPointerMove={(e) => {
        if (ref.current?.hasPointerCapture(e.pointerId)) {
          const samples = e.nativeEvent.getCoalescedEvents?.();
          if (samples?.length) {
            for (const sample of samples) {
              updateFromPointer(sample.clientX, sample.clientY);
            }
          } else {
            updateFromPointer(e.clientX, e.clientY);
          }
        }
      }}
      onPointerUp={(e) => {
        const drag = dragRef.current;
        if (!drag || drag.moved) return;

        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) < 4) return;

        const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
        const clicked = wrapValue((degrees / FULL_TURN) * 100);
        // Select the reading nearest the current unwrapped turn.
        const next =
          clicked + Math.round((drag.value - clicked) / 100) * 100;
        setValue(next);
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
        // Home selects midnight and End selects midday on the nearest turn.
        const wrappedJumps: Record<string, number | undefined> = {
          Home: 0, // midnight
          End: 50, // midday
        };
        const step = steps[e.key];
        const wrappedJump = wrappedJumps[e.key];
        const current = valueRef.current;
        const jump =
          wrappedJump === undefined
            ? undefined
            : wrappedJump +
              Math.round((current - wrappedJump) / 100) * 100;
        if (step === undefined && jump === undefined) return;
        e.preventDefault();
        setValue(jump ?? current + (step ?? 0));
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
        {SOLAR_ZONES.map((zone) => {
          const start = (zone.startHour / 24) * 100;
          const length = ((zone.endHour - zone.startHour) / 24) * 100;
          const active = activeZone?.label === zone.label;
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
