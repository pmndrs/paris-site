/**
 * Cyclic time-of-day values shared by the dial, CSS sky, and 3D atmosphere.
 * Inputs are fractions of a 24-hour solar day and wrap at midnight.
 */

export type Phase = "NIGHT" | "DUSK" | "GOLDEN" | "DAY";

type RGB = [number, number, number];

interface Palette {
  /** CSS gradient stops, top → bottom. */
  skyTop: RGB;
  skyMid: RGB;
  skyBottom: RGB;
  /** Sun elevation in degrees above the horizon; negative is below. */
  sunElevation: number;
  /** Compass bearing in degrees from north at 0 to east at 90. */
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

export interface TodKeyframe extends Palette {
  phase: Phase;
}

const DAY_HOURS = 24;

/** Homepage solar date: the vernal equinox, centering dawn and dusk on the dial. */
export const HERO_DAY_OF_YEAR = 80;

/** Paris equinox crossings at -6°, 0°, and 6° solar elevation. */
const HERO_SOLAR_HOURS = {
  dawnStart: 5.5362,
  sunrise: 6.1446,
  morningGoldenEnd: 6.7533,
  eveningGoldenStart: 17.5223,
  sunset: 18.1323,
  duskEnd: 18.7424,
} as const;

/**
 * Start half a turn before the midpoint of morning golden hour. A clockwise
 * day cycle therefore reaches golden hour at roughly its halfway mark.
 */
const MORNING_GOLDEN_MIDPOINT =
  (HERO_SOLAR_HOURS.sunrise + HERO_SOLAR_HOURS.morningGoldenEnd) / 2;
export const HERO_INITIAL_TIME_OF_DAY =
  (((MORNING_GOLDEN_MIDPOINT / DAY_HOURS) * 100 - 50) % 100 + 100) % 100;

/** Wraps an hour into [0, 24). */
const wrapHours = (h: number) => ((h % DAY_HOURS) + DAY_HOURS) % DAY_HOURS;

/**
 * Named solar intervals shared by the dial and phase labels.
 *
 * These are the Paris equinox crossings used by the hero atmosphere:
 * dawn/dusk span -6°..0° elevation and golden hour spans 0°..6°.
 */
export const SOLAR_ZONES = [
  {
    label: "Dawn",
    phase: "DUSK",
    startHour: HERO_SOLAR_HOURS.dawnStart,
    endHour: HERO_SOLAR_HOURS.sunrise,
    color: "#c4b5fd",
  },
  {
    label: "Morning golden hour",
    phase: "GOLDEN",
    startHour: HERO_SOLAR_HOURS.sunrise,
    endHour: HERO_SOLAR_HOURS.morningGoldenEnd,
    color: "#fde68a",
  },
  {
    label: "Evening golden hour",
    phase: "GOLDEN",
    startHour: HERO_SOLAR_HOURS.eveningGoldenStart,
    endHour: HERO_SOLAR_HOURS.sunset,
    color: "#f59e0b",
  },
  {
    label: "Dusk",
    phase: "DUSK",
    startHour: HERO_SOLAR_HOURS.sunset,
    endHour: HERO_SOLAR_HOURS.duskEnd,
    color: "#a78bfa",
  },
] as const satisfies ReadonlyArray<{
  label: string;
  phase: Phase;
  startHour: number;
  endHour: number;
  color: string;
}>;

/** Daylight spans the gap between the golden hour zones. */
const DAY_START = SOLAR_ZONES[1].endHour;
const DAY_END = SOLAR_ZONES[2].startHour;

/** Returns the named zone containing the hour. */
export const zoneAt = (hour: number) => {
  const h = wrapHours(hour);
  return (
    SOLAR_ZONES.find((zone) => h >= zone.startHour && h < zone.endHour) ?? null
  );
};

/** Returns the phase containing the solar hour. */
export function phaseFor(hour: number): Phase {
  const h = wrapHours(hour);
  const zone = zoneAt(h);
  if (zone) return zone.phase;
  return h >= DAY_START && h < DAY_END ? "DAY" : "NIGHT";
}

/** Cyclic palette keyframes in solar-hour order. */
const KEYFRAMES: (Palette & { hour: number })[] = [
  {
    // End of deep night, as the sun reaches -14° elevation.
    hour: 4.71,
    skyTop: [7, 11, 24],
    skyMid: [11, 18, 38],
    skyBottom: [0, 0, 0],
    sunElevation: -14,
    sunAzimuth: 74,
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
    // Dawn twilight.
    hour: 5.84,
    skyTop: [20, 26, 56],
    skyMid: [30, 38, 74],
    skyBottom: [5, 7, 15],
    sunElevation: -3,
    sunAzimuth: 87,
    sunColor: [170, 165, 205],
    sunIntensity: 0.9,
    ambientColor: [45, 52, 90],
    ambientIntensity: 0.5,
    windowLight: 0.72,
    starOpacity: 0.5,
    cityColor: [26, 28, 38],
    towerColor: [96, 98, 120],
  },
  {
    // Morning golden hour with cooler tones.
    hour: 6.55,
    skyTop: [54, 50, 92],
    skyMid: [132, 96, 96],
    skyBottom: [20, 16, 26],
    sunElevation: 4,
    sunAzimuth: 95,
    sunColor: [255, 184, 136],
    sunIntensity: 2.1,
    ambientColor: [92, 78, 94],
    ambientIntensity: 0.62,
    windowLight: 0.3,
    starOpacity: 0.08,
    cityColor: [56, 50, 56],
    towerColor: [126, 116, 122],
  },
  {
    // Hold the daylight palette across the equinox day.
    hour: 8,
    skyTop: [76, 124, 184],
    skyMid: [143, 178, 214],
    skyBottom: [26, 36, 48],
    sunElevation: 18,
    sunAzimuth: 112,
    sunColor: [255, 246, 232],
    sunIntensity: 2.5,
    ambientColor: [150, 175, 205],
    ambientIntensity: 0.82,
    windowLight: 0,
    starOpacity: 0,
    cityColor: [96, 102, 116],
    towerColor: [150, 152, 168],
  },
  {
    hour: 12,
    skyTop: [82, 132, 192],
    skyMid: [150, 185, 220],
    skyBottom: [28, 38, 50],
    sunElevation: 41,
    sunAzimuth: 177,
    sunColor: [255, 250, 240],
    sunIntensity: 2.6,
    ambientColor: [158, 182, 210],
    ambientIntensity: 0.85,
    windowLight: 0,
    starOpacity: 0,
    cityColor: [100, 106, 120],
    towerColor: [154, 156, 172],
  },
  {
    hour: 16,
    skyTop: [76, 124, 184],
    skyMid: [143, 178, 214],
    skyBottom: [26, 36, 48],
    sunElevation: 20,
    sunAzimuth: 245,
    sunColor: [255, 246, 232],
    sunIntensity: 2.5,
    ambientColor: [150, 175, 205],
    ambientIntensity: 0.82,
    windowLight: 0,
    starOpacity: 0,
    cityColor: [96, 102, 116],
    towerColor: [150, 152, 168],
  },
  {
    // Evening golden hour.
    hour: 17.73,
    skyTop: [59, 47, 86],
    skyMid: [140, 90, 83],
    skyBottom: [22, 15, 24],
    sunElevation: 4,
    sunAzimuth: 265,
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
    hour: 18.44,
    skyTop: [20, 26, 56],
    skyMid: [27, 34, 68],
    skyBottom: [5, 7, 15],
    sunElevation: -3,
    sunAzimuth: 274,
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
    hour: 19.57,
    skyTop: [7, 11, 24],
    skyMid: [11, 18, 38],
    skyBottom: [0, 0, 0],
    sunElevation: -14,
    sunAzimuth: 287,
    sunColor: [150, 170, 220],
    sunIntensity: 0.35,
    ambientColor: [30, 40, 70],
    ambientIntensity: 0.35,
    windowLight: 1,
    starOpacity: 1,
    cityColor: [16, 17, 22],
    towerColor: [78, 82, 100],
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Interpolates bearings across the shortest arc. */
const lerpAngle = (a: number, b: number, t: number) => {
  const delta = ((((b - a) % 360) + 540) % 360) - 180;
  const angle = a + delta * t;
  return ((angle % 360) + 360) % 360;
};

/** Smooths keyframe joins. */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export const rgbToCss = (c: RGB) =>
  `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`;

/** Packs an RGB triple into the 0xRRGGBB integer THREE.Color wants. */
export const rgbToHex = (c: RGB) =>
  (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);

/** Returns the keyframes and eased position for an hour. */
function segmentAt(hour: number) {
  const h = wrapHours(hour);
  // Use the segment that wraps midnight by default.
  let i = KEYFRAMES.length - 1;
  for (let k = 0; k < KEYFRAMES.length - 1; k++) {
    if (h >= KEYFRAMES[k].hour && h < KEYFRAMES[k + 1].hour) {
      i = k;
      break;
    }
  }
  const a = KEYFRAMES[i];
  const b = KEYFRAMES[(i + 1) % KEYFRAMES.length];
  return {
    a,
    b,
    f: smoothstep(wrapHours(h - a.hour) / wrapHours(b.hour - a.hour)),
  };
}

/** Returns the cyclic palette at a day fraction. */
export function todAt(t: number): TodKeyframe {
  const hour = wrapHours(t * DAY_HOURS);
  const { a, b, f } = segmentAt(hour);

  return {
    phase: phaseFor(hour),
    skyTop: lerpRGB(a.skyTop, b.skyTop, f),
    skyMid: lerpRGB(a.skyMid, b.skyMid, f),
    skyBottom: lerpRGB(a.skyBottom, b.skyBottom, f),
    sunElevation: lerp(a.sunElevation, b.sunElevation, f),
    sunAzimuth: lerpAngle(a.sunAzimuth, b.sunAzimuth, f),
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
