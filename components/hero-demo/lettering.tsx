"use client";

import { useMemo, useRef, useState } from "react";
import { Billboard } from "@react-three/drei";
import { createPortal, useFrame } from "@react-three/fiber/webgpu";
import { Text, TextGroup, useFont } from "@pmndrs/glyph/react";
import { defineTextMaterial } from "@pmndrs/glyph/three";
import { msdf } from "@pmndrs/glyph/three/msdf";
import type { Text as TextObject } from "@pmndrs/glyph/three";
import * as THREE from "three/webgpu";
import { lights, vec3 } from "three/tsl";

import type { TextLayer } from "./fx";

/**
 * The PMNDRS lettering, restored from Faraz's `Text.tsx` — specifically the
 * commented-out PARIS-poster layout rather than the two-line version that
 * was live: single huge letters stepping down the tower, alternating sides,
 * the way the reference photo stacks P-A-R-I-S around the spire.
 *
 * Rendered with `@pmndrs/glyph` (MSDF technique) rather than extruded
 * TextGeometry: the letters billboard to the camera anyway, so the 0.12-unit
 * extrusion never read as depth, and MSDF stays crisp at any distance the
 * orbit reaches. All six letters batch into one draw through the TextGroup —
 * which renders in the text layer's own full-resolution pass (see `TextLayer`
 * in fx.tsx), composited after the temporal resolver so the glyphs skip the
 * reduced-res render and its reconstruction entirely. The ironwork
 * interleave survives the split: every letter sits at z = 0 inside one
 * Billboard, i.e. on a single image-parallel plane through the tower's
 * axis, so the composite re-occludes them with one depth compare — tower
 * members nearer than the axis plane cut in front, members behind don't,
 * exactly as the in-scene depth test read.
 *
 * The font GLB is baked offline from the same Geist SemiBold the DOM uses:
 *
 *   pnpm exec glyph bake --input Geist-SemiBold.ttf \
 *     --output public/hero-demo/Geist-SemiBold.font.glb \
 *     --unicodes U+0020-007E --msdf
 *
 * (Geist-SemiBold.ttf is the static instance from vercel/geist-font; the
 * ASCII subset keeps the GLB small while covering any future in-scene label.)
 */

const FONT_REQUEST = {
  input: { baked: "/hero-demo/Geist-SemiBold.font.glb" },
  raster: { technique: msdf },
} as const;

/**
 * The dedicated text pass frees this material to be what glyph intended: a
 * blended transparent quad with the MSDF's shader-side edge coverage in
 * `opacity` — real antialiasing at display resolution. The old in-scene
 * version had to be an alpha-tested cutout writing depth and a merged MRT
 * (a blended quad stomps the scene pass's non-color attachments); the text
 * pass has a single color target and no depth story of its own, so the
 * cutout, the MRT override, and the SSAO alpha opt-out all delete.
 * Occlusion happens downstream, in fx.tsx's composite.
 *
 * Still a standard (lit) material rather than basic white: the letters
 * take the dusk sky IBL (mirrored onto the text layer's scene each frame)
 * and the tower's warm glow, so they sit in the scene instead of floating
 * over it. Glyph's quad geometry ships no normal attribute, so the
 * camera-facing normal every billboard implies is declared explicitly.
 *
 * The tower light arrives through a selective `lightsNode`: the scene's own
 * warm wash sits at the tower base and dies off long before the upper
 * letters, so the component mounts a dedicated point light at mid-tower and
 * scopes it to the letters alone — the analytic list replaces scene lights
 * for this material only, and the environment IBL still merges in.
 */
function createLetterMaterial(towerGlow: THREE.PointLight) {
  return defineTextMaterial((context) => {
    const material = new THREE.MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      depthWrite: false,
    });
    material.positionNode = context.position;
    material.colorNode = context.shader.color;
    material.opacityNode = context.shader.opacity;
    material.normalNode = vec3(0, 0, 1);
    material.lightsNode = lights([towerGlow]);
    // Sky response above physical so the dusk gradient clearly reads on
    // camera-facing surfaces the IBL would otherwise barely reach.
    material.envMapIntensity = 2;
    // A whisper of self-glow so the letters never fall to pure silhouette
    // on the dark side of the orbit — kept subtle so the sky and tower
    // lighting carry the shading. (The halo the scene's bloom used to lend
    // is re-applied in the composite, from the tower's own glow.)
    material.emissiveNode = context.shader.color.mul(0.1);
    return material;
  });
}

/**
 * Authored layout in city units against the ~24-unit tower. `spread`
 * multiplies the x offsets at render time, so the whole arrangement can be
 * pulled toward the tower (or pushed out) without re-authoring each letter.
 *
 * `center` is the letter's outline-bbox center in em units, measured with
 * opentype.js against the same TTF the GLB is baked from. The old
 * TextGeometry path called `geometry.center()`, making `position` mean "the
 * letter's middle"; offsetting each Text by its bbox center keeps that
 * meaning, since a glyph paragraph anchors at its box's top-left corner.
 */
const LETTERS: {
  char: string;
  position: [number, number, number];
  center: [number, number];
}[] = [
  { char: "P", position: [-4.5, 20, 0], center: [0.35, 0.355] },
  { char: "M", position: [4, 16.5, 0], center: [0.451, 0.355] },
  { char: "N", position: [-6, 13, 0], center: [0.374, 0.355] },
  { char: "D", position: [4.5, 9.5, 0], center: [0.3745, 0.355] },
  { char: "R", position: [-7, 6, 0], center: [0.357, 0.355] },
  { char: "S", position: [5, 2.8, 0], center: [0.334, 0.355] },
];

export function Lettering({
  /** Em size in world units. ~6 ≈ the reference poster's ¼-of-tower letter. */
  size = 6,
  /** Multiplier on the authored x offsets — <1 hugs the tower, >1 spreads. */
  spread = 0.8,
  /**
   * Metres per scene unit, mirrored from the canvas's `worldScale` group.
   * The portal wraps the letters in the same scale so the authored layout
   * keeps meaning city units.
   */
  worldScale = 1,
  /**
   * The full-res layer this component renders into (see `TextLayer` in
   * fx.tsx): content portals into its scene, and the frame callback writes
   * the letters' shared plane depth for the composite's occlusion and fog.
   */
  textLayer,
}: {
  size?: number;
  spread?: number;
  worldScale?: number;
  textLayer: TextLayer;
}) {
  const geist = useFont(FONT_REQUEST);

  const style = useMemo(() => ({ fontSize: size, lineHeight: 1 }), [size]);

  /**
   * The letters-only tower glow (see `createLetterMaterial`). Mounted at
   * mid-tower on the spire axis so every letter sits within a similar
   * falloff band; intensity tuned against the scene's base-level wash.
   */
  const [towerGlow] = useState(
    () => new THREE.PointLight("#ffb35c", 500, 0, 2),
  );
  const material = useMemo(() => createLetterMaterial(towerGlow), [towerGlow]);

  /**
   * Distance from the paragraph box top to the baseline, in ems. It depends
   * on the layout engine's line-box model, not just font metrics, so it is
   * read back from the first committed layout instead of being derived —
   * once known it holds for every size (layout scales linearly with
   * fontSize). Letters stay hidden until then; the wait is a frame or two,
   * all inside the same Suspense reveal that gates the font fetch.
   */
  const [baselineEm, setBaselineEm] = useState<number | null>(null);
  const probeRef = useRef<TextObject<typeof msdf> | null>(null);
  useFrame(() => {
    if (baselineEm !== null) return;
    const probe = probeRef.current;
    // `needsApply` guards the race where `size` changed this frame: measure
    // only a layout that reflects the props currently rendered.
    if (!probe || probe.needsApply()) return;
    const measured = probe.measureLayout();
    if (measured) setBaselineEm(measured.firstBaseline / size);
  });

  const forward = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    // The composite's occlusion/fog depth. All six letters share one
    // image-parallel plane through the tower's axis (the Billboard pivots
    // on the scene origin and every letter sits at z = 0), so a single
    // view-axis distance — camera to that axis plane — serves the whole
    // group, and the ironwork interleave comes back through one compare.
    state.camera.getWorldDirection(forward);
    const depth = -forward.dot(state.camera.position);
    if (depth > 0) textLayer.planeDepth.value = depth;

    // The text scene renders in its own pass, so the sky's IBL has to be
    // mirrored onto it — reference assignments, free when unchanged.
    textLayer.scene.environment = state.scene.environment;
    textLayer.scene.environmentIntensity = state.scene.environmentIntensity;
    textLayer.scene.environmentRotation.copy(state.scene.environmentRotation);
  });

  // Everything renders in the text layer's scene — its own full-res pass,
  // composited after the resolver (fx.tsx). The portal wraps the content in
  // the same worldScale the main scene applies, so the authored layout
  // keeps meaning city units.
  return createPortal(
    <group scale={worldScale}>
      <primitive object={towerGlow} position={[0, 11, 0]} />
      <Billboard>
        <TextGroup
          compositing="independent"
          material={material}
          visible={baselineEm !== null}
        >
        {LETTERS.map(({ char, position: [x, y, z], center: [cx, cy] }, i) => (
          <Text
            key={char}
            ref={i === 0 ? probeRef : undefined}
            font={geist}
            style={style}
            paint={{ color: "#ffffff" }}
            position={[
              x * spread - cx * size,
              y + (baselineEm ?? 1) * size - cy * size,
              z,
            ]}
          >
            {char}
          </Text>
        ))}
        </TextGroup>
      </Billboard>
    </group>,
    textLayer.scene,
  );
}
