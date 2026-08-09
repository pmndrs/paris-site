/**
 * Every tunable of the flip grid, in one place.
 *
 * The demo page drives these from Leva; the site will import the defaults and
 * pass an override or two. Splitting them out of the component keeps the Leva
 * dependency on the demo side of the boundary — nothing under `components/`
 * imports it.
 */
export type FlipGridConfig = {
  /** Grid resolution. Changing either remounts the scene — see `flip-grid.tsx`. */
  cols: number;
  rows: number;

  /** Tile edge as a fraction of the cell, so a hairline gutter shows through. */
  fill: number;
  /** Tile depth as a fraction of the tile edge. This is what sells the flip. */
  thickness: number;

  /** Flip radius around the cursor, in cells. */
  radius: number;
  /** Seconds a tile stays flipped after the cursor has moved off it. */
  hold: number;

  /** Angular spring driving the flip. Damping below ~2·sqrt(stiffness) overshoots. */
  stiffness: number;
  damping: number;
  /** Upper bound on the per-instance mass multiplier. 0 makes every tile identical. */
  massJitter: number;

  /** Face colours: front (resting), back (flipped), and the four edges. */
  front: string;
  back: string;
  edge: string;

  /** Roughness of the gold face. Lower is sharper and more mirror-like. */
  goldRoughness: number;

  /** The procedural environment the gold reflects: a ground/sky gradient... */
  ground: string;
  sky: string;
  /** ...plus one bright band, which is the highlight that sweeps during a flip. */
  strip: string;
  /** Height of that band in the reflection, -1..1. */
  stripHeight: number;
  stripWidth: number;
  /** Overall strength of the fake reflection. */
  envStrength: number;
};

export const FLIP_GRID_DEFAULTS: FlipGridConfig = {
  cols: 56,
  rows: 32,

  fill: 0.82,
  thickness: 0.09,

  radius: 3.2,
  hold: 3,

  stiffness: 60,
  damping: 9,
  massJitter: 1.4,

  front: "#15151a",
  back: "#e0b365",
  edge: "#4a3a22",

  goldRoughness: 0.22,

  ground: "#14141c",
  sky: "#3a4665",
  strip: "#fff0cf",
  stripHeight: 0.05,
  stripWidth: 0.5,
  envStrength: 1,
};
