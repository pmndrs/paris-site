"use client";

import { useFrame, useThree } from "@react-three/fiber/webgpu";
import { useMemo } from "react";
import {
  dot,
  float,
  floor,
  fract,
  length,
  mix,
  mx_fractal_noise_float,
  screenCoordinate,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

import { SectionCanvas } from "./section-canvas";

/**
 * The grain gradient behind the closing CTA.
 *
 * Two passes, and the second is what gives it the look:
 *
 *  1. A smooth field — a few soft blobs drifting on a slow noise warp, so the
 *     shape kneads rather than pulses.
 *  2. A *dither*, not an overlay. The smooth field is quantised into a handful
 *     of levels with per-pixel noise added before the rounding, so pixels near
 *     a level boundary flip between the two. Grain therefore appears densest in
 *     the falloff and disappears inside the solids and the black — which is the
 *     characteristic of the effect. Laying grain over the top uniformly gives a
 *     dusty photo instead.
 *
 * Grayscale throughout, and transparent: it lifts the black behind the type
 * rather than painting over it.
 */

/** Quantisation steps. Few enough that the stipple has room to show. */
const LEVELS = 4;
/** How far a pixel can be pushed across a level boundary. ~1 = fully stippled. */
const GRAIN = 1.45;
/** Grain resamples this many times a second — film, not strobe. */
const GRAIN_HZ = 12;
/**
 * Device pixels per grain dot. At 1 the grain lands sub-CSS-pixel on any retina
 * display and averages back into a smooth gradient — visible as a faint sheen
 * rather than as grit. Clumping a few pixels per dot is what makes it read.
 */
const GRAIN_PX = 2.5;

/**
 * Per-pixel white noise. Takes raw pixel coordinates, so the grain stays 1:1
 * with the display no matter how the plane is scaled — grain that scales with
 * geometry reads as texture, not as grain.
 */
function hash(p: Parameters<typeof dot>[0]) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
}

function Field() {
  const { viewport } = useThree();

  const uTime = useMemo(() => uniform(0), []);
  const uAspect = useMemo(() => uniform(1), []);

  uAspect.value = viewport.width / viewport.height;

  useFrame((state) => {
    uTime.value = state.elapsed;
  });

  const { colorNode, opacityNode } = useMemo(() => {
    // Aspect-corrected and centred, so blobs stay round on any section width.
    const p = uv().sub(0.5).mul(vec2(uAspect, 1));
    const t = uTime.mul(0.06);

    // Low-frequency warp bends the whole field; the blobs ride on it rather
    // than each being animated separately.
    const warp = mx_fractal_noise_float(vec3(p.mul(0.9), t), 3, 2, 0.5, 1);

    const blob = (cx: number, cy: number, r: number, w: number) =>
      smoothstep(
        r,
        0,
        length(p.sub(vec2(cx, cy)).add(vec2(warp.mul(w), warp.mul(w * 0.8)))),
      );

    // Pushed out to the edges rather than centred. The headline sits in the
    // middle of this section, and a bright core behind white type costs more
    // than the shape gains.
    const field = blob(-0.78, -0.1, 0.6, 0.34)
      .add(blob(0.74, 0.16, 0.56, 0.3))
      .add(blob(0.12, -0.52, 0.42, 0.26).mul(0.8))
      .clamp(0, 1);

    // Ease the ramp so the mid-tones — where the stipple lives — occupy more of
    // the frame than a linear falloff would give them.
    const shaped = smoothstep(0.02, 0.9, field);

    // Quantise with noise mixed in *before* rounding. That is the whole trick:
    // pixels sitting near a boundary get pushed either side of it, so the step
    // between levels dissolves into stipple.
    const cell = floor(uTime.mul(GRAIN_HZ));
    const grainCell = floor(screenCoordinate.xy.div(GRAIN_PX));
    const n = hash(grainCell.add(cell.mul(vec2(37.0, 17.0))));
    const level = floor(
      shaped
        .mul(LEVELS)
        .add(n.sub(0.5).mul(GRAIN)),
    ).clamp(0, LEVELS);
    const q = level.div(float(LEVELS));

    return {
      colorNode: mix(vec3(0.1, 0.1, 0.115), vec3(0.68, 0.68, 0.74), q),
      // Alpha is quantised too, so the grain reads as stipple over whatever is
      // behind rather than as a haze sitting on top of it.
      opacityNode: q.mul(0.46),
    };
  }, [uAspect, uTime]);

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicNodeMaterial
        colorNode={colorNode}
        opacityNode={opacityNode}
        transparent
      />
    </mesh>
  );
}

export function NoiseFieldCanvas() {
  return (
    <SectionCanvas
      className="absolute inset-0"
      orthographic
      camera={{ position: [0, 0, 10], zoom: 1 }}
      // The grain needs a real resample rate to read as grain; at 24 it strobes.
      fps={30}
    >
      <Field />
    </SectionCanvas>
  );
}
