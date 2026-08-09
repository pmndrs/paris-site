"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/webgpu";
import * as THREE from "three/webgpu";

import type { TodKeyframe } from "@/lib/time-of-day";

const COUNT = 420;
const RADIUS = 150;

/** Deterministic PRNG — the same hash the original design doc used. */
function rand(n: number, seed: number) {
  const x = Math.sin(seed * 9301 + n * 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Star dome. Stands in for the design doc's 16 twinkling CSS "glints", which do
 * not survive the move to 3D — these sit in the scene and parallax with the
 * camera instead of being pinned to the viewport.
 *
 * Positions come from a seeded hash rather than Math.random so the field is
 * identical on every load and across the preview page's frames.
 */
export function Stars({ tod }: { tod: TodKeyframe }) {
  const ref = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      // Upper hemisphere only, biased away from the horizon where fog sits.
      const theta = rand(i, 1) * Math.PI * 2;
      const phi = Math.acos(rand(i, 2) * 0.92 + 0.04);
      const r = RADIUS * (0.85 + rand(i, 3) * 0.15);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 8;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  useFrame((state) => {
    const points = ref.current;
    if (!points) return;
    const material = points.material as THREE.PointsMaterial;
    // Collective shimmer — cheaper than per-point twinkle and reads the same
    // at this density.
    const shimmer = 0.85 + Math.sin(state.elapsed * 0.7) * 0.15;
    material.opacity = tod.starOpacity * shimmer;
    points.rotation.y = state.elapsed * 0.006;
  });

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color="#ffffff"
        size={1.15}
        sizeAttenuation={false}
        transparent
        depthWrite={false}
        opacity={tod.starOpacity}
      />
    </points>
  );
}
