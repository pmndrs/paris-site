"use client";

import { Billboard, Center, Text3D } from "@react-three/drei";

/**
 * The PMNDRS lettering, restored from Faraz's `Text.tsx` — specifically the
 * commented-out PARIS-poster layout rather than the two-line version that
 * was live: single huge letters stepping down the tower, alternating sides,
 * the way the reference photo stacks P-A-R-I-S around the spire. Positions
 * are in city units against the ~24-unit tower, so the letters keep his
 * poster proportions (letter ≈ ⅕ tower height).
 *
 * One `<Billboard>` wraps the whole arrangement: the letters hold their
 * positions in the tower's frame but always face the orbiting camera, so
 * every azimuth reads as the poster. Plain white basic material, exactly
 * like the original — already-white pixels don't need bloom's help.
 */

const FONT_URL = "/hero-demo/Geist_SemiBold.json";

const LETTERS: { char: string; position: [number, number, number] }[] = [
  { char: "P", position: [-4.5, 20, 0] },
  { char: "M", position: [4, 16.5, 0] },
  { char: "N", position: [-6, 13, 0] },
  { char: "D", position: [4.5, 9.5, 0] },
  { char: "R", position: [-7, 6, 0] },
  { char: "S", position: [5, 2.8, 0] },
];

export function Lettering() {
  return (
    <Billboard>
      {LETTERS.map(({ char, position }) => (
        <group key={char} position={position}>
          <Center>
            <Text3D
              font={FONT_URL}
              size={5}
              // TextGeometry's extrusion depth DEFAULTS TO 50 units when
              // unset — deeper than the letters are tall. Poster letters
              // want to be near-flat slabs.
              depth={0.4}
              bevelEnabled
              bevelSize={0.1}
              bevelThickness={0.1}
              bevelSegments={3}
              curveSegments={12}
            >
              {char}
              <meshBasicMaterial />
            </Text3D>
          </Center>
        </group>
      ))}
    </Billboard>
  );
}
