"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three/webgpu";

/**
 * Faraz's block city, ported from `threejs-conf-pmndrs/src/Buildings.tsx`.
 *
 * The distribution maths is his, unchanged — that is the authored look. What
 * changed is the cost of drawing it, which is where the demo's framerate went:
 *
 * 1. Trees were `<sphereGeometry args={[1]} />`. That default is 32×16 segments
 *    — 960 triangles — times 20,000 instances, for ~19.2 M triangles of
 *    shrubbery. They are ~8px on screen. Now an icosahedron at detail 1 (80
 *    tris), a ~12× reduction that is invisible at this size.
 * 2. His tree loop computed `spread` and `height` and then never applied them —
 *    `dummy.scale.set(...)` was commented out, so every tree was an identical
 *    unit sphere. The variation was written and thrown away; now it is applied.
 * 3. Trees cast shadows into a 2048² map. 20,000 shadow-casting spheres buy
 *    nothing at this scale — they receive, they no longer cast.
 *
 * Note on `frustumCulled`: he had it off, and it stays off. Each of these is a
 * *single* instanced mesh whose bounding sphere spans the whole 400-unit city,
 * so culling is all-or-nothing and never triggers while the city is in frame.
 * Turning it on would look like a fix and do nothing. Real culling here would
 * mean splitting into LOD rings, which is a bigger change than this port.
 */

/**
 * Deterministic PRNG (mulberry32), replacing the original's `Math.random()`.
 *
 * Two reasons. The React Compiler's `react-hooks/purity` rule rejects impure
 * calls during render and it is right to — these run inside `useMemo`, so a
 * dropped memo silently reshuffles the entire city. And more practically: every
 * stage of this demo is measured against the previous one, which is meaningless
 * if the scene is a different random city each reload. Same seed, same Paris.
 */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CITY_SEED = 0x9e3779b9;
const TREE_SEED = 0x85ebca6b;

type BuildingsProps = {
  count?: number;
  lowRiseCount?: number;
  treeCount?: number;
  innerRadius?: number;
  outerRadius?: number;
  /** Trees cast shadows. Off by default — see the note above. */
  treeShadows?: boolean;
};

export function Buildings({
  count = 300,
  lowRiseCount = 10000,
  treeCount = 20000,
  innerRadius = 12,
  outerRadius = 400,
  treeShadows = false,
}: BuildingsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const treeRef = useRef<THREE.InstancedMesh>(null);

  const total = count + lowRiseCount;

  const instances = useMemo(() => {
    const random = makeRng(CITY_SEED);
    const dummy = new THREE.Object3D();
    const matrices: THREE.Matrix4[] = [];

    const spanRadius = (bias: number) => {
      const angle = random() * Math.PI * 2;
      const t = Math.pow(random(), bias);
      const radius = innerRadius + t * (outerRadius - innerRadius);
      return {
        radius,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      };
    };

    // Tall / landmark high-rises: sparse and confined to the far distance.
    // They only spawn in the outer band of the ring so the foreground stays
    // low-rise and the skyline rises up behind it.
    const highRiseStart = innerRadius + (outerRadius - innerRadius) * 0.55;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const radius =
        highRiseStart +
        Math.pow(random(), 0.5) * (outerRadius - highRiseStart);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const distanceFactor =
        (radius - innerRadius) / (outerRadius - innerRadius);
      const sizeScale = THREE.MathUtils.lerp(1, 2.4, distanceFactor);
      const width = THREE.MathUtils.lerp(1.5, 8, random()) * sizeScale;
      const depth = THREE.MathUtils.lerp(1.5, 8, random()) * sizeScale;
      const height =
        THREE.MathUtils.lerp(10, 30, Math.pow(random(), 1.2)) *
        THREE.MathUtils.lerp(0.8, 1.6, distanceFactor);

      dummy.position.set(x, height / 2, z);
      dummy.scale.set(width, height, depth);
      dummy.rotation.y = random() * Math.PI * 2;
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }

    // Haussmann-style low-rise: dense carpet of small, uniform-height blocks.
    for (let i = 0; i < lowRiseCount; i++) {
      const { radius, x, z } = spanRadius(0.85);
      const distanceFactor =
        (radius - innerRadius) / (outerRadius - innerRadius);
      const sizeScale = THREE.MathUtils.lerp(0.5, 2, distanceFactor);
      const width = THREE.MathUtils.lerp(1.2, 3.5, random()) * sizeScale;
      const depth = THREE.MathUtils.lerp(1.2, 3.5, random()) * sizeScale;
      // Fairly consistent low height with slight variation, like Paris blocks.
      const height =
        THREE.MathUtils.lerp(2, 4, random()) *
        THREE.MathUtils.lerp(0.6, 1.4, distanceFactor);

      dummy.position.set(x, height / 2, z);
      dummy.scale.set(width, height, depth);
      dummy.rotation.y = random() * Math.PI * 2;
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }

    return matrices;
  }, [count, lowRiseCount, innerRadius, outerRadius]);

  const trees = useMemo(() => {
    const random = makeRng(TREE_SEED);
    const dummy = new THREE.Object3D();
    const matrices: THREE.Matrix4[] = [];

    for (let i = 0; i < treeCount; i++) {
      const angle = random() * Math.PI * 2;
      const t = Math.pow(random(), 0.85);
      const radius = innerRadius + t * (outerRadius - innerRadius);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const distanceFactor =
        (radius - innerRadius) / (outerRadius - innerRadius);
      const sizeScale = THREE.MathUtils.lerp(0.6, 2, distanceFactor);
      const height = THREE.MathUtils.lerp(1, 3, random()) * sizeScale;
      const spread = THREE.MathUtils.lerp(0.5, 1.1, random()) * sizeScale;

      // Geometry is a unit-radius ball centred on its origin, so lift by half
      // the (scaled) height to sit it on the ground.
      dummy.position.set(x, height / 2, z);
      // Applied, unlike in the original — this is the variation the loop above
      // was already paying to compute.
      dummy.scale.set(spread, height * 0.5, spread);
      dummy.rotation.y = random() * Math.PI * 2;
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }

    return matrices;
  }, [treeCount, innerRadius, outerRadius]);

  const setMatrices = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    meshRef.current = mesh;
    instances.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  const setTreeMatrices = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    treeRef.current = mesh;
    trees.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  return (
    <>
      <instancedMesh
        key={`blocks-${total}`}
        ref={setMatrices}
        args={[undefined, undefined, total]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        {/* `color` prop deliberately unused, as in the original: the materials
            are white and the near-black defaults are dead. Keeping his rendered
            look, not his intended one — Stage 1 relights this anyway. */}
        <meshStandardMaterial color="white" roughness={0.85} metalness={0.1} />
      </instancedMesh>

      <instancedMesh
        key={`trees-${treeCount}`}
        ref={setTreeMatrices}
        args={[undefined, undefined, treeCount]}
        castShadow={treeShadows}
        receiveShadow
        frustumCulled={false}
      >
        {/* 80 triangles, against the 960 of the default sphere. */}
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="white" roughness={0.95} metalness={0} />
      </instancedMesh>
    </>
  );
}
