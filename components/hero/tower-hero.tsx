"use client";

import { useEffect } from "react";
import { getScheduler } from "@react-three/fiber/webgpu";

import { DepthAttachmentSync } from "@/components/three/depth-attachment-sync";
import { TowerCanvas } from "@/components/hero-demo/tower-canvas";

/** This canvas's id, which is also the id of the render job r3f registers. */
const PRIMARY = "main";

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
  useEffect(() => {
    const scheduler = getScheduler();
    if (!scheduler.getJobIds().includes(PRIMARY)) return;

    if (paused) scheduler.pauseJob(PRIMARY);
    else scheduler.resumeJob(PRIMARY);

    // Never leave it parked on unmount — the job outlives this effect.
    return () => {
      if (scheduler.getJobIds().includes(PRIMARY)) scheduler.resumeJob(PRIMARY);
    };
  }, [paused]);
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
}: {
  value: number;
  reducedMotion?: boolean;
  paused?: boolean;
}) {
  useIdleWhenHidden(paused);

  // Slider fraction → solar hours for the sky.
  const hours = (value / 100) * 24;

  // First-pass auto-exposure: the scene is graded at 40 for dusk/night, but
  // full daylight at that exposure blows out. Fade toward a daylight stop
  // around midday; the sky applies exposure through a live uniform, so this
  // costs nothing per change.
  const daylight = Math.max(0, 1 - Math.abs(hours - 13) / 6);
  const exposure = 40 + (12 - 40) * daylight;

  return (
    <TowerCanvas
      canvasId={PRIMARY}
      timeOfDay={hours}
      exposure={exposure}
      autoRotateSpeed={reducedMotion ? 0 : 1}
      frameloop={reducedMotion ? "demand" : "always"}
      canvasStyle={{ pointerEvents: "none" }}
      // No WebGPU: the design doc's original tower plate, placed to match the
      // 3D framing, so the hero still shows a tower.
      fallback={
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
      }
    >
      <DepthAttachmentSync />
    </TowerCanvas>
  );
}
