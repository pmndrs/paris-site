"use client";

import { useMemo, useRef, useState } from "react";
import { Billboard } from "@react-three/drei";
import { createPortal, useFrame } from "@react-three/fiber/webgpu";
import { Text, TextGroup, useFont } from "@pmndrs/glyph/react";
import { defineTextMaterial } from "@pmndrs/glyph/three";
import { msdf } from "@pmndrs/glyph/three/msdf";
import type { Text as TextObject } from "@pmndrs/glyph/three";
import * as THREE from "three/webgpu";
import {
  cameraFar,
  cameraNear,
  float,
  lights,
  mix,
  positionView,
  smoothstep,
  uv,
  vec3,
  viewZToPerspectiveDepth,
} from "three/tsl";

import type { TextLayer } from "./fx";

/**
 * Billboarded MSDF letters render in a full-resolution pass. Authored depth
 * bands and the tower depth twin determine the ironwork occlusion per pixel.
 */

const FONT_REQUEST = {
  input: { baked: "/hero-demo/Geist-ExtraBold.font.glb" },
  raster: { technique: msdf },
} as const;

/**
 * Creates a lit MSDF material with authored depth. The alpha test prevents
 * transparent parts of the glyph quad from writing depth.
 */
function createLetterMaterial(
  towerGlow: THREE.PointLight,
  /** The depth written for the visible glyph pixels. */
  depthNode: THREE.Node,
) {
  return defineTextMaterial((context) => {
    const material = new THREE.MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      depthWrite: true,
      alphaTest: 1 / 255,
    });
    material.positionNode = context.position;
    material.colorNode = context.shader.color;
    material.opacityNode = context.shader.opacity;
    material.normalNode = vec3(0, 0, 1);
    material.lightsNode = lights([towerGlow]);
    // Increase the sky response on camera-facing glyphs.
    material.envMapIntensity = 2;
    // Add warmth without compositing tower bloom over foreground letters.
    material.emissiveNode = context.shader.color.mul(0.4);
    material.depthNode = depthNode;
    return material;
  });
}

/**
 * Depth offsets in city units from top to bottom. Each UV band blends from
 * one offset to the next so a letter can pass through the tower.
 */
type Layering = {
  z: readonly number[];
  bands?: readonly (readonly [number, number])[];
};

/** Converts authored view-axis offsets into perspective depth. */
function layerDepthNode({ z, bands = [] }: Layering, worldScale: number) {
  const down = uv().y;
  let authored: THREE.Node<"float"> = float(z[0]);
  bands.forEach(([from, to], i) => {
    authored = mix(authored, float(z[i + 1]), smoothstep(from, to, down));
  });
  return viewZToPerspectiveDepth(
    positionView.z.add(authored.mul(worldScale)),
    cameraNear,
    cameraFar,
  );
}

/**
 * Poster layout in city units. Positions share the tower axis plane while
 * layers control occlusion and centers align each glyph by its outline bounds.
 */
const LETTERS: {
  char: string;
  /** Position in city units on the tower axis plane. */
  position: [number, number];
  center: [number, number];
  /** Authored depth against the tower. */
  layer: Layering;
}[] = [
  {
    char: "P",
    position: [-0.3, 23.4],
    center: [0.355, 0.355],
    // Place the upper bowl behind the summit and the lower stem in front.
    layer: { z: [-1.6, 1.6], bands: [[0.36, 0.5]] },
  },
  {
    char: "M",
    position: [3, 20.2],
    center: [0.4635, 0.355],
    layer: { z: [-2.2] },
  },
  {
    char: "N",
    position: [-2.5, 17.4],
    center: [0.3765, 0.355],
    layer: { z: [3] },
  },
  {
    char: "D",
    position: [2.9, 14.6],
    center: [0.377, 0.355],
    layer: { z: [-4] },
  },
  {
    char: "R",
    position: [-3, 11.8],
    center: [0.3635, 0.355],
    // Place the bowl behind the tower and the leg in front.
    layer: { z: [-6, 4], bands: [[0.42, 0.55]] },
  },
  {
    char: "S",
    position: [2.6, 9],
    center: [0.3475, 0.355],
    // Place the upper curve in front and the lower bowl behind the tower.
    layer: { z: [5, -6], bands: [[0.55, 0.7]] },
  },
];

export function Lettering({
  /** Glyph em size in world units. */
  size = 6,
  /** Multiplier for the authored horizontal offsets. */
  spread = 0.8,
  /** Scale shared with the main scene. */
  worldScale = 1,
  /** Full-resolution scene used for lettering and tower depth. */
  textLayer,
}: {
  size?: number;
  spread?: number;
  worldScale?: number;
  textLayer: TextLayer;
}) {
  const geist = useFont(FONT_REQUEST);

  const style = useMemo(() => ({ fontSize: size, lineHeight: 1 }), [size]);

  /** A tower glow scoped to the lettering material. */
  const [towerGlow] = useState(
    () => new THREE.PointLight("#ffb35c", 500, 0, 2),
  );

  /** Each letter needs a material with its own depth node. */
  const letters = useMemo(
    () =>
      LETTERS.map((letter) => ({
        letter,
        material: createLetterMaterial(
          towerGlow,
          layerDepthNode(letter.layer, worldScale),
        ),
      })),
    [towerGlow, worldScale],
  );

  /** Baseline offset measured from the committed glyph layout in em units. */
  const [baselineEm, setBaselineEm] = useState<number | null>(null);
  const probeRef = useRef<TextObject<typeof msdf> | null>(null);
  useFrame(() => {
    if (baselineEm !== null) return;
    const probe = probeRef.current;
    // Measure only after the current layout properties have been applied.
    if (!probe || probe.needsApply()) return;
    const measured = probe.measureLayout();
    if (measured) setBaselineEm(measured.firstBaseline / size);
  });

  useFrame((state) => {
    // Mirror scene lighting into the independent text pass.
    textLayer.scene.environment = state.scene.environment;
    textLayer.scene.environmentIntensity = state.scene.environmentIntensity;
    textLayer.scene.environmentRotation.copy(state.scene.environmentRotation);
  });

  // Use one glyph batch per letter so each batch can write its own depth.
  return createPortal(
    <group scale={worldScale}>
      <primitive object={towerGlow} position={[0, 11, 0]} />
      <Billboard>
        {letters.map(({ letter: { char, position, center }, material }, i) => (
          <TextGroup
            key={char}
            compositing="independent"
            material={material}
            visible={baselineEm !== null}
          >
            <group position={[position[0] * spread, position[1], 0]}>
              <Text
                ref={i === 0 ? probeRef : undefined}
                font={geist}
                style={style}
                paint={{ color: "#ffffff" }}
                position={[
                  -center[0] * size,
                  (baselineEm ?? 1) * size - center[1] * size,
                  0,
                ]}
              >
                {char}
              </Text>
            </group>
          </TextGroup>
        ))}
      </Billboard>
    </group>,
    textLayer.scene,
  );
}
