"use client";

import { useFrame, useThree } from "@react-three/fiber/webgpu";
import { useMemo } from "react";
import * as THREE from "three/webgpu";
import {
  cos,
  dot,
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
 * The grain gradient behind the closing CTA, and the demo at
 * /demos/grain-gradient.
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
 * Grayscale by default, and transparent: it lifts the black behind the type
 * rather than painting over it.
 *
 * Every dial is a TSL uniform rather than a constant folded into the graph, so
 * the demo's controls take effect without recompiling the shader on each drag.
 */

export type GrainParams = {
  /** Quantisation steps. Fewer = chunkier banding, more room for stipple. */
  levels: number;
  /** How far a pixel can be pushed across a level boundary. ~1 = fully stippled. */
  grain: number;
  /**
   * Device pixels per grain dot. At 1 the grain lands sub-CSS-pixel on any
   * retina display and averages back into a smooth gradient — a faint sheen
   * rather than grit. Clumping a few pixels per dot is what makes it read.
   */
  grainPx: number;
  /** Grain resamples this many times a second — film, not strobe. */
  grainHz: number;
  /** Width of the falloff ramp. The stipple lives in this band. */
  softness: number;
  /** Peak opacity. The field is transparent so it lifts whatever is behind. */
  intensity: number;
  /** How fast the warp kneads the shape. */
  speed: number;
  /** Below 1 enlarges the blobs, above 1 shrinks them. */
  scale: number;
  /** Radians. */
  rotation: number;
  offsetX: number;
  offsetY: number;
  /** Brightest point of the ramp. */
  light: string;
  /** Where the field bottoms out, before opacity takes it to nothing. */
  dark: string;
};

export const GRAIN_DEFAULTS: GrainParams = {
  levels: 4,
  grain: 1.45,
  grainPx: 2.5,
  grainHz: 12,
  softness: 0.9,
  intensity: 0.46,
  speed: 1,
  scale: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  light: "#adadbd",
  dark: "#1a1a1d",
};

/**
 * Per-pixel white noise, from raw pixel coordinates rather than UVs — grain
 * that scales with geometry reads as texture, not as grain.
 */
function hash(p: Parameters<typeof dot>[0]) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
}

export function GrainField({ params }: { params: GrainParams }) {
  const { viewport } = useThree();

  const u = useMemo(
    () => ({
      time: uniform(0),
      aspect: uniform(1),
      levels: uniform(0),
      grain: uniform(0),
      grainPx: uniform(1),
      grainHz: uniform(1),
      softness: uniform(0),
      intensity: uniform(0),
      speed: uniform(1),
      scale: uniform(1),
      rotation: uniform(0),
      offset: uniform(new THREE.Vector2()),
      light: uniform(new THREE.Color()),
      dark: uniform(new THREE.Color()),
    }),
    [],
  );

  u.aspect.value = viewport.width / viewport.height;
  u.levels.value = params.levels;
  u.grain.value = params.grain;
  u.grainPx.value = params.grainPx;
  u.grainHz.value = params.grainHz;
  u.softness.value = params.softness;
  u.intensity.value = params.intensity;
  u.speed.value = params.speed;
  u.scale.value = params.scale;
  u.rotation.value = params.rotation;
  u.offset.value.set(params.offsetX, params.offsetY);
  u.light.value.set(params.light);
  u.dark.value.set(params.dark);

  useFrame((state) => {
    u.time.value = state.elapsed;
  });

  const { colorNode, opacityNode } = useMemo(() => {
    // Blob centres live in *frame* space — a fraction of the width and height,
    // independent of aspect — so the composition holds whether this is the
    // closer's wide band on a desktop, the same section stacked tall on a
    // phone, or a full-screen demo. Aspect correction happens per-blob below,
    // on the distance, which is what keeps them round without moving them.
    const centred = uv().sub(0.5);

    // Scale, rotate and offset the sample point rather than the blobs — one
    // transform instead of three, and it composes.
    const s = centred.mul(u.scale);
    const c = cos(u.rotation);
    const sn = sin(u.rotation);
    const q = vec2(
      s.x.mul(c).sub(s.y.mul(sn)),
      s.x.mul(sn).add(s.y.mul(c)),
    ).sub(u.offset);

    /** x scaled to match y's physical size, so distances are circular. */
    const round = vec2(u.aspect, 1);
    const t = u.time.mul(u.speed).mul(0.06);

    // Low-frequency warp bends the whole field; the blobs ride on it rather
    // than each being animated separately. Sampled in corrected space so the
    // noise itself doesn't stretch with the viewport.
    const warp = mx_fractal_noise_float(
      vec3(q.mul(round).mul(0.9), t),
      3,
      2,
      0.5,
      1,
    );

    // Warp is added *after* correction — adding it before would stretch the
    // wobble horizontally along with everything else.
    const blob = (cx: number, cy: number, r: number, w: number) =>
      smoothstep(
        r,
        0,
        length(
          q
            .sub(vec2(cx, cy))
            .mul(round)
            .add(vec2(warp.mul(w), warp.mul(w * 0.8))),
        ),
      );

    // Pushed out to the edges rather than centred. The headline sits in the
    // middle of the closing section, and a bright core behind white type costs
    // more than the shape gains.
    const field = blob(-0.26, -0.1, 0.6, 0.34)
      .add(blob(0.24, 0.16, 0.56, 0.3))
      .add(blob(0.04, -0.52, 0.42, 0.26).mul(0.8))
      .clamp(0, 1);

    // Ease the ramp so the mid-tones — where the stipple lives — occupy more of
    // the frame than a linear falloff would give them.
    const half = u.softness.mul(0.48);
    const shaped = smoothstep(
      half.oneMinus().mul(0.5).add(0.01),
      half.add(0.5).clamp(0, 1),
      field,
    );

    // Quantise with noise mixed in *before* rounding. That is the whole trick:
    // pixels sitting near a boundary get pushed either side of it, so the step
    // between levels dissolves into stipple.
    const frame = floor(u.time.mul(u.grainHz));
    const grainCell = floor(screenCoordinate.xy.div(u.grainPx));
    const n = hash(grainCell.add(frame.mul(vec2(37.0, 17.0))));
    const level = floor(
      shaped.mul(u.levels).add(n.sub(0.5).mul(u.grain)),
    ).clamp(0, u.levels);
    const tone = level.div(u.levels);

    return {
      colorNode: mix(u.dark, u.light, tone),
      // Alpha is quantised too, so the grain reads as stipple over whatever is
      // behind rather than as a haze sitting on top of it.
      opacityNode: tone.mul(u.intensity),
    };
  }, [u]);

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

/** In-page version: a secondary canvas behind the closing CTA. */
export function NoiseFieldCanvas() {
  return (
    <SectionCanvas
      className="absolute inset-0"
      orthographic
      camera={{ position: [0, 0, 10], zoom: 1 }}
      // The grain needs a real resample rate to read as grain; at 24 it strobes.
      fps={30}
    >
      <GrainField params={GRAIN_DEFAULTS} />
    </SectionCanvas>
  );
}
