"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import { useLocalNodes } from "@react-three/fiber/webgpu";
import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

import { PARK_RING_PATH_INNER } from "./geography";
import {
  GRASS_MID_COLOR,
  GRASS_TIP_COLOR,
  PARK_COLOR,
} from "./terrain-palette";

const GRASS_SEED = 0x7f4a7c15;
const PATH_MARGIN = 0.55;
const PARK_SURFACE_Y = 0.07;

function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two crossed, tapered ribbons keep each blade visible from every orbit. */
function makeBladeGeometry() {
  const positions = new Float32Array([
    // X ribbon: narrow through the middle, then lean gently along +Z.
    -0.5, 0, 0,
    0.5, 0, 0,
    -0.28, 0.56, 0.04,
    0.28, 0.56, 0.04,
    0, 1, 0.14,
    // Z ribbon: the same profile, leaning in a different direction.
    0, 0, -0.5,
    0, 0, 0.5,
    -0.04, 0.56, -0.28,
    -0.04, 0.56, 0.28,
    -0.14, 1, 0,
  ]);
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    0.18, 0.56,
    0.82, 0.56,
    0.5, 1,
    0, 0,
    1, 0,
    0.18, 0.56,
    0.82, 0.56,
    0.5, 1,
  ]);
  const indices: number[] = [];
  for (const offset of [0, 5]) {
    const front = [
      offset, offset + 1, offset + 3,
      offset, offset + 3, offset + 2,
      offset + 2, offset + 3, offset + 4,
    ];
    indices.push(...front);
    // Explicit reverse winding keeps both faces visible without DoubleSide's
    // back-face normal flip, which made alternate cards almost black.
    for (let i = 0; i < front.length; i += 3) {
      indices.push(front[i], front[i + 2], front[i + 1]);
    }
  }

  // Grass this small cannot carry stable face lighting after temporal
  // reconstruction. Up-facing normals make every orientation shade like the
  // lawn; the authored color gradient supplies the blade shape instead.
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

function isLawn(x: number, z: number) {
  const radius = Math.hypot(x, z);
  return radius < PARK_RING_PATH_INNER - PATH_MARGIN;
}

function makeGrassNodes(
  toneAttribute: THREE.InstancedBufferAttribute,
) {
  const tone = (
    TSL.instancedBufferAttribute(toneAttribute) as unknown as ReturnType<
      typeof TSL.float
    >
  )
    .sub(0.5)
    .mul(0.08)
    .add(1);
  const gradientY = TSL.uv().y.clamp(0, 1);
  const lowerColor = TSL.mix(
    TSL.color(PARK_COLOR),
    TSL.color(GRASS_MID_COLOR),
    TSL.smoothstep(0.2, 0.78, gradientY),
  );
  const colorNode = TSL.mix(
    lowerColor,
    TSL.color(GRASS_TIP_COLOR).mul(tone),
    TSL.smoothstep(0.64, 1, gradientY),
  );

  return { colorNode };
}

/**
 * A single draw call of static bent ribbons around the tower's round lawn.
 * Placement is deterministic and intentionally broad enough to survive the
 * hero's reduced-resolution temporal reconstruction without shimmering.
 */
export const Grass = memo(function Grass({
  count = 2_400,
}: {
  count?: number;
}) {
  const bladeCount = Math.max(0, Math.floor(count));
  const placement = useMemo(() => {
    const random = makeRng(GRASS_SEED);
    const dummy = new THREE.Object3D();
    const matrices: THREE.Matrix4[] = [];
    const tones: number[] = [];

    // Each accepted point is a tuft rather than a lone blade. A shared height
    // family and green tone tie its members together visually while small
    // offsets and rotations keep it from looking stamped.
    for (
      let attempts = 0;
      matrices.length < bladeCount && attempts < bladeCount * 8;
      attempts++
    ) {
      const centreAngle = random() * Math.PI * 2;
      const centreRadius = Math.sqrt(
        THREE.MathUtils.lerp(
          0,
          (PARK_RING_PATH_INNER - PATH_MARGIN) *
            (PARK_RING_PATH_INNER - PATH_MARGIN),
          random(),
        ),
      );
      const centreX = Math.cos(centreAngle) * centreRadius;
      const centreZ = Math.sin(centreAngle) * centreRadius;
      if (!isLawn(centreX, centreZ)) continue;

      // Broad low-frequency patches leave glimpses of the lawn material and
      // keep the result textural instead of turning the park into a fur mat.
      // A smooth radial fade opens those gaps further near the ring path.
      const patch =
        0.62 +
        Math.sin(centreX * 0.24 + Math.sin(centreZ * 0.11)) * 0.1 +
        Math.sin(centreZ * 0.17 - centreX * 0.08) * 0.07;
      const lawnRadius = PARK_RING_PATH_INNER - PATH_MARGIN;
      const edgeT = THREE.MathUtils.smoothstep(
        centreRadius / lawnRadius,
        0.58,
        1,
      );
      const edgeDensity = THREE.MathUtils.lerp(1, 0.08, edgeT);
      if (random() > patch * edgeDensity) continue;

      const tuftSize = random() < 0.76 ? 2 + Math.floor(random() * 3) : 1;
      const tuftSpread = THREE.MathUtils.lerp(0.22, 0.55, random());
      const tuftHeight = THREE.MathUtils.lerp(
        0.34,
        0.7,
        Math.pow(random(), 1.35),
      );
      const tuftTone = random();

      for (
        let blade = 0;
        blade < tuftSize && matrices.length < bladeCount;
        blade++
      ) {
        const angle = random() * Math.PI * 2;
        const radius =
          blade === 0 ? 0 : THREE.MathUtils.lerp(0.12, tuftSpread, random());
        const x = centreX + Math.cos(angle) * radius;
        const z = centreZ + Math.sin(angle) * radius;
        if (!isLawn(x, z)) continue;

        const height = tuftHeight * THREE.MathUtils.lerp(0.78, 1.14, random());
        const width = THREE.MathUtils.lerp(0.1, 0.17, random());
        const rotation = random() * Math.PI;
        const tone = THREE.MathUtils.clamp(
          tuftTone + THREE.MathUtils.lerp(-0.06, 0.06, random()),
          0,
          1,
        );

        dummy.position.set(x, PARK_SURFACE_Y, z);
        dummy.rotation.set(0, rotation, 0);
        dummy.scale.set(width, height, width);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        tones.push(tone);
      }
    }

    const geometry = makeBladeGeometry();
    const toneAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(tones),
      1,
    );
    geometry.setAttribute("grassTone", toneAttribute);

    return { geometry, matrices, toneAttribute };
  }, [bladeCount]);

  useEffect(() => () => placement.geometry.dispose(), [placement.geometry]);

  const createNodes = useCallback(
    () => makeGrassNodes(placement.toneAttribute),
    [placement.toneAttribute],
  );
  const nodes = useLocalNodes(createNodes);

  const setMatrices = useMemo(() => {
    return (mesh: THREE.InstancedMesh | null) => {
      if (!mesh) return;
      placement.matrices.forEach((matrix, index) => {
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
  }, [placement.matrices]);

  if (placement.matrices.length === 0) return null;

  return (
    <instancedMesh
      key={`grass-${placement.matrices.length}`}
      ref={setMatrices}
      args={[placement.geometry, undefined, placement.matrices.length]}
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardNodeMaterial
        colorNode={nodes.colorNode}
        roughness={1}
        metalness={0}
        side={THREE.FrontSide}
      />
    </instancedMesh>
  );
});
