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
 * orbit reaches. All six letters batch through the TextGroup — which renders
 * in the text layer's own full-resolution pass (see `TextLayer` in fx.tsx),
 * composited after the temporal resolver so the glyphs skip the reduced-res
 * render and its reconstruction entirely.
 *
 * The ironwork interleave is per-pixel: each letter carries its own authored
 * z inside the Billboard, the material writes real depth in the text pass,
 * and the composite compares that depth against the scene's — so any tower
 * member currently nearer than a letter's plane cuts in front of it, and the
 * cut pattern animates as the tower spins. Because the Billboard re-aims
 * every frame, a letter's z is a *view-axis* offset from the tower axis at
 * every orbit and spin angle: +z is always toward the camera. That makes the
 * layering author-once — "P tucked behind the mast" holds in every pose,
 * since the mast sits on the spin axis.
 *
 * The font GLB is baked offline from Geist ExtraBold — near the reference
 * poster's heavy type without Black's closed-up counters (the DOM stays on
 * the lighter text weights; only the poster letters go heavy):
 *
 *   pnpm exec glyph bake --input Geist-ExtraBold.ttf \
 *     --output public/hero-demo/Geist-ExtraBold.font.glb \
 *     --unicodes U+0020-007E --msdf
 *
 * (Geist-ExtraBold.ttf is the static instance from vercel/geist-font,
 * fonts/Geist/ttf; the ASCII subset keeps the GLB small while covering any
 * future in-scene label.)
 */

const FONT_REQUEST = {
  input: { baked: "/hero-demo/Geist-ExtraBold.font.glb" },
  raster: { technique: msdf },
} as const;

/**
 * The dedicated text pass frees this material to be what glyph intended: a
 * blended transparent quad with the MSDF's shader-side edge coverage in
 * `opacity` — real antialiasing at display resolution. The old in-scene
 * version had to be an alpha-tested cutout at threshold 0.5 and a merged MRT
 * (a blended quad stomps the scene pass's non-color attachments); the text
 * pass has a single color target, so the MRT override and the SSAO alpha
 * opt-out stay deleted. Occlusion happens downstream, in fx.tsx's composite.
 *
 * Depth IS written here, though — the composite re-occludes the letters
 * per pixel against scene depth, and the per-pixel letter depth comes from
 * this pass's depth texture (each letter sits at its own authored z now,
 * so the old single-plane uniform can't serve). Two supporting choices:
 *
 * - `alphaTest` at one LSB: a glyph quad is a rectangle much bigger than
 *   its glyph, and MSDF coverage is exactly 0 outside the distance band —
 *   without the discard, the empty region of a nearer letter's quad would
 *   write depth and punch an invisible rectangle out of any letter behind
 *   it. At 1/255 the discard removes only coverage the blend couldn't
 *   show anyway, so the soft MSDF edge survives intact.
 * - depth *test* stays on (default), which is what lets two letters at
 *   different z overlap correctly within the same batched draw.
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
      depthWrite: true,
      alphaTest: 1 / 255,
    });
    material.positionNode = context.position;
    material.colorNode = context.shader.color;
    material.opacityNode = context.shader.opacity;
    material.normalNode = vec3(0, 0, 1);
    material.lightsNode = lights([towerGlow]);
    // Sky response above physical so the dusk gradient clearly reads on
    // camera-facing surfaces the IBL would otherwise barely reach.
    material.envMapIntensity = 2;
    // Self-glow does real work now: the composite no longer paints the
    // tower's bloom back over letter pixels (type in front of the tower
    // must show no glow through it), and that overlay was most of what
    // made the letters read warm cream instead of dusk-lit gray. The
    // equivalent brightness lives in the material instead — tuned so the
    // letters match their former on-page value without the halo.
    material.emissiveNode = context.shader.color.mul(0.4);
    return material;
  });
}

/**
 * Authored layout in city units against the ~24-unit tower. `spread`
 * multiplies the x offsets at render time, so the whole arrangement can be
 * pulled toward the tower (or pushed out) without re-authoring each letter.
 *
 * The z is the letter's view-axis offset from the tower axis (+ toward the
 * camera — the Billboard re-aims each frame, so the offset means the same
 * thing at every orbit and spin angle), and it is always authored OUTSIDE
 * the tower's sweep envelope at the letter's height: each letter is fully
 * behind the tower or fully in front of it, in every spin pose. A letter
 * *inside* the envelope is simultaneously behind the near ironwork and in
 * front of the far ironwork, and that half-woven state read as an
 * impossible object (and, over the bloom, as broken occlusion) — the
 * reference does binary layers too: its P entirely behind the tip, its
 * lower letters entirely over the base.
 *
 * - P crowns the tower, and is the one letter that mixes layers —
 *   deliberately, via a gentle `tilt` rather than an in-envelope z: the
 *   top leans behind so the beacon ball reads through the counter, the
 *   bottom leans camera-ward so the letter's lower edge lies over the
 *   pavilion — a slight overlap with one clean crossing, instead of the
 *   per-member ambiguity an in-envelope flat letter had.
 * - N is the second "behind" letter: the mid-tower silhouette cuts its
 *   right third, the rest reads against sky and skyline.
 * - M, D, R, S float fully in front, like the reference's lower letters.
 *   Fully-behind doesn't survive down there: the lower tower is dense and
 *   bloom-hot, and an occluded letter just gets eaten (headless pass
 *   showed R reduced to a P and S erased entirely). S also rides higher
 *   than the old layout: below y≈4 the near-ring rooftops (real scene
 *   depth, much closer than the tower) blank out the whole letter band.
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
  /**
   * View-space lean about the letter's own horizontal axis, radians.
   * Negative pitches the top away from the camera and the bottom toward
   * it, so depth varies along the letter's height — which is how a letter
   * can be behind the tower at its top and in front at its bottom in the
   * same pose: the composite's occlusion is per-pixel depth, so the quad
   * doesn't have to sit at one distance. Billboard-local, so the lean and
   * its crossing point hold at every orbit and spin angle. Costs a mild
   * vertical foreshortening (cos of the angle), which reads as poster
   * lean, not distortion.
   */
  tilt?: number;
}[] = [
  {
    char: "P",
    position: [-0.3, 23.2, 0.2],
    center: [0.355, 0.355],
    tilt: -0.25,
  },
  { char: "M", position: [3.5, 17.8, 2.5], center: [0.4635, 0.355] },
  { char: "N", position: [-2.8, 14.6, -3], center: [0.3765, 0.355] },
  { char: "D", position: [3.2, 11.6, 4.5], center: [0.377, 0.355] },
  { char: "R", position: [-3.8, 8.8, 6], center: [0.3635, 0.355] },
  { char: "S", position: [4.5, 6, 8], center: [0.3475, 0.355] },
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
   * fx.tsx): content portals into its scene; the pass's own depth texture
   * carries the per-letter depths for the composite's occlusion and fog.
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

  useFrame((state) => {
    // The text scene renders in its own pass, so the sky's IBL has to be
    // mirrored onto it — reference assignments, free when unchanged.
    // (Occlusion/fog depth needs no plumbing here any more: the letters
    // write real depth in that pass, and the composite reads it per pixel.)
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
        {/* The wrapper group puts the rotation pivot at the letter's visual
            center (a Text anchors at its paragraph box's top-left, so
            rotating the Text itself would swing the letter around that
            corner); the center-correction offsets move inside. Glyph
            observes ancestor matrices up to the TextGroup, so the
            wrapper's transform reaches the batch. */}
        {LETTERS.map(
          ({ char, position: [x, y, z], center: [cx, cy], tilt = 0 }, i) => (
            <group key={char} position={[x * spread, y, z]} rotation-x={tilt}>
              <Text
                ref={i === 0 ? probeRef : undefined}
                font={geist}
                style={style}
                paint={{ color: "#ffffff" }}
                position={[
                  -cx * size,
                  (baselineEm ?? 1) * size - cy * size,
                  0,
                ]}
              >
                {char}
              </Text>
            </group>
          ),
        )}
        </TextGroup>
      </Billboard>
    </group>,
    textLayer.scene,
  );
}
