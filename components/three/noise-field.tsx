"use client";

import { useFrame, useThree } from "@react-three/fiber/webgpu";
import { useMemo } from "react";
import {
  length,
  mix,
  mx_fractal_noise_float,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

import { SectionCanvas } from "./section-canvas";

/**
 * The soft grayscale blob behind the closing CTA.
 *
 * Two bands of fractal noise warp a radial falloff, so the shape drifts and
 * kneads instead of pulsing. Output is greyscale and transparent — it lifts the
 * black background rather than painting over it, which keeps the type on top
 * readable at every point in the loop.
 */

function Field() {
  const { viewport } = useThree();

  const uTime = useMemo(() => uniform(0), []);
  const uAspect = useMemo(() => uniform(1), []);

  uAspect.value = viewport.width / viewport.height;

  useFrame((state) => {
    uTime.value = state.elapsed;
  });

  const { colorNode, opacityNode } = useMemo(() => {
    // Aspect-corrected, centred coordinates so the blob stays round.
    const p = uv().sub(0.5).mul(vec2(uAspect, 1));
    const t = uTime.mul(0.05);

    // Two noise fields at different scales: the first bends the blob's
    // outline, the second breaks up the banding a flat gradient would show.
    const warp = mx_fractal_noise_float(vec3(p.mul(1.15), t), 4, 2, 0.5, 1);
    const grain = mx_fractal_noise_float(
      vec3(p.mul(2.7).add(11.4), t.mul(1.35)),
      3,
      2,
      0.5,
      1,
    );

    const d = length(p.add(vec2(warp.mul(0.34), grain.mul(0.27))));
    const blob = smoothstep(0.62, 0.02, d);

    return {
      colorNode: mix(vec3(0.07, 0.07, 0.085), vec3(0.62, 0.62, 0.68), blob),
      // Grain rides on top of the falloff so the edge dissolves instead of
      // terminating on a clean curve.
      opacityNode: blob.mul(0.5).add(grain.mul(0.05)).clamp(0, 1),
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
      fps={24}
    >
      <Field />
    </SectionCanvas>
  );
}
