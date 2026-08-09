"use client";

import { Canvas, EnvironmentMap } from "@react-three/fiber/webgpu";
import { useEffect, useMemo, type RefObject } from "react";
import { ACESFilmicToneMapping } from "three/webgpu";

import { DepthAttachmentSync } from "@/components/three/depth-attachment-sync";
import type { FlipGridConfig } from "@/components/three/flip-grid/config";
import { FlipGrid } from "@/components/three/flip-grid/flip-grid";
import {
  createStudioEnvironment,
  ENV_PRESETS,
} from "@/components/three/flip-grid/studio-env";

/**
 * Builds the studio environment and hands it to the scene.
 *
 * Rebuilt whenever a light changes, which is cheap — 256×128 of CPU-side float
 * maths — but three has to re-run PMREM on the result, so it is deliberately
 * *not* on the per-frame path.
 */
function Studio({ config }: { config: FlipGridConfig }) {
  const texture = useMemo(() => {
    const preset = ENV_PRESETS[config.envPreset];
    // The three intensities are positional slots, not fixed roles: key/kick/fill
    // in the studio, sun/haze/bounce outdoors.
    const [a, b, c] = preset.softboxes;
    return createStudioEnvironment({
      ...preset,
      ground: hexToLinear(config.ground),
      sky: hexToLinear(config.sky),
      softboxes: [
        { ...a, intensity: config.keyIntensity },
        { ...b, intensity: config.kickIntensity },
        { ...c, intensity: config.fillIntensity },
      ],
    });
  }, [
    config.envPreset,
    config.ground,
    config.sky,
    config.keyIntensity,
    config.kickIntensity,
    config.fillIntensity,
  ]);

  // The generator allocates a new DataTexture each time; the old one holds a
  // GPU allocation until it's told to let go.
  useEffect(() => () => texture.dispose(), [texture]);

  return <EnvironmentMap map={texture} environmentIntensity={config.envIntensity} />;
}

/** sRGB hex to the linear triplet the environment builder works in. */
function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return [
    toLinear(((n >> 16) & 255) / 255),
    toLinear(((n >> 8) & 255) / 255),
    toLinear((n & 255) / 255),
  ];
}

/**
 * The demo's own canvas.
 *
 * On the site this scene will mount inside a `SectionCanvas`, which refuses to
 * come up until the hero has registered as the primary and then borrows its
 * renderer. There is no hero here, so the demo declares a plain independent
 * canvas instead — same scene, its own renderer.
 */
export function FlipGridScene({
  config,
  bounds,
}: {
  config: FlipGridConfig;
  bounds: RefObject<HTMLElement | null>;
}) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], zoom: 1 }}
      dpr={[1, 2]}
      // Odd/fractional drawing buffers desync the depth attachment from the
      // swap chain — see DepthAttachmentSync.
      forceEven
      renderer={{
        alpha: true,
        antialias: true,
        // The environment is HDR on purpose — softboxes sit well above 1 so a
        // mirror-flat tile has something with real range to reflect. Without a
        // tone map every one of those clips to flat white and the gold loses
        // both its colour and its highlight shape.
        toneMapping: ACESFilmicToneMapping,
      }}
      style={{ pointerEvents: "none" }}
    >
      <DepthAttachmentSync />
      <Studio config={config} />
      {/* Remounting on a resolution change is deliberate: the storage buffer is
          sized to cols × rows, and tearing it down is far simpler to reason
          about than resizing it in place. */}
      <FlipGrid
        key={`${config.cols}x${config.rows}`}
        config={config}
        bounds={bounds}
      />
    </Canvas>
  );
}
