"use client";

import dynamic from "next/dynamic";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
} from "react";

import { LogoFull } from "@/components/brand/logo";
import { SectionGate } from "@/components/sections/section-gate";
import { Button } from "@/components/ui/button";
import { TimeDial } from "@/components/hero/time-dial";
import { HERO, REGISTER_URL } from "@/lib/content";
import { skyGradient, todAt } from "@/lib/time-of-day";

// WebGPU has no business running during SSR, and the scene is the heaviest
// thing on the page — keep it out of the server bundle entirely.
//
// This is the verified tower pipeline from the lab (`/demos/paris-hero`), not
// the old low-poly `ParisScene`. The DOM wordmark sandwich is retired with it:
// the sky paints every canvas pixel once loaded, and the PMNDRS lettering now
// lives *inside* the scene, billboarded through the ironwork.
const TowerHero = dynamic(
  () => import("./tower-hero").then((m) => m.TowerHero),
  { ssr: false },
);

const DAY_CYCLE = 100;
const INITIAL_TIME_OF_DAY = 85;
/** Maximum replay speed in dial units per second. */
const REPLAY_UNITS_PER_SECOND = 70;
/** Distance used to brake into the final value. */
const REPLAY_EASE_OUT_UNITS = 12;
const MAX_FRAME_MS = 64;

const wrapTimeOfDay = (value: number) =>
  ((value % DAY_CYCLE) + DAY_CYCLE) % DAY_CYCLE;

/**
 * Replays unwrapped dial input at a bounded speed.
 * Same-direction samples share one endpoint. Direction changes remain queued.
 */
function useTimeOfDayReplay(initial: number, instant: boolean) {
  const [value, setValue] = useState(initial);
  const state = useRef({
    value: initial,
    queue: [] as number[],
    lastFrame: 0,
    frame: 0,
  });

  const step = useCallback(function replayFrame(now: number) {
    const s = state.current;
    let secondsLeft = Math.min(now - s.lastFrame, MAX_FRAME_MS) / 1000;
    s.lastFrame = now;

    while (secondsLeft > 0 && s.queue.length) {
      const target = s.queue[0];
      const distance = target - s.value;
      // Square root scaling models constant braking to zero.
      const speed =
        s.queue.length === 1
          ? REPLAY_UNITS_PER_SECOND *
            Math.min(
              1,
              Math.sqrt(Math.abs(distance) / REPLAY_EASE_OUT_UNITS),
            )
          : REPLAY_UNITS_PER_SECOND;
      const travel = speed * secondsLeft;

      if (Math.abs(distance) <= travel) {
        s.value = target;
        s.queue.shift();
        secondsLeft -= speed ? Math.abs(distance) / speed : secondsLeft;
      } else {
        s.value += Math.sign(distance) * travel;
        secondsLeft = 0;
      }
    }

    setValue(s.value);
    if (s.queue.length) {
      s.frame = requestAnimationFrame(replayFrame);
    } else {
      s.frame = 0;
    }
  }, []);

  const enqueue = useCallback(
    (next: number) => {
      const s = state.current;
      if (instant) {
        cancelAnimationFrame(s.frame);
        s.frame = 0;
        s.queue.length = 0;
        s.value = next;
        setValue(next);
        return;
      }

      const last = s.queue.at(-1) ?? s.value;
      if (Math.abs(next - last) < Number.EPSILON) return;

      const previous =
        s.queue.length > 1 ? s.queue[s.queue.length - 2] : s.value;
      const previousDirection = Math.sign(last - previous);
      const nextDirection = Math.sign(next - last);

      if (s.queue.length && previousDirection === nextDirection) {
        // Same-direction samples share one endpoint.
        s.queue[s.queue.length - 1] = next;
      } else {
        s.queue.push(next);
      }

      if (!s.frame) {
        s.lastFrame = performance.now();
        s.frame = requestAnimationFrame(step);
      }
    },
    [instant, step],
  );

  useEffect(() => {
    if (!instant) return;
    const s = state.current;
    const finalValue = s.queue.at(-1) ?? s.value;
    cancelAnimationFrame(s.frame);
    s.frame = 0;
    s.queue.length = 0;
    s.value = finalValue;
    setValue(finalValue);
  }, [instant]);

  useEffect(() => {
    const s = state.current;
    return () => {
      cancelAnimationFrame(s.frame);
      s.frame = 0;
    };
  }, []);

  return { value, enqueue };
}

const HeroTimeDial = memo(function HeroTimeDial({
  onValueChange,
}: {
  onValueChange: (value: number) => void;
}) {
  const [value, setValue] = useState(INITIAL_TIME_OF_DAY);
  const handleValueChange = useCallback(
    (next: number) => {
      setValue(next);
      onValueChange(next);
    },
    [onValueChange],
  );

  return (
    <div
      data-hero-ui
      data-hero-ui-step="3"
      className="absolute right-4 bottom-6 z-40 sm:right-8"
    >
      <TimeDial
        value={value}
        onValueChange={handleValueChange}
        aria-label="Time of day"
      />
    </div>
  );
});

function TimeOfDayExperience({
  reducedMotion,
  onScreen,
  onUiReveal,
}: {
  reducedMotion: boolean;
  onScreen: boolean;
  onUiReveal: () => void;
}) {
  const { value: tod, enqueue } = useTimeOfDayReplay(
    INITIAL_TIME_OF_DAY,
    reducedMotion,
  );
  const palette = useMemo(() => todAt(tod / DAY_CYCLE), [tod]);

  return (
    <>
      {/* Covers the canvas while its shaders compile. */}
      <div
        className="absolute inset-0"
        style={{ background: skyGradient(palette) }}
      />

      <div className="absolute inset-0 z-20">
        <TowerHero
          value={wrapTimeOfDay(tod)}
          reducedMotion={reducedMotion}
          paused={!onScreen}
          onUiReveal={onUiReveal}
        />
      </div>

      <HeroTimeDial onValueChange={enqueue} />
    </>
  );
}

export function Hero() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);
  // The scene's frame callback only flips one DOM attribute. Keeping this cue
  // outside React avoids reconciling the entire hero during a busy GPU frame.
  const revealUi = useCallback(() => {
    const root = sectionRef.current;
    if (root?.dataset.heroUiState === "out") {
      root.dataset.heroUiState = "in";
    }
  }, []);

  const settleUiLayers = useCallback(
    (event: ReactAnimationEvent<HTMLElement>) => {
      const target = event.target;
      if (
        event.animationName === "hero-ui-arrive" &&
        target instanceof HTMLElement &&
        target.dataset.heroUiStep === "3"
      ) {
        // Release the compositor layers after the last stagger has landed.
        event.currentTarget.dataset.heroUiState = "settled";
      }
    },
    [],
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReducedMotion(query.matches);
      // The canvas replays when motion is re-enabled; reset the DOM cue too.
      if (sectionRef.current) {
        const nextState = query.matches ? "settled" : "out";
        if (sectionRef.current.dataset.heroUiState !== nextState) {
          sectionRef.current.dataset.heroUiState = nextState;
        }
      }
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Stop driving the render loop once the hero scrolls away — there is no point
  // burning GPU on a canvas nobody can see.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="top"
      data-hero-ui-state="out"
      onAnimationEnd={settleUiLayers}
      className="relative flex h-svh min-h-[700px] flex-col overflow-hidden bg-background"
    >
      <TimeOfDayExperience
        reducedMotion={reducedMotion}
        onScreen={onScreen}
        onUiReveal={revealUi}
      />

      {/* z-30 — top bar */}
      <div
        data-hero-ui
        data-hero-ui-step="0"
        className="relative z-30 flex items-center justify-between gap-5 px-4 py-5 font-mono text-[11px] font-medium tracking-[0.11em] text-white uppercase sm:px-8"
      >
        <div className="flex min-w-0 items-center gap-4">
          <LogoFull color="currentColor" className="h-4 w-auto shrink-0" />
          <span className="hidden truncate opacity-50 sm:inline">
            Advanced R3F Workshop
          </span>
        </div>
        <a
          href={REGISTER_URL}
          className="rounded-md border border-white/30 px-3 py-1.5 whitespace-nowrap text-white transition-colors hover:border-white/60"
        >
          Register
        </a>
      </div>

      {/* Grounds the copy against the city. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[340px] bg-gradient-to-b from-transparent to-black to-66%" />

      <div className="relative z-30 mt-auto px-4 pb-6 sm:px-8">
        <div className="max-w-2xl">
          <div
            data-hero-ui
            data-hero-ui-step="1"
          >
            <div className="mb-3.5 font-mono text-[11px] font-medium tracking-[0.13em] text-white/60 uppercase">
              {HERO.kicker}
            </div>
            <h1
              className="font-semibold tracking-[-0.035em] text-white"
              style={{
                fontSize: "clamp(34px, 5.4vw, 58px)",
                lineHeight: 1.02,
              }}
            >
              {HERO.title[0]}
              <br />
              {HERO.title[1]}
            </h1>
            <p className="mt-4 max-w-[520px] text-[15px] leading-[1.55] text-white/70 lg:text-base">
              {HERO.lede}
            </p>
          </div>
          <div
            data-hero-ui
            data-hero-ui-step="2"
            className="mt-5 flex flex-wrap gap-2.5"
          >
            <Button asChild size="lg">
              <a href={REGISTER_URL}>Register on threejs.paris</a>
            </Button>
            {/* Only when there is a two-days section to land on. The short
                version ships it off, and the hero runs on Register alone. */}
            <SectionGate id="two-days">
              <Button asChild size="lg" variant="outline">
                <a href="#two-days">See the two days</a>
              </Button>
            </SectionGate>
          </div>
        </div>
      </div>
    </section>
  );
}
