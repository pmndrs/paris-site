"use client";

import { useMemo, useRef, useState } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber/webgpu";
import { Text, TextGroup, useFont } from "@pmndrs/glyph/react";
import { defineTextMaterial } from "@pmndrs/glyph/three";
import { msdf } from "@pmndrs/glyph/three/msdf";
import type { Text as TextObject } from "@pmndrs/glyph/three";
import * as THREE from "three/webgpu";
import { lights, mrt, output, vec3, vec4 } from "three/tsl";

/**
 * The PMNDRS lettering, restored from Faraz's `Text.tsx` — specifically the
 * commented-out PARIS-poster layout rather than the two-line version that
 * was live: single huge letters stepping down the tower, alternating sides,
 * the way the reference photo stacks P-A-R-I-S around the spire.
 *
 * Rendered with `@pmndrs/glyph` (MSDF technique) rather than extruded
 * TextGeometry: the letters billboard to the camera anyway, so the 0.12-unit
 * extrusion never read as depth, and MSDF stays crisp at any distance the
 * orbit reaches. All six letters batch into one draw through the TextGroup.
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
 * Not glyph's stock material, for two pipeline reasons and one look reason.
 *
 * The stock material is a blended transparent quad (`transparent: true`, no
 * depth). The FX chain renders the scene into a multi-attachment MRT
 * (output + emissive + normal + velocity), and a blended quad stomps the
 * non-color attachments across its whole rectangle — on screen that read as
 * a ghostly depth-like box over every letter that crossed the tower glow.
 * An alpha-tested cutout discards everything outside the glyph outline
 * instead, so the letters write depth and MRT exactly like the opaque
 * TextGeometry meshes they replace.
 *
 * The `output` alpha override opts the letters out of GTAO: the vendored
 * SSAO node reads the scene alpha attachment and both skips occluders and
 * fades occlusion where alpha is below its threshold (the same channel the
 * original demo's dedicated `alpha` attachment fed). Without it the flat
 * billboarded fill picks up AO speckle from whatever depth surrounds the
 * tower. The material MRT merges over the pass MRT, so emissive, normal,
 * and velocity still flow.
 *
 * And it is a standard (lit) material rather than basic white: the letters
 * take the dusk sky IBL and the tower's warm glow, so they sit in the scene
 * instead of floating over it. Glyph's quad geometry ships no normal
 * attribute, so the camera-facing normal every billboard implies is
 * declared explicitly.
 *
 * The tower light arrives through a selective `lightsNode`: the scene's own
 * warm wash sits at the tower base and dies off long before the upper
 * letters, so the component mounts a dedicated point light at mid-tower and
 * scopes it to the letters alone — the analytic list replaces scene lights
 * for this material only, the environment IBL still merges in, and the
 * verified scene lighting is untouched.
 */
function createLetterMaterial(towerGlow: THREE.PointLight) {
  return defineTextMaterial((context) => {
    const material = new THREE.MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    material.positionNode = context.position;
    material.colorNode = context.shader.color;
    material.opacityNode = context.shader.opacity;
    material.alphaTest = 0.5;
    material.normalNode = vec3(0, 0, 1);
    material.lightsNode = lights([towerGlow]);
    // Sky response above physical so the dusk gradient clearly reads on
    // camera-facing surfaces the IBL would otherwise barely reach.
    material.envMapIntensity = 2;
    // A whisper of self-glow so the letters never fall to pure silhouette
    // on the dark side of the orbit — kept subtle so the sky and tower
    // lighting carry the shading (0.6 here reads as flat unlit white). It
    // flows into the pass's emissive attachment, so bloom lends the
    // letters a faint halo.
    material.emissiveNode = context.shader.color.mul(0.1);
    material.mrtNode = mrt({ output: vec4(output.rgb, 0) });
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
}: {
  size?: number;
  spread?: number;
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

  return (
    <>
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
    </>
  );
}
