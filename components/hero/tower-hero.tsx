"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber/webgpu";
import { solarPosition } from "@pmndrs/sky";

import { DepthAttachmentSync } from "@/components/three/depth-attachment-sync";
import {
  PARIS_ATMOSPHERE_DEFAULTS,
  PARIS_CLOUD_DEFAULTS,
  PARIS_HOMEPAGE_CITY_DEFAULTS,
} from "@/components/hero-demo/paris-defaults";
import {
  PARIS_LATITUDE,
  TowerCanvas,
} from "@/components/hero-demo/tower-canvas";
import { heroGate } from "@/lib/hero-gate";
import { HERO_DAY_OF_YEAR } from "@/lib/time-of-day";
import { useWebGPU } from "@/lib/use-webgpu";

/** This canvas's id, which is also the id of the render job r3f registers. */
const PRIMARY = "main";

// Dark blue ground reflectance keeps the horizon saturated.
// Stable identity prevents unnecessary sky rebakes.
const HERO_GROUND_ALBEDO = { x: 0.025, y: 0.075, z: 0.18 } as const;
/**
 * Idle this canvas without touching the frame loop.
 *
 * `frameloop` is not per-canvas — r3f writes it to the scheduler singleton,
 * and "demand" stops the one RAF the whole page shares, freezing every other
 * canvas (pmndrs/react-three-fiber#3852). So idling happens at the job level:
 * `pauseJob` skips this canvas's render pass while everything else keeps
 * being driven. Carried over verbatim from the previous hero scene.
 */
function useIdleWhenHidden(paused: boolean) {
  // `useFrame` without a callback is the documented scheduler-access form,
  // and it works *outside* `<Canvas>` too: registration is skipped and the
  // returned `scheduler` is the same global singleton `getScheduler()`
  // resolves to — the frame loop is page-wide, not per-canvas, which is the
  // whole reason job-level pausing works from up here.
  const { scheduler } = useFrame();

  useEffect(() => {
    if (!scheduler.getJobIds().includes(PRIMARY)) return;

    if (paused) scheduler.pauseJob(PRIMARY);
    else scheduler.resumeJob(PRIMARY);

    // Never leave it parked on unmount — the job outlives this effect.
    return () => {
      if (scheduler.getJobIds().includes(PRIMARY)) scheduler.resumeJob(PRIMARY);
    };
  }, [paused, scheduler]);
}

/**
 * The scheduler's fps-cap tolerance: a tick is due when at least
 * `minInterval - 1` ms have passed, so a 120Hz display runs every 2nd tick
 * (true 60) and a 60Hz display runs every tick (a no-op).
 */
const STEP_MIN_MS = 1000 / 60 - 1;

/**
 * Drive the shared frame loop at 60Hz instead of the display's refresh rate.
 *
 * The render job is already fps-capped at 60, but the scheduler's own rAF
 * loop still ticks at the display rate — on ProMotion phones every update
 * job runs twice per presented frame, for CPU (and battery) that never
 * reaches the screen. Capping update jobs per-job is not safe: they receive
 * the global loop delta and would animate in slow motion. Stepping the whole
 * loop is: `scheduler.step(t)` derives delta from the timestamps it is
 * handed, so skipping ticks yields correct wall-clock deltas for every job.
 *
 * The canvas passes `frameloop="never"` while this drives (the reduced-motion
 * path keeps "demand" and this hook stays disarmed). Section canvases pass no
 * `frameloop`, and r3f only writes the scheduler singleton when the prop is
 * explicitly set — so nothing restarts the built-in loop, and their jobs are
 * simply driven by this stepper.
 */
function useSixtyHzLoop(enabled: boolean) {
  const { scheduler } = useFrame();

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = -Infinity;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < STEP_MIN_MS) return;
      last = t;
      scheduler.step(t);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // Hand the loop back on unmount — pages without the hero (the demos)
      // pass no `frameloop` and would otherwise stay frozen. When this
      // cleanup runs because reduced motion flipped, the canvas (a child,
      // whose effects run first) has already written "demand"; leave it.
      if (scheduler.frameloop === "never") scheduler.frameloop = "always";
    };
  }, [enabled, scheduler]);
}

// --- Promo capture sequence -------------------------------------------------
// Hardcoded for the conference promo video: open on the bare Eiffel tower,
// then layer the scene back on one feature at a time with a caption for each.
//
// The invariant carried over from the original sequence: the whole pipeline
// (shadow map, window emissives, AO, bloom, FSR, lettering) is compiled once
// up front, and every "enable" is a runtime uniform ramp — never a graph
// rebuild. Toggling structural props (fsr/ao/bloom/postFx/lettering/shadows/
// windows) mid-run rebuilds pipelines while frames are in flight and crashes
// WebGPU ("buffer used in submit while destroyed"). Only *mounting new
// meshes* (buildings, grass) is additionally safe: a one-time additive
// compile, no teardown.
//
// Steps, advanced manually with the arrow keys (→ next, ← back). Grass is
// part of the baseline and present from the start:
//   0 eiffel tower (unlabeled — the capture opens clean) · 1 instanced mesh
//   2 lights · 3 pmndrs · 4 ao · 5 bloom · 6 shadows
//   7 fsr (caption only — FSR is structural, it runs from the start)
// Each step from 1 on shows its label in the caption pill.
/** How long each effect takes to blend from zero to its target. */
const PROMO_BLEND_MS = 1600;
const PROMO_CAPTIONS = [
  null, // eiffel tower + grass baseline, no pill over the opening frame
  "instanced mesh", // the buildings: one cube drawn ~10k times
  "lights",
  "pmndrs",
  "ao",
  "bloom",
  "shadows",
  "fsr",
] as const;
const PROMO_LAST_STEP = PROMO_CAPTIONS.length - 1;

/** Smoothstep ease shared by every effect blend. */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Manual step control for the capture: ArrowRight advances to the next step
 * (easing its blend from 0 to 1 over `PROMO_BLEND_MS` so uniform-driven
 * layers dissolve in) and ArrowLeft steps back (snapping blends settled, so
 * the retreat is an immediate cut). Stepping back unmounts mesh layers
 * (buildings, grass) — that is safe; the compiled-once discipline only
 * forbids toggling the structural FX props.
 *
 * The listener attaches on mount so no press is ever lost to a race; presses
 * are simply ignored until `started` (the intro gate settling) so the capture
 * cannot be advanced mid-boot. `started` is read through a ref, keeping one
 * stable listener and the step counter alive across the flip.
 */
function usePromoSequence(started: boolean) {
  const [step, setStep] = useState(0);
  const [blend, setBlend] = useState(1);
  const startedRef = useRef(started);
  startedRef.current = started;

  useEffect(() => {
    let raf = 0;
    let current = 0;

    const rampIn = () => {
      cancelAnimationFrame(raf);
      const startedAt = performance.now();
      const ramp = (now: number) => {
        const t = Math.min(1, (now - startedAt) / PROMO_BLEND_MS);
        setBlend(ease(t));
        if (t < 1) raf = requestAnimationFrame(ramp);
      };
      setBlend(0);
      raf = requestAnimationFrame(ramp);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Hold every press until the intro gate has settled.
      if (!startedRef.current) return;
      // Leave the keys alone while a control (e.g. the time dial) has focus.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          /^(input|textarea|select|button)$/i.test(target.tagName) ||
          target.getAttribute("role") === "slider")
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        if (current >= PROMO_LAST_STEP) return;
        event.preventDefault();
        current += 1;
        setStep(current);
        // Ease the newly enabled layer in from zero.
        rampIn();
      } else if (event.key === "ArrowLeft") {
        if (current <= 0) return;
        event.preventDefault();
        current -= 1;
        setStep(current);
        // Settle instantly on the previous step — no reverse animation.
        cancelAnimationFrame(raf);
        setBlend(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, []);

  return { step, blend };
}

/** Static fallback shown when WebGPU is unavailable. */
function FallbackPoster() {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{
        top: "clamp(40px, 7vh, 80px)",
        width: "min(430px, 74vw)",
        height: "min(660px, 64vh)",
        backgroundImage: "url(/concept/tower-cutout.png)",
        backgroundSize: "contain",
        backgroundPosition: "center bottom",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

/**
 * The real hero: the verified `TowerCanvas` (FSR3 + bloom + sky fog, dusk at
 * Paris solar position, PMNDRS lettering in-scene) as the site's primary
 * canvas.
 *
 * What changed against the old low-poly hero: the sky is the @pmndrs/sky
 * atmosphere rather than a CSS gradient, so the canvas paints every pixel
 * once loaded and the DOM wordmark sandwich is retired — the lettering lives
 * in the scene now, billboarded through the tower. The CSS gradient behind
 * the canvas still earns its keep as the backdrop during the shader compile
 * (the canvas is transparent until the first frame lands).
 */
export function TowerHero({
  /** Time of day, 0..100, matching the hero slider. */
  value,
  reducedMotion = false,
  /** Hero is off-screen — skip its render job, leave the loop alone. */
  paused = false,
  onUiReveal,
}: {
  value: number;
  reducedMotion?: boolean;
  paused?: boolean;
  onUiReveal?: () => void;
}) {
  useIdleWhenHidden(paused);
  const support = useWebGPU();
  // Matches the canvas's `frameloop`: "never" is only passed when this arms.
  useSixtyHzLoop(!reducedMotion && support === "yes");
  // The sequence starts once the intro has settled, so the recording opens on
  // the bare scene rather than mid-boot.
  const [promoStarted, setPromoStarted] = useState(false);
  const { step: promoStep, blend } = usePromoSequence(promoStarted);

  useEffect(() => {
    if (support !== "no") return;
    // Canvas always mounts its fallback. Capability detection avoids
    // bypassing the gate after a successful WebGPU boot.
    heroGate.bypass();
  }, [support]);

  useEffect(() => {
    const syncUi = () => {
      const state = heroGate.getState();
      if (state === "revealing-final" || state === "settled") {
        onUiReveal?.();
        setPromoStarted(true);
      }
    };

    const unsubscribe = heroGate.subscribe(syncUi);
    syncUi();
    return unsubscribe;
  }, [onUiReveal]);

  if (support === "checking") return null;
  if (support === "no") return <FallbackPoster />;

  // Per-step blend: 0 before the step, easing 0→1 during it, 1 after it.
  const stepBlend = (s: number) =>
    promoStep > s ? 1 : promoStep === s ? blend : 0;

  // Promo sequence, promo-backup style: the whole pipeline is compiled once
  // at boot (shadows, windows, AO, bloom, FSR, lettering all structurally on)
  // and every "enable" is either a mesh mount or a runtime uniform ramp.
  // Grass is baseline scenery, mounted from the start.
  //   0 tower+grass · 1 buildings (mount) · 2 lights (windowsBlend ramp)
  //   3 pmndrs (reveal) · 4 ao (aoBlend ramp) · 5 bloom (strength ramp)
  //   6 shadows (shadow-intensity ramp) · 7 fsr (caption only)
  const showBuildings = promoStep >= 1;
  const windowsBlend = stepBlend(2);
  const revealLettering = promoStep >= 3;
  const aoBlend = stepBlend(4);
  const bloomBlend = stepBlend(5);
  const shadowBlend = stepBlend(6);
  const caption = PROMO_CAPTIONS[promoStep];

  // Slider fraction → solar hours for the sky.
  const hours = (value / 100) * 24;

  // Drive exposure from the same solar elevation as the sky. The old
  // hour-based curve followed summer sunrise and sunset, so its golden-hour
  // grade no longer lined up with the dial after the solar date changed.
  const { elevation } = solarPosition({
    timeOfDay: hours,
    latitude: PARIS_LATITUDE,
    dayOfYear: HERO_DAY_OF_YEAR,
  });
  const t = Math.min(1, Math.max(0, elevation / 24));
  const daylight = t * t * (3 - 2 * t);
  const exposure = 40 + (6 - 40) * daylight;

  return (
    <div className="absolute inset-0">
      <TowerCanvas
        {...PARIS_HOMEPAGE_CITY_DEFAULTS}
        {...PARIS_ATMOSPHERE_DEFAULTS}
        {...PARIS_CLOUD_DEFAULTS}
        // Still weather for visitors who asked for reduced motion.
        cloudWind={reducedMotion ? 0 : PARIS_CLOUD_DEFAULTS.cloudWind}
        canvasId={PRIMARY}
        timeOfDay={hours}
        dayOfYear={HERO_DAY_OF_YEAR}
        exposure={exposure}
        // A clear, saturated "bleu nuit" horizon lets the stars stay crisp.
        turbidity={0}
        groundAlbedo={HERO_GROUND_ALBEDO}
        // Face the morning equinox arc reached halfway through the dial cycle.
        // A small offset keeps the sun beside the tower instead of behind it.
        // The shared demo keeps its neutral 0° default.
        initialAzimuthDegrees={268}
        autoRotateSpeed={reducedMotion ? 0 : 1}
        // "never": useSixtyHzLoop drives the scheduler manually at 60Hz.
        frameloop={reducedMotion ? "demand" : "never"}
        intro={!reducedMotion}
        dpr={[1, 2]}
        renderScale={1.5}
        // --- Promo staged buildup, compiled-once discipline. Every structural
        // switch (shadows, windows, postFx, ao, bloom, fsr, lettering) stays on
        // from boot; the sequence below only mounts meshes and ramps uniforms.
        tower
        // Grass is baseline scenery, on from the start. Buildings mount on
        // their step (an additive one-time compile — safe mid-run) with the
        // pop-up replay.
        grass
        buildings={showBuildings}
        buildingsReplayIntro={!reducedMotion}
        // "lights": windows stay compiled; their emissive light level ramps.
        windows
        windowsBlend={windowsBlend}
        // "shadows": the map renders from boot; its darkness ramps in.
        shadows
        keyShadowIntensity={shadowBlend}
        // "pmndrs": lettering stays compiled; its reveal is armed on the step.
        // Reduced motion shows it static from the start.
        lettering
        letteringReplayIntro={reducedMotion ? undefined : revealLettering}
        // "fsr" is caption-only: FSR is structural (render resolution and the
        // temporal resolver), so it runs from the start.
        // "ao"/"bloom" ramp their runtime uniforms; no SSGI, no clouds.
        clouds={false}
        postFx
        fsr
        ssgi={false}
        ao
        aoBlend={aoBlend}
        bloom
        bloomStrength={0.5 * bloomBlend}
        // No SSGI: skip the widened MRT device limit it would need.
        reserveSsgiHeadroom={false}
        onUiReveal={onUiReveal}
        gate={heroGate}
        canvasStyle={{ pointerEvents: "none" }}
        // No WebGPU: the design doc's original tower plate, placed to match the
        // 3D framing, so the hero still shows a tower.
        fallback={<FallbackPoster />}
      >
        <DepthAttachmentSync />
      </TowerCanvas>

      {/* Promo caption for the current step, pinned to the bottom edge. */}
      {caption && (
        <div
          key={promoStep}
          className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center"
        >
          <span className="rounded-full border border-white/20 bg-black/75 px-7 py-3 font-mono text-[22px] font-semibold tracking-[0.13em] text-white uppercase shadow-lg backdrop-blur-md">
            {caption}
          </span>
        </div>
      )}
    </div>
  );
}
