"use client";

import dynamic from "next/dynamic";

/**
 * The client-only boundary for everything 3D.
 *
 * `@react-three/fiber/webgpu` reaches for `localStorage` at module scope, so it
 * cannot appear anywhere in the server render graph — importing a scene
 * directly from a section breaks the build. Sections import from here instead;
 * this module only pulls in `next/dynamic`, and the scenes load client-side.
 *
 * It also keeps three.js out of the initial route bundle, which is what the
 * §4 budget in SPEC.md is about.
 */

export const TrackCanvas = dynamic(
  () => import("./track-object").then((m) => m.TrackCanvas),
  { ssr: false },
);

export const TileGridCanvas = dynamic(
  () => import("./tile-grid").then((m) => m.TileGridCanvas),
  { ssr: false },
);

export const MagicBoxCanvas = dynamic(
  () => import("./magic-box").then((m) => m.MagicBoxCanvas),
  { ssr: false },
);

/** The same scene as its own primary canvas — see /demos/magic-box. */
export const MagicBoxStandalone = dynamic(
  () => import("./magic-box-standalone").then((m) => m.MagicBoxStandalone),
  { ssr: false },
);

export const NoiseFieldCanvas = dynamic(
  () => import("./noise-field").then((m) => m.NoiseFieldCanvas),
  { ssr: false },
);
