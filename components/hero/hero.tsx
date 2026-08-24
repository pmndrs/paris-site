"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

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

export function Hero() {
  // Default to the graded look: 85/100 ≈ 20.4h, dusk at Paris in June.
  const [tod, setTod] = useState(85);
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

      {/* z-20 — the scene. Transparent until the sky's first frame lands, so
          the CSS gradient above covers the shader-compile window; the PMNDRS
          lettering renders in-scene rather than as DOM layers. */}
      <div className="absolute inset-0 z-20">
        <TowerHero
          value={tod}
          reducedMotion={reducedMotion}
          paused={!onScreen}
        />
      </div>

      {/* Grounds the copy against the city. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[340px] bg-gradient-to-b from-transparent to-black to-66%" />

      <div className="relative z-30 mt-auto px-4 pb-6 sm:px-8">
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

      <TimeDial
        value={tod}
        onValueChange={setTod}
        phase={palette.phase}
        aria-label="Time of day"
        className="absolute right-4 bottom-6 z-40 sm:right-8"
      />
    </section>
  );
}
