/**
 * The hero's time-of-day scrubber.
 *
 * The original design doc snapped between four hardcoded CSS gradients. Here the
 * same four are keyframes that get interpolated continuously, because the sky now
 * also has to drive real lights and fog in the R3F scene — stepping those in four
 * jumps looks broken in 3D. The phase *label* still flips at the doc's original
 * thresholds (0.2 / 0.45 / 0.7) so the UI reads the same.
 */

export type Phase = "NIGHT" | "DUSK" | "GOLDEN" | "DAY";

type RGB = [number, number, number];

export interface TodKeyframe {
  phase: Phase;
  /** CSS gradient stops, top → bottom. */
  skyTop: RGB;
  skyMid: RGB;
  skyBottom: RGB;
  /** Sun elevation in degrees above the horizon; negative is below. */
  sunElevation: number;
  sunAzimuth: number;
  sunColor: RGB;
  sunIntensity: number;
  ambientColor: RGB;
  ambientIntensity: number;
  /** Emissive strength of building windows. */
  windowLight: number;
  /** Star field opacity. */
  starOpacity: number;
  /** Base colour of the city blocks. */
  cityColor: RGB;
  towerColor: RGB;
}

const KEYFRAMES: TodKeyframe[] = [
  {
    phase: "NIGHT",
    skyTop: [7, 11, 24],
    skyMid: [11, 18, 38],
    skyBottom: [0, 0, 0],
    sunElevation: -14,
    sunAzimuth: 210,
    sunColor: [150, 170, 220],
    sunIntensity: 0.35,
    ambientColor: [30, 40, 70],
    ambientIntensity: 0.35,
    windowLight: 1,
    starOpacity: 1,
    cityColor: [16, 17, 22],
    towerColor: [78, 82, 100],
  },
  {
    phase: "DUSK",
    skyTop: [20, 26, 56],
    skyMid: [27, 34, 68],
    skyBottom: [5, 7, 15],
    sunElevation: 2,
    sunAzimuth: 240,
    sunColor: [190, 150, 190],
    sunIntensity: 0.9,
    ambientColor: [45, 52, 90],
    ambientIntensity: 0.5,
    windowLight: 0.72,
    starOpacity: 0.5,
    cityColor: [26, 28, 38],
    towerColor: [96, 98, 120],
  },
  {
    phase: "GOLDEN",
    skyTop: [59, 47, 86],
    skyMid: [140, 90, 83],
    skyBottom: [22, 15, 24],
    sunElevation: 9,
    sunAzimuth: 268,
    sunColor: [255, 176, 118],
    sunIntensity: 2.1,
    ambientColor: [96, 74, 86],
    ambientIntensity: 0.62,
    windowLight: 0.3,
    starOpacity: 0.08,
    cityColor: [58, 48, 52],
    towerColor: [128, 114, 116],
  },
  {
    phase: "DAY",
    skyTop: [76, 124, 184],
    skyMid: [143, 178, 214],
    skyBottom: [26, 36, 48],
    sunElevation: 46,
    sunAzimuth: 300,
    sunColor: [255, 246, 232],
    sunIntensity: 2.6,
    ambientColor: [150, 175, 205],
    ambientIntensity: 0.85,
    windowLight: 0,
    starOpacity: 0,
    cityColor: [96, 102, 116],
    towerColor: [150, 152, 168],
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export const rgbToCss = (c: RGB) =>
  `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`;

/** Packs an RGB triple into the 0xRRGGBB integer THREE.Color wants. */
export const rgbToHex = (c: RGB) =>
  (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);

/** Phase label. Thresholds are the design doc's originals. */
export function phaseFor(t: number): Phase {
  if (t < 0.2) return "NIGHT";
  if (t < 0.45) return "DUSK";
  if (t < 0.7) return "GOLDEN";
  return "DAY";
}

/** Continuous blend across the four keyframes. `t` is 0..1. */
export function todAt(t: number): TodKeyframe {
  const clamped = Math.min(1, Math.max(0, t));
  const span = 1 / (KEYFRAMES.length - 1);
  const i = Math.min(KEYFRAMES.length - 2, Math.floor(clamped / span));
  const f = (clamped - i * span) / span;

  const a = KEYFRAMES[i];
  const b = KEYFRAMES[i + 1];

  return {
    phase: phaseFor(clamped),
    skyTop: lerpRGB(a.skyTop, b.skyTop, f),
    skyMid: lerpRGB(a.skyMid, b.skyMid, f),
    skyBottom: lerpRGB(a.skyBottom, b.skyBottom, f),
    sunElevation: lerp(a.sunElevation, b.sunElevation, f),
    sunAzimuth: lerp(a.sunAzimuth, b.sunAzimuth, f),
    sunColor: lerpRGB(a.sunColor, b.sunColor, f),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, f),
    ambientColor: lerpRGB(a.ambientColor, b.ambientColor, f),
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, f),
    windowLight: lerp(a.windowLight, b.windowLight, f),
    starOpacity: lerp(a.starOpacity, b.starOpacity, f),
    cityColor: lerpRGB(a.cityColor, b.cityColor, f),
    towerColor: lerpRGB(a.towerColor, b.towerColor, f),
  };
}

/** The CSS backdrop behind the canvas, matching the doc's three-stop gradient. */
export function skyGradient(tod: TodKeyframe) {
  return `linear-gradient(180deg, ${rgbToCss(tod.skyTop)} 0%, ${rgbToCss(
    tod.skyMid,
  )} 48%, ${rgbToCss(tod.skyBottom)} 100%)`;
}

/** Sun position in world space, from elevation/azimuth. */
export function sunPosition(
  tod: TodKeyframe,
  radius = 60,
): [number, number, number] {
  const el = (tod.sunElevation * Math.PI) / 180;
  const az = (tod.sunAzimuth * Math.PI) / 180;
  return [
    radius * Math.cos(el) * Math.cos(az),
    radius * Math.sin(el),
    radius * Math.cos(el) * Math.sin(az),
  ];
}
