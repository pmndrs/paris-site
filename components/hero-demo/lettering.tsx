"use client";

import { useMemo } from "react";
import { Billboard } from "@react-three/drei";
import { useLoader } from "@react-three/fiber/webgpu";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

/**
 * The PMNDRS lettering, restored from Faraz's `Text.tsx` — specifically the
 * commented-out PARIS-poster layout rather than the two-line version that
 * was live: single huge letters stepping down the tower, alternating sides,
 * the way the reference photo stacks P-A-R-I-S around the spire.
 *
 * Built on three's own FontLoader/TextGeometry rather than drei's `<Text3D>`:
 * the installed drei's runtime and types disagree about the extrusion-depth
 * prop name (`height` vs `depth`), and in practice NEITHER reached the
 * geometry — every letter extruded at TextGeometry's default depth and came
 * out deeper than it was tall. Owning the geometry call ends the guessing.
 *
 * One `<Billboard>` wraps the whole arrangement: the letters hold their
 * positions in the tower's frame but always face the orbiting camera, so
 * every azimuth reads as the poster. Plain white basic material, exactly
 * like the original — already-white pixels don't need bloom's help.
 */

const FONT_URL = "/hero-demo/Geist_SemiBold.json";

/**
 * This Geist typeface JSON renders glyphs ~2.5× the nominal `size`
 * (font-conversion scaling), so 1.9 lands the ~5-unit cap height these
 * positions are designed around — letter ≈ ⅕ of the ~24-unit tower, the
 * poster proportion.
 */
const LETTER_SIZE = 1.9;
const LETTER_DEPTH = 0.12;

const LETTERS: { char: string; position: [number, number, number] }[] = [
  { char: "P", position: [-4.5, 20, 0] },
  { char: "M", position: [4, 16.5, 0] },
  { char: "N", position: [-6, 13, 0] },
  { char: "D", position: [4.5, 9.5, 0] },
  { char: "R", position: [-7, 6, 0] },
  { char: "S", position: [5, 2.8, 0] },
];

export function Lettering() {
  const font = useLoader(FontLoader, FONT_URL);

  const geometries = useMemo(
    () =>
      LETTERS.map(({ char }) => {
        const geometry = new TextGeometry(char, {
          font,
          size: LETTER_SIZE,
          depth: LETTER_DEPTH,
          bevelEnabled: true,
          bevelSize: 0.04,
          bevelThickness: 0.04,
          bevelSegments: 2,
          curveSegments: 10,
        });
        // Center per letter so `position` places the letter's middle, not
        // its baseline corner.
        geometry.center();
        return geometry;
      }),
    [font],
  );

  return (
    <Billboard>
      {LETTERS.map(({ char, position }, i) => (
        <mesh key={char} position={position} geometry={geometries[i]}>
          <meshBasicMaterial />
        </mesh>
      ))}
    </Billboard>
  );
}
