/** Authored Paris layout shared by the tuning demo and the website hero. */
export const PARIS_CITY_DEFAULTS = {
  highRiseCount: 300,
  lowRiseCount: 10_000,
  treeCount: 20_000,
  treeShadows: false,
  river: true,
  park: true,
  haussmann: true,
  windows: true,
} as const;

/** The homepage uses lighter density. Geography and layout stay unchanged. */
export const PARIS_HOMEPAGE_CITY_DEFAULTS = {
  ...PARIS_CITY_DEFAULTS,
  treeCount: 12_000,
} as const;

/** The demo's inexpensive dusk environment and aerial-depth treatment. */
export const PARIS_ATMOSPHERE_DEFAULTS = {
  skyEnabled: true,
  turbidity: 1,
  mirrorBelowHorizon: false,
  preset: "earth",
  quality: "medium",
  cubeSize: 256,
  haze: false,
  hazeStrength: 1,
  hazePolicy: "auto",
  apKmPerSlice: 8,
  skyFog: true,
  fogDensity: 0.3,
  fogHeight: 300,
  fogHorizonClamp: true,
} as const;

/**
 * The cloud deck (`clouds.tsx`): a broken sheet of cloud over the city on
 * the dial's clock, casting into the key light's shadow map.
 */
export const PARIS_CLOUD_DEFAULTS = {
  clouds: true,
  /** Weather bias: 0.5 leaves the day cycle alone, 1 is overcast, 0 clear. */
  cloudCoverage: 0.5,
  /** City units: ~1.2 km at the default world scale. */
  cloudAltitude: 240,
  cloudSize: 1,
  cloudDensity: 1,
  cloudSunlight: 1,
  cloudAmbient: 1,
  // Westward, like the sun: a slow wall-clock drift and a kilometre per hour
  // of dial time.
  cloudWind: -1,
  cloudTravel: 200,
  cloudShadows: true,
} as const;
