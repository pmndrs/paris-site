"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three/webgpu";

import { rgbToHex, type TodKeyframe } from "@/lib/time-of-day";

/** Overall height in world units. The camera rig is framed around this. */
export const TOWER_HEIGHT = 10;

const LEVELS = 30;
const DECK_HEIGHTS = [0.235, 0.52] as const;

/**
 * Half-width of the square cross-section at normalised height `t`.
 * The exponential is what gives the splayed legs, the waist, and the slim
 * upper shaft in one curve.
 */
function halfWidth(t: number) {
  return 2.15 * Math.exp(-3.2 * t) + 0.1;
}

const CORNERS: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];

/** Corner position at a given normalised height. */
function corner(i: number, t: number) {
  const hw = halfWidth(t);
  const [sx, sz] = CORNERS[i];
  return new THREE.Vector3(sx * hw, t * TOWER_HEIGHT, sz * hw);
}

/**
 * Builds the transform for a box stretched between two points — the primitive
 * every rail and brace in the lattice is made of.
 */
function strut(
  a: THREE.Vector3,
  b: THREE.Vector3,
  thickness: number,
  out: THREE.Matrix4,
) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );
  return out.compose(mid, quat, new THREE.Vector3(thickness, len, thickness));
}

function buildLattice() {
  const matrices: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();

  for (let i = 0; i < LEVELS; i++) {
    const t0 = i / LEVELS;
    const t1 = (i + 1) / LEVELS;

    // Thinner ironwork the higher you go.
    const rail = THREE.MathUtils.lerp(0.13, 0.045, t0);
    const brace = rail * 0.62;

    for (let c = 0; c < 4; c++) {
      const a0 = corner(c, t0);
      const a1 = corner(c, t1);
      matrices.push(strut(a0, a1, rail, m).clone());

      // Cross-bracing on the face between this corner and the next.
      const n0 = corner((c + 1) % 4, t0);
      const n1 = corner((c + 1) % 4, t1);
      matrices.push(strut(a0, n1, brace, m).clone());
      matrices.push(strut(n0, a1, brace, m).clone());
    }
  }

  // Observation decks.
  for (const t of DECK_HEIGHTS) {
    const hw = halfWidth(t) * 1.22;
    matrices.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(0, t * TOWER_HEIGHT, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(hw * 2, 0.16, hw * 2),
      ),
    );
  }

  // Mast above the tip.
  matrices.push(
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, TOWER_HEIGHT + 0.55, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(0.06, 1.1, 0.06),
    ),
  );

  return matrices;
}

export function Tower({ tod }: { tod: TodKeyframe }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrices = useMemo(() => buildLattice(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, matrices.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={rgbToHex(tod.towerColor)}
        metalness={0.22}
        roughness={0.58}
        // Keeps the ironwork off pure black when the sun is down.
        emissive={rgbToHex(tod.towerColor)}
        emissiveIntensity={0.34}
      />
    </instancedMesh>
  );
}
