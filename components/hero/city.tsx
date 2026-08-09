"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";

import { rgbToHex, type TodKeyframe } from "@/lib/time-of-day";

/**
 * The low block city the tower stands in.
 *
 * Scale matters more than detail here: Paris is a low, even skyline and the
 * tower has to dwarf it, so blocks top out around 4 units against the tower's
 * 10. Everything is kept out of a plaza around the base and out of the corridor
 * between the camera and the tower, so nothing crosses in front of the subject.
 */

/** Deterministic PRNG — the same hash the original design doc used. */
function rand(n: number, seed: number) {
  const x = Math.sin(seed * 9301 + n * 49297) * 233280;
  return x - Math.floor(x);
}

interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  shade: number;
}

/** Height bands, each an InstancedMesh so window density can track height. */
const TIERS = [
  { max: 2.2, rows: 3 },
  { max: 3.8, rows: 5 },
  { max: Infinity, rows: 8 },
];

const PLAZA_RADIUS = 18;
/** Nothing nearer the camera than this, so the tower is never occluded. */
const NEAR_LIMIT = 5;

function buildBlocks(): Block[][] {
  const tiers: Block[][] = TIERS.map(() => []);
  let n = 0;

  for (let gx = -16; gx <= 16; gx++) {
    for (let gz = -18; gz <= 1; gz++) {
      n++;
      const x = gx * 5 + (rand(n, 1) - 0.5) * 2.2;
      const z = gz * 5 + (rand(n, 2) - 0.5) * 2.2;

      if (z > NEAR_LIMIT) continue;
      if (Math.hypot(x, z) < PLAZA_RADIUS) continue;
      if (Math.hypot(x, z + 28) > 88) continue;

      // Slightly taller blocks toward the middle distance, like a real skyline.
      const bias = THREE.MathUtils.clamp(1 - Math.hypot(x, z) / 60, 0, 1);
      const h = 0.7 + rand(n, 3) ** 1.5 * (2.0 + bias * 3.6);

      const block: Block = {
        x,
        z,
        w: 1.9 + rand(n, 4) * 1.7,
        d: 1.9 + rand(n, 5) * 1.7,
        h,
        shade: 0.78 + rand(n, 6) * 0.44,
      };

      tiers[TIERS.findIndex((t) => h < t.max)].push(block);
    }
  }

  return tiers;
}

/** Small canvas of lit windows, used as the emissive map on side faces. */
function makeWindowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 32, 32);

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = y * 8 + x;
      // Most windows are dark; a lit minority is what reads as "evening".
      if (rand(i, 11) < 0.72) continue;
      const warm = 200 + Math.round(rand(i, 12) * 55);
      ctx.fillStyle = `rgb(${warm}, ${Math.round(warm * 0.79)}, ${Math.round(warm * 0.52)})`;
      ctx.fillRect(x * 4 + 1.4, y * 4 + 1.4, 1.2, 1.5);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function Tier({
  blocks,
  rows,
  texture,
  tod,
}: {
  blocks: Block[];
  rows: number;
  texture: THREE.Texture;
  tod: TodKeyframe;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const map = useMemo(() => {
    const t = texture.clone();
    t.needsUpdate = true;
    // Repeat is per-tier, which is the whole reason tiers exist — windows stay
    // roughly square instead of stretching with the building.
    t.repeat.set(1.6, rows / 4);
    return t;
  }, [texture, rows]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const m = new THREE.Matrix4();
    const colour = new THREE.Color();

    blocks.forEach((b, i) => {
      m.compose(
        new THREE.Vector3(b.x, b.h / 2, b.z),
        new THREE.Quaternion(),
        new THREE.Vector3(b.w, b.h, b.d),
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colour.setScalar(b.shade));
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks]);

  const base = rgbToHex(tod.cityColor);

  // BoxGeometry exposes six groups (+x, -x, +y, -y, +z, -z). Windows go on the
  // four walls only — an emissive map on the roof makes the city glow from above.
  const walls = [0, 1, 4, 5];

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]}>
      <boxGeometry args={[1, 1, 1]} />
      {[0, 1, 2, 3, 4, 5].map((slot) =>
        walls.includes(slot) ? (
          <meshStandardMaterial
            key={slot}
            attach={`material-${slot}`}
            color={base}
            roughness={0.88}
            metalness={0.04}
            emissive="#ffbe78"
            emissiveMap={map}
            emissiveIntensity={tod.windowLight * 0.55}
          />
        ) : (
          <meshStandardMaterial
            key={slot}
            attach={`material-${slot}`}
            color={base}
            roughness={0.95}
            metalness={0.02}
          />
        ),
      )}
    </instancedMesh>
  );
}

export function City({ tod }: { tod: TodKeyframe }) {
  const tiers = useMemo(() => buildBlocks(), []);
  const texture = useMemo(() => makeWindowTexture(), []);

  // No ground plane on purpose. The canvas is transparent, so a lit plane would
  // paint a hard horizon line straight across the CSS sky behind it. Without it
  // the blocks' rooflines are the horizon, and the sky shows through between them.
  return (
    <group>
      {tiers.map((blocks, i) => (
        <Tier
          key={i}
          blocks={blocks}
          rows={TIERS[i].rows}
          texture={texture}
          tod={tod}
        />
      ))}
    </group>
  );
}
