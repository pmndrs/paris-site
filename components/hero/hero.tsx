"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { LogoFull } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { HERO, REGISTER_URL } from "@/lib/content";
import { skyGradient, todAt } from "@/lib/time-of-day";

// WebGL has no business running during SSR, and the scene is the heaviest thing
// on the page — keep it out of the server bundle entirely.
const ParisScene = dynamic(
  () => import("./paris-scene").then((m) => m.ParisScene),
  { ssr: false },
);

/** PMNDRS runs vertically, split across two layers that sandwich the canvas. */
const LETTERS = ["P", "M", "N", "D", "R", "S"];

function Logotype({ layer }: { layer: "back" | "front" }) {
  // Back layer paints P·N·R, front layer paints M·D·S. The tower renders
  // between them, so the wordmark threads through the ironwork.
  const visible = layer === "back" ? [0, 2, 4] : [1, 3, 5];

  return (
    <div
      className="absolute inset-0 flex translate-x-[11%] flex-col items-center justify-start font-bold leading-[0.7] tracking-[-0.04em] text-white"
      style={{ fontSize: "clamp(56px, 7.4vw, 95px)" }}
      aria-hidden
    >
      {LETTERS.map((letter, i) => (
        <span
          key={letter + i}
          className={visible.includes(i) ? undefined : "opacity-0"}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

export function Hero() {
  const [tod, setTod] = useState(12);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
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

  const palette = useMemo(() => todAt(tod / 100), [tod]);

  return (
    <section
      ref={sectionRef}
      id="top"
      className="relative flex h-svh min-h-[700px] flex-col overflow-hidden bg-background"
    >
      {/* z-0 — sky. Stays in the DOM so it can sit behind the wordmark. */}
      <div
        className="absolute inset-0 transition-[background] duration-200"
        style={{ background: skyGradient(palette) }}
      />

      {/* z-30 — top bar */}
      <div className="relative z-30 flex items-center justify-between gap-5 px-4 py-5 font-mono text-[11px] font-medium tracking-[0.11em] text-white uppercase sm:px-8">
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

      {/* The wordmark box, sized as in the design doc. */}
      <div
        className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2"
        style={{
          top: "clamp(40px, 7vh, 80px)",
          width: "min(430px, 74vw)",
          height: "min(660px, 64vh)",
        }}
      >
        <Logotype layer="back" />
      </div>

      {/* z-20 — the scene, transparent, sandwiched between the two type layers. */}
      <div className="absolute inset-0 z-20">
        <ParisScene
          value={tod}
          reducedMotion={reducedMotion}
          paused={!onScreen}
        />
      </div>

      <div
        className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2"
        style={{
          top: "clamp(40px, 7vh, 80px)",
          width: "min(430px, 74vw)",
          height: "min(660px, 64vh)",
        }}
      >
        <Logotype layer="front" />
      </div>

      {/* Grounds the copy against the city. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[340px] bg-gradient-to-b from-transparent to-black to-66%" />

      <div className="relative z-30 mt-auto flex flex-wrap items-end justify-between gap-7 px-4 pb-6 sm:px-8">
        <div className="max-w-2xl">
          <div className="mb-3.5 font-mono text-[11px] font-medium tracking-[0.13em] text-white/60 uppercase">
            {HERO.kicker}
          </div>
          <h1
            className="font-semibold tracking-[-0.035em] text-white"
            style={{ fontSize: "clamp(34px, 5.4vw, 58px)", lineHeight: 1.02 }}
          >
            {HERO.title[0]}
            <br />
            {HERO.title[1]}
          </h1>
          <p className="mt-4 max-w-[520px] text-[15px] leading-[1.55] text-white/70 lg:text-base">
            {HERO.lede}
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button asChild size="lg">
              <a href={REGISTER_URL}>Register on threejs.paris</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#two-days">See the two days</a>
            </Button>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2.5 pb-1">
          <label
            htmlFor="tod"
            className="font-mono text-[10px] tracking-[0.11em] text-white/55"
          >
            TIME OF DAY — {palette.phase}
          </label>
          <Slider
            id="tod"
            value={[tod]}
            onValueChange={([v]) => setTod(v)}
            min={0}
            max={100}
            step={1}
            aria-label="Time of day"
            className="w-[170px]"
          />
        </div>
      </div>
    </section>
  );
}
