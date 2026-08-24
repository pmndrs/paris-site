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
  lights,
  mrt,
  output,
  packNormalToRGB,
  vec3,
  vec4,
} from "three/tsl";

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
 * orbit reaches. M/N/D/R/S batch into the text layer's own full-resolution
 * pass (see `TextLayer` in fx.tsx), composited after the temporal resolver so
 * their glyphs skip the reduced-res render and its reconstruction entirely.
 *
 * The P is deliberately different for this intersection POC: it renders in
 * the main scene MRT alongside the tower. Its alpha-tested Glyph quad writes
 * hardware depth and all scene attachments before bloom, so the tower and P
 * can genuinely trade front/back fragments within the same letter instead
 * of reconstructing that relationship in a later 2D composite.
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
 * cutout, MRT override, and SSAO alpha opt-out all stay deleted. Occlusion
 * for these five non-intersecting letters happens downstream against their
 * shared axis plane; the intersecting P uses the material below instead.
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
function createOverlayLetterMaterial(towerGlow: THREE.PointLight) {
  return defineTextMaterial((context) => {
    const material = new THREE.MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      depthTest: false,
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
    // lighting carry the shading.
    material.emissiveNode = context.shader.color.mul(0.1);
    return material;
  });
}

/**
 * The P's main-scene material. This is the part that makes the reference
 * composition real rather than a post-process mask:
 *
 * - the MSDF is alpha-tested into an actual cutout, so the empty quad never
 *   touches depth or MRT attachments;
 * - normal depth test/write lets front tower fragments replace P fragments
 *   while the P replaces tower fragments that sit behind its plane;
 * - the material MRT merges with the scene MRT and marks visible P fragments
 *   in output alpha. FX uses that marker both to keep the flat poster fill out
 *   of screen-space lighting and to stop the depth-blind bloom blur at the P;
 * - explicit zero emissive and camera-facing normal outputs keep every active
 *   scene attachment valid despite Glyph's normal-less unit quad.
 *
 * The tradeoff is local and intentional for the POC: the P uses a 0.5 cutout
 * and passes through FSR/TRAA with the world, so its edge is less pristine
 * than the five letters that remain in the display-resolution text layer.
 */
function createIntersectionLetterMaterial() {
  return defineTextMaterial((context) => {
    const material = new THREE.MeshBasicNodeMaterial({
      side: THREE.DoubleSide,
    });
    material.positionNode = context.position;
    material.colorNode = context.shader.color;
    material.opacityNode = context.shader.opacity;
    material.alphaTest = 0.5;
    material.mrtNode = mrt({
      output: vec4(output.rgb, 0),
      emissive: vec3(0),
      normal: packNormalToRGB(vec3(0, 0, 1)),
    });
    return material;
  });
}

/**
 * Authored layout in city units against the ~24-unit tower. `spread`
 * multiplies the x offsets at render time, so the whole arrangement can be
 * pulled toward the tower (or pushed out) without re-authoring each letter.
 *
 * The z component is a view-axis offset inside the Billboard. The P stays at
 * z = 0, through the tower axis: front-half lattice fragments win hardware
 * depth while rear-half fragments disappear behind the same Glyph quad.
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
  { char: "P", position: [0, 20, 0], center: [0.35, 0.355] },
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
   * fx.tsx): M/N/D/R/S portal into its scene, while the P stays in the main
   * scene. The frame callback writes the overlay plane depth for their
   * composite occlusion and fog.
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
   * The overlay-letters-only tower glow (see `createOverlayLetterMaterial`).
   * It lives in the text scene at mid-tower so every overlay letter sits
   * within a similar falloff band; the main-scene P is intentionally unlit
   * poster-white like the reference.
   */
  const [towerGlow] = useState(
    () => new THREE.PointLight("#ffb35c", 500, 0, 2),
  );
  const overlayMaterial = useMemo(
    () => createOverlayLetterMaterial(towerGlow),
    [towerGlow],
  );
  const intersectionMaterial = useMemo(
    () => createIntersectionLetterMaterial(),
    [],
  );

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
    // M/N/D/R/S all remain on the image-parallel plane through the tower
    // axis, so one view-axis distance restores their existing overlay
    // occlusion/fog. The P is excluded: hardware depth already resolved it.
    state.camera.getWorldDirection(forward);
    const depth = -forward.dot(state.camera.position);
    if (depth > 0) textLayer.planeDepth.value = depth;

    // The text scene renders in its own pass, so the sky's IBL has to be
    // mirrored onto it — reference assignments, free when unchanged.
    textLayer.scene.environment = state.scene.environment;
    textLayer.scene.environmentIntensity = state.scene.environmentIntensity;
    textLayer.scene.environmentRotation.copy(state.scene.environmentRotation);
  });

  const [intersectionLetter, ...overlayLetters] = LETTERS;
  const makePosition = (
    position: [number, number, number],
    center: [number, number],
  ): [number, number, number] => {
    const [x, y, z] = position;
    const [cx, cy] = center;
    return [
      x * spread - cx * size,
      y + (baselineEm ?? 1) * size - cy * size,
      z,
    ];
  };

  return (
    <>
      {/* The P shares the tower's scene pass, depth buffer and MRT. */}
      <group scale={worldScale}>
        <Billboard>
          <TextGroup
            compositing="independent"
            material={intersectionMaterial}
            visible={baselineEm !== null}
          >
            <Text
              ref={probeRef}
              font={geist}
              style={style}
              paint={{ color: "#ffffff" }}
              position={makePosition(
                intersectionLetter.position,
                intersectionLetter.center,
              )}
            >
              {intersectionLetter.char}
            </Text>
          </TextGroup>
        </Billboard>
      </group>

      {/* The other letters retain the crisp display-resolution overlay. */}
      {createPortal(
        <group scale={worldScale}>
          <primitive object={towerGlow} position={[0, 11, 0]} />
          <Billboard>
            <TextGroup
              compositing="independent"
              material={overlayMaterial}
              visible={baselineEm !== null}
            >
              {overlayLetters.map(({ char, position, center }) => (
                <Text
                  key={char}
                  font={geist}
                  style={style}
                  paint={{ color: "#ffffff" }}
                  position={makePosition(position, center)}
                >
                  {char}
                </Text>
              ))}
            </TextGroup>
          </Billboard>
        </group>,
        textLayer.scene,
      )}
    </>
  );
}
