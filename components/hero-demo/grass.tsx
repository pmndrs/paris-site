"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
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

/** Two crossed, low-poly triangles keep each blade visible from every orbit. */
function makeBladeGeometry() {
  const positions = new Float32Array([
    -0.5, 0, 0,
    0.5, 0, 0,
    0, 1, 0,
    0, 0, -0.5,
    0, 0, 0.5,
    0, 1, 0,
  ]);
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    0.5, 1,
    0, 0,
    1, 0,
    0.5, 1,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function isLawn(x: number, z: number) {
  const radius = Math.hypot(x, z);
  return radius < PARK_RING_PATH_INNER - PATH_MARGIN;
}

function makeGrassNodes(
  traitAttribute: THREE.InstancedBufferAttribute,
  originAttribute: THREE.InstancedBufferAttribute,
  wind: THREE.UniformNode<"float", number>,
) {
  const trait = TSL.instancedBufferAttribute(
    traitAttribute,
  ) as unknown as ReturnType<typeof TSL.vec4>;
  const origin = TSL.instancedBufferAttribute(
    originAttribute,
  ) as unknown as ReturnType<typeof TSL.vec3>;

  const bladeY = TSL.positionGeometry.y.clamp(0, 1);
  const tipWeight = bladeY.mul(bladeY);
  const clock = TSL.time;

  // Two detuned waves prevent the whole park from bowing in lockstep. The
  // second term crosses the first slightly, producing small travelling gusts.
  const primary = TSL.sin(
    clock
      .mul(1.15)
      .add(origin.x.mul(0.21))
      .add(origin.z.mul(0.13))
      .add(trait.x),
  );
  const gust = TSL.sin(
    clock
      .mul(0.54)
      .sub(origin.x.mul(0.07))
      .add(origin.z.mul(0.18))
      .add(trait.x.mul(1.7)),
  );
  const amount = primary
    .mul(0.68)
    .add(gust.mul(0.32))
    .mul(trait.y)
    .mul(trait.z)
    .mul(wind)
    .mul(tipWeight)
    .mul(0.2);

  const positionNode = TSL.vec3(
    TSL.positionLocal.x.add(amount.mul(0.82)),
    TSL.positionLocal.y.sub(TSL.abs(amount).mul(tipWeight).mul(0.035)),
    TSL.positionLocal.z.add(amount.mul(0.57)),
  );

  const tone = trait.w.sub(0.5).mul(0.22).add(1);
  const gradientY = TSL.uv().y.clamp(0, 1);
  const lowerColor = TSL.mix(
    TSL.color(PARK_COLOR),
    TSL.color(GRASS_MID_COLOR),
    TSL.smoothstep(0, 0.62, gradientY),
  );
  const colorNode = TSL.mix(
    lowerColor,
    TSL.color(GRASS_TIP_COLOR).mul(tone),
    TSL.smoothstep(0.42, 1, gradientY),
  );

  return { colorNode, positionNode };
}

/**
 * A single draw call of tiny crossed triangles around the tower's round lawn.
 * Placement is deterministic; only the vertex tips move, entirely on the GPU.
 */
export const Grass = memo(function Grass({
  count = 4_000,
  wind: windStrength = 0.65,
}: {
  count?: number;
  /** Motion strength. Zero freezes the blades for reduced-motion visitors. */
  wind?: number;
}) {
  const bladeCount = Math.max(0, Math.floor(count));
  const placement = useMemo(() => {
    const random = makeRng(GRASS_SEED);
    const dummy = new THREE.Object3D();
    const matrices: THREE.Matrix4[] = [];
    const origins: number[] = [];
    const traits: number[] = [];

    // Each accepted point is a tuft rather than a lone blade. A shared phase,
    // height family, and green tone ties its members together visually while
    // small offsets and rotations keep it from looking stamped.
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
        Math.sin(centreX * 0.24 + Math.sin(centreZ * 0.11)) * 0.18 +
        Math.sin(centreZ * 0.17 - centreX * 0.08) * 0.12;
      const lawnRadius = PARK_RING_PATH_INNER - PATH_MARGIN;
      const edgeT = THREE.MathUtils.smoothstep(
        centreRadius / lawnRadius,
        0.58,
        1,
      );
      const edgeDensity = THREE.MathUtils.lerp(1, 0.08, edgeT);
      if (random() > patch * edgeDensity) continue;

      const tuftSize = random() < 0.76 ? 3 + Math.floor(random() * 4) : 1;
      const tuftSpread = THREE.MathUtils.lerp(0.26, 0.72, random());
      const tuftHeight = THREE.MathUtils.lerp(
        0.4,
        0.86,
        Math.pow(random(), 1.35),
      );
      const tuftPhase = random() * Math.PI * 2;
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
        const width = THREE.MathUtils.lerp(0.065, 0.13, random());
        const rotation = random() * Math.PI;
        const phase = tuftPhase + THREE.MathUtils.lerp(-0.18, 0.18, random());
        const flexibility = THREE.MathUtils.lerp(0.82, 1.14, random());
        const tone = THREE.MathUtils.clamp(
          tuftTone + THREE.MathUtils.lerp(-0.1, 0.1, random()),
          0,
          1,
        );

        dummy.position.set(x, PARK_SURFACE_Y, z);
        dummy.rotation.set(0, rotation, 0);
        dummy.scale.set(width, height, width);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        origins.push(x, PARK_SURFACE_Y, z);
        traits.push(phase, height, flexibility, tone);
      }
    }

    const geometry = makeBladeGeometry();
    const originAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(origins),
      3,
    );
    const traitAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(traits),
      4,
    );
    geometry.setAttribute("grassOrigin", originAttribute);
    geometry.setAttribute("grassTrait", traitAttribute);

    return { geometry, matrices, originAttribute, traitAttribute };
  }, [bladeCount]);

  useEffect(() => () => placement.geometry.dispose(), [placement.geometry]);

  const [wind] = useState(() => TSL.uniform(windStrength, "float"));
  useEffect(() => {
    wind.value = windStrength;
  }, [wind, windStrength]);

  const createNodes = useCallback(
    () =>
      makeGrassNodes(
        placement.traitAttribute,
        placement.originAttribute,
        wind,
      ),
    [placement.originAttribute, placement.traitAttribute, wind],
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
        positionNode={nodes.positionNode}
        roughness={0.96}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
});
