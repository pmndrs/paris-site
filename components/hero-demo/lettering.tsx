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
 * The PMNDRS lettering, laid out as the reference poster stacks P-A-R-I-S
 * around the spire: single huge letters stepping down the tower, alternating
 * sides.
 *
 * Rendered with `@pmndrs/glyph` (MSDF technique) rather than extruded
 * TextGeometry. The letters billboard to the camera, so an extrusion never
 * reads as depth, and MSDF stays crisp at any distance the orbit reaches.
 * Each letter renders in the text layer's own full-resolution pass (see
 * `TextLayer` in fx.tsx), composited after the temporal resolver, so the
 * glyphs skip the reduced-res render and its reconstruction entirely.
 *
 * The ironwork interleave is per-pixel. The material writes each letter's
 * authored depth, the tower portals a depth twin of itself into the same
 * pass, and the depth test cuts one against the other, so the cut pattern
 * animates as the tower spins. Because the Billboard re-aims every frame,
 * an authored depth is a view-axis offset from the tower axis at every
 * orbit and spin angle, where +z is always toward the camera. That makes
 * the layering author-once, band by band down each glyph (see `Layering`),
 * and it holds in every pose because the tower's upper structure sits on
 * the spin axis.
 *
 * The font GLB is baked offline from Geist ExtraBold, which is near the
 * reference poster's heavy type without Black's closed-up counters. Only
 * the poster letters go heavy, the DOM stays on the lighter text weights.
 *
 *   pnpm exec glyph bake --input Geist-ExtraBold.ttf \
 *     --output public/hero-demo/Geist-ExtraBold.font.glb \
 *     --unicodes U+0020-007E --msdf
 *
 * Geist-ExtraBold.ttf is the static instance from vercel/geist-font,
 * fonts/Geist/ttf. The ASCII subset keeps the GLB small while covering any
 * future in-scene label.
 */

const FONT_REQUEST = {
  input: { baked: "/hero-demo/Geist-ExtraBold.font.glb" },
  raster: { technique: msdf },
} as const;

/**
 * The letter material: a blended transparent quad carrying the MSDF's
 * shader-side edge coverage in `opacity`, which is real antialiasing at
 * display resolution. The text pass has a single color target, so the
 * material needs no MRT override.
 *
 * Depth is written here, and it is the letter's authored depth rather than
 * the quad's (see `Layering`). Two supporting choices:
 *
 * - `alphaTest` at one LSB. A glyph quad is a rectangle much bigger than
 *   its glyph, and MSDF coverage is exactly 0 outside the distance band.
 *   Without the discard, the empty region of a nearer letter's quad would
 *   write depth and punch an invisible rectangle out of anything behind it.
 *   At 1/255 the discard removes only coverage the blend could not show
 *   anyway, so the soft MSDF edge survives intact.
 * - The depth test stays on, which is what lets the tower's depth twin cut
 *   the glyph and what orders letters against each other.
 *
 * A standard lit material rather than basic white, so the letters take the
 * dusk sky IBL, mirrored onto the text layer's scene each frame, and the
 * tower's warm glow. That seats them in the scene instead of floating over
 * it. Glyph's quad geometry ships no normal attribute, so the camera-facing
 * normal every billboard implies is declared explicitly.
 *
 * The tower light arrives through a selective `lightsNode`. The scene's own
 * warm wash sits at the tower base and dies off long before the upper
 * letters, so the component mounts a dedicated point light at mid-tower and
 * scopes it to the letters alone. The analytic list replaces scene lights
 * for this material only, and the environment IBL still merges in.
 */
function createLetterMaterial(
  towerGlow: THREE.PointLight,
  /**
   * The letter's authored depth (see `Layering`). It replaces only what the
   * pass writes to depth. The quad rasterises where its transform puts it.
   */
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
    // Sky response above physical so the dusk gradient clearly reads on
    // camera-facing surfaces the IBL would otherwise barely reach.
    material.envMapIntensity = 2;
    // The letters carry their own cream warmth. The composite paints no
    // bloom back over letter pixels, since type in front of the tower must
    // show no glow through it, so the equivalent brightness lives here.
    material.emissiveNode = context.shader.color.mul(0.4);
    material.depthNode = depthNode;
    return material;
  });
}

/**
 * A letter's `layer`: where it sits in depth against the tower, band by band
 * down the glyph.
 *
 * Every quad sits on the same plane, the one through the tower's axis, so
 * the whole poster is one distance from the camera and every letter is the
 * size the type says it is. Depth is authored here instead. The material
 * replaces the depth the quad writes with `z[0]` at the top of the glyph and
 * `z[i+1]` after each band, ramping smoothly across it. The depth test in
 * the text pass reads exactly that, so the tower crosses each letter where
 * this says it does, in every orbit and spin pose.
 *
 * Separating where a letter draws from where it layers is what makes the
 * weave authorable. Moving the quad instead buys layering with perspective:
 * a letter pushed behind the tower comes back visibly smaller than its
 * neighbours, which on flat poster type reads as a mistake, not as depth.
 *
 * - `z` is in city units on the billboard's view axis, positive toward the
 *   camera. A value clear of the tower's envelope at that height, either
 *   side, is cleanly in front or cleanly behind. A value inside the envelope
 *   half-weaves the letter, with near ironwork over it and far ironwork
 *   behind it.
 * - `bands` are in the quad's own UV, which runs 0 at the paragraph box's
 *   top to 1 at its bottom, one per step, so `bands.length === z.length - 1`
 *   and a single-z layer needs none. Put a band where the glyph has no ink
 *   to show the transition. The P's lands inside its counter, the R's and
 *   the S's on their open bends.
 */
type Layering = {
  z: readonly number[];
  bands?: readonly (readonly [number, number])[];
};

/**
 * A layer as a depth node. `positionView.z` is the quad's real view depth,
 * negative going away from the camera, and every quad sits at the axis
 * plane, so adding the authored z is the whole conversion. `worldScale`
 * carries that z from city units into view-space units. The result is
 * perspective depth, matching what the pass would have written on its own,
 * since the renderer runs neither a logarithmic nor a reversed depth buffer.
 */
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
 * Authored layout in city units against the ~24-unit tower. `spread`
 * multiplies the x offsets at render time, so the whole arrangement can be
 * pulled toward the tower (or pushed out) without re-authoring each letter.
 *
 * `position` is only where the letter sits on the poster. Every quad sits on
 * the tower's axis plane, so the letters are all the same distance from the
 * camera and all the size the type says they are. Which side of the tower
 * each one is on is `layer` (see `Layering`), authored per band down the
 * glyph. It means the same thing at every orbit and spin angle, because the
 * Billboard re-aims each frame and +z is always toward the camera.
 *
 * The stack alternates down the tower, and two of the six thread it:
 *
 * - P crowns the tower and mixes layers. The antenna and the summit read
 *   over its upper half, its bowl reads over the pavilion. That comes from
 *   its `layer`, so the letter itself stays flat and upright, with no lean,
 *   no foreshortening and no z threading the summit envelope. The mast
 *   crossing it is a few pixels of iron, which is exactly what the depth
 *   twin cuts, because that pass runs at display resolution.
 * - M sits behind, N in front, D behind again. One z each, every one clear
 *   of the envelope at its height, so the silhouette cuts the ones behind
 *   and the ones in front cover it clean.
 * - R inverts the S's thread. Its bowl, the letter's second story, is always
 *   behind, and its leg is always in front. Keeping the leg in front is what
 *   holds the letterform: a fully-behind R loses its leg to the lattice and
 *   reads as a P.
 * - S threads the other way. Its upper curve is always over the tower and
 *   its lower bowl always behind all of it, so the near leg wraps the letter
 *   at every spin and orbit angle. Its x is pulled in from its neighbours so
 *   there is leg to wrap with, and it rides high enough to clear the
 *   near-ring rooftops, which are far closer than the tower and are not in
 *   the depth twin.
 *
 * `center` is the letter's outline-bbox center in em units, measured with
 * opentype.js against the same TTF the GLB is baked from. A glyph paragraph
 * anchors at its box's top-left corner, so offsetting each Text by its bbox
 * center is what makes `position` mean the letter's middle.
 */
const LETTERS: {
  char: string;
  /** [x, y] in city units. The quad's plane is the tower's axis plane. */
  position: [number, number];
  center: [number, number];
  /** Where the letter layers against the tower. See `Layering`. */
  layer: Layering;
}[] = [
  {
    char: "P",
    position: [-0.3, 23.4],
    center: [0.355, 0.355],
    // Behind the summit down to the underside of the bowl, in front of the
    // pavilion below it. The step happens inside the counter.
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
    // The S's thread inverted. The bowl, this letter's second story, is
    // always behind the tower and the leg always in front, so the letterform
    // survives while the ironwork crosses the bowl.
    layer: { z: [-6, 4], bands: [[0.42, 0.55]] },
  },
  {
    char: "S",
    position: [2.6, 9],
    center: [0.3475, 0.355],
    // Binary per band rather than per letter. The upper curve is always in
    // front of the tower and the lower bowl always behind all of it, since
    // the second z clears the envelope at this height rather than sitting
    // inside it, so the leg wraps the letter the same way at every spin and
    // orbit angle. The step rides the S's lower open bend, where the glyph
    // has no stroke to break.
    layer: { z: [5, -6], bands: [[0.55, 0.7]] },
  },
];

export function Lettering({
  /** Em size in world units. About 6 is a quarter-of-tower letter. */
  size = 6,
  /** Multiplier on the authored x offsets — <1 hugs the tower, >1 spreads. */
  spread = 0.8,
  /**
   * Metres per scene unit, mirrored from the canvas's `worldScale` group.
   * The portal wraps the letters in the same scale, so the authored layout
   * keeps meaning city units.
   */
  worldScale = 1,
  /**
   * The full-res layer this component renders into (see `TextLayer` in
   * fx.tsx). Its scene is where the poster's occlusion is settled. The tower
   * portals a depth twin in beside these letters, and the depth test cuts
   * one against the other.
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
   * falloff band. Intensity is tuned against the scene's base-level wash.
   */
  const [towerGlow] = useState(
    () => new THREE.PointLight("#ffb35c", 500, 0, 2),
  );

  /**
   * Each letter with its own material. Depth is authored per letter (see
   * `Layering`) and a material is the only place that can live, which is
   * also why each letter gets its own single-glyph batch below.
   */
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

  /**
   * Distance from the paragraph box top to the baseline, in ems. It depends
   * on the layout engine's line-box model, not just font metrics, so it is
   * read back from the first committed layout rather than derived. Once
   * known it holds for every size, because layout scales linearly with
   * fontSize. Letters stay hidden until then, a wait of a frame or two,
   * inside the same Suspense reveal that gates the font fetch.
   */
  const [baselineEm, setBaselineEm] = useState<number | null>(null);
  const probeRef = useRef<TextObject<typeof msdf> | null>(null);
  useFrame(() => {
    if (baselineEm !== null) return;
    const probe = probeRef.current;
    // `needsApply` guards the race where `size` changed this frame. Measure
    // only a layout that reflects the props currently rendered.
    if (!probe || probe.needsApply()) return;
    const measured = probe.measureLayout();
    if (measured) setBaselineEm(measured.firstBaseline / size);
  });

  useFrame((state) => {
    // The text scene renders in its own pass, so the sky's IBL has to be
    // mirrored onto it. Reference assignments, free when unchanged.
    textLayer.scene.environment = state.scene.environment;
    textLayer.scene.environmentIntensity = state.scene.environmentIntensity;
    textLayer.scene.environmentRotation.copy(state.scene.environmentRotation);
  });

  // Everything renders in the text layer's scene, its own full-res pass
  // composited after the resolver (fx.tsx). The portal wraps the content in
  // the same worldScale the main scene applies, so the authored layout keeps
  // meaning city units.
  //
  // One batch per letter, because a batch is one material. Inside each, the
  // wrapper group holds the authored position and the Text carries the
  // center correction. Glyph observes ancestor matrices up to the TextGroup,
  // so the wrapper's transform reaches the batch.
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
