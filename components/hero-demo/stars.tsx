"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber/webgpu";
import { useSky } from "@pmndrs/sky/react";
import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

/** The one getter we need off the `Sky` instance. */
interface SkyWithSun {
  sunElevation: number;
}

export interface StarsOptions {
  /** How many stars to scatter over the dome. */
  count?: number;
  /** Overall luminance of the field. */
  intensity?: number;
  /**
   * Star diameter in raster pixels — the faintest run 0.55x this and the
   * brightest 1.35x. Raster pixels, not CSS: see the note on `scaleNode`.
   */
  size?: number;
  /** Peak twinkle depth, 0..1. */
  twinkle?: number;
  /** Solar time in hours, shared with the atmosphere. */
  timeOfDay?: number;
  /** Observer latitude. Paris by default. */
  latitude?: number;
  /** Calendar day, shared with the atmosphere's solar model. */
  dayOfYear?: number;
  /** Which world axis points north. */
  north?: string;
}

/**
 * Sun elevations, in degrees, bounding the twilight ramp.
 *
 * Measured against this scene rather than chosen. Midnight on the workshop date
 * only reaches −17.7° — late June in Paris never gets an astronomical night —
 * so a textbook −18° end would mean the field never quite arrives. And the
 * hero's default view sits at −2.9°, barely past sunset, which is where the one
 * liberty here is taken: the ramp opens at +1° rather than the −6° civil
 * twilight where a dozen stars would really be out, so the shipping frame gets
 * its handful of first magnitudes instead of a bare sky. Everything after that
 * point is the honest order.
 */
const TWILIGHT_START = 1;
const TWILIGHT_END = -15;

/** Well past the city, comfortably inside the camera's 7000 far plane. */
const DOME_RADIUS = 4000;

/** A low-cost veil rather than a full-screen environment texture. */
const MILKY_WAY_CLOUDS = 176;

interface BrightStar {
  /** Right ascension, decimal hours. */
  ra: number;
  /** Declination, degrees. */
  dec: number;
  /** Apparent visual magnitude. Lower is brighter. */
  magnitude: number;
  /** 0 is amber, 1 is blue-white. */
  tone: number;
}

/**
 * The bright-star skeleton of the northern summer sky.
 *
 * These are the stars that make the field feel like a place rather than a
 * particle system: the Summer Triangle, the Big Dipper, Cassiopeia, and the
 * bright southern/ecliptic markers around a June night. The procedural field
 * fills between them, but is capped below their brightness so these familiar
 * asterisms always lead the eye.
 */
const BRIGHT_STARS: BrightStar[] = [
  // Summer Triangle.
  { ra: 18.6156, dec: 38.7837, magnitude: 0.03, tone: 0.82 }, // Vega
  { ra: 19.8464, dec: 8.8683, magnitude: 0.77, tone: 0.88 }, // Altair
  { ra: 20.6905, dec: 45.2803, magnitude: 1.25, tone: 0.72 }, // Deneb
  // The June meridian and southern horizon.
  { ra: 14.261, dec: 19.1824, magnitude: -0.05, tone: 0.12 }, // Arcturus
  { ra: 13.4199, dec: -11.1613, magnitude: 0.98, tone: 0.9 }, // Spica
  { ra: 16.4901, dec: -26.432, magnitude: 1.06, tone: 0.02 }, // Antares
  { ra: 10.1395, dec: 11.9672, magnitude: 1.35, tone: 0.86 }, // Regulus
  { ra: 7.655, dec: 5.225, magnitude: 0.34, tone: 0.5 }, // Procyon
  { ra: 7.7553, dec: 28.0262, magnitude: 1.14, tone: 0.24 }, // Pollux
  { ra: 7.5767, dec: 31.8883, magnitude: 1.58, tone: 0.72 }, // Castor
  { ra: 22.9608, dec: -29.6222, magnitude: 1.16, tone: 0.78 }, // Fomalhaut
  // Big Dipper, including the dimmer bowl stars so its shape arrives later.
  { ra: 11.0621, dec: 61.7508, magnitude: 1.79, tone: 0.28 }, // Dubhe
  { ra: 11.0307, dec: 56.3824, magnitude: 2.37, tone: 0.75 }, // Merak
  { ra: 11.8972, dec: 53.6948, magnitude: 2.41, tone: 0.7 }, // Phecda
  { ra: 12.2571, dec: 57.0326, magnitude: 3.31, tone: 0.72 }, // Megrez
  { ra: 12.9005, dec: 55.9598, magnitude: 1.77, tone: 0.88 }, // Alioth
  { ra: 13.3987, dec: 54.9254, magnitude: 2.23, tone: 0.74 }, // Mizar
  { ra: 13.7923, dec: 49.3133, magnitude: 1.86, tone: 0.88 }, // Alkaid
  // Cassiopeia and the north marker.
  { ra: 0.1529, dec: 59.1498, magnitude: 2.27, tone: 0.66 }, // Caph
  { ra: 0.6751, dec: 56.5373, magnitude: 2.24, tone: 0.18 }, // Schedar
  { ra: 0.9451, dec: 60.7167, magnitude: 2.47, tone: 0.8 }, // Gamma Cas
  { ra: 1.4303, dec: 60.2353, magnitude: 2.68, tone: 0.78 }, // Ruchbah
  { ra: 1.9066, dec: 63.67, magnitude: 3.35, tone: 0.85 }, // Segin
  { ra: 2.5303, dec: 89.2641, magnitude: 1.98, tone: 0.48 }, // Polaris
];

const DEG = Math.PI / 180;
const EQUATORIAL_NORTH = new THREE.Vector3(0, 1, 0);

/** A unit direction in equatorial coordinates: x/z is RA and y is declination. */
function equatorialDirection(raHours: number, decDegrees: number) {
  const ra = raHours * 15 * DEG;
  const dec = decDegrees * DEG;
  const cosDec = Math.cos(dec);
  return new THREE.Vector3(
    cosDec * Math.cos(ra),
    Math.sin(dec),
    cosDec * Math.sin(ra),
  );
}

/** IAU galactic north pole, which fixes the real Milky Way great circle. */
const GALACTIC_NORTH = equatorialDirection(12.8595, 27.1284);
const GALACTIC_BASIS_A = new THREE.Vector3()
  .crossVectors(GALACTIC_NORTH, EQUATORIAL_NORTH)
  .normalize();
const GALACTIC_BASIS_B = new THREE.Vector3()
  .crossVectors(GALACTIC_NORTH, GALACTIC_BASIS_A)
  .normalize();

function directionOnGalacticPlane(angle: number, offset = 0) {
  return new THREE.Vector3()
    .addScaledVector(GALACTIC_BASIS_A, Math.cos(angle) * Math.cos(offset))
    .addScaledVector(GALACTIC_BASIS_B, Math.sin(angle) * Math.cos(offset))
    .addScaledVector(GALACTIC_NORTH, Math.sin(offset))
    .normalize();
}

/**
 * Equatorial sky to the local horizon.
 *
 * The atmosphere models local solar time rather than a longitude/timezone, so
 * local sidereal time is anchored to the Sun's approximate RA for the day.
 * That keeps sunset and the seasonal star field in step without introducing a
 * second clock that can disagree with `@pmndrs/sky`.
 */
function celestialOrientation(
  latitude: number,
  dayOfYear: number,
  timeOfDay: number,
  north: string,
) {
  const obliquity = 23.4393 * DEG;
  const solarLongitude = ((dayOfYear - 80.25) / 365.2422) * Math.PI * 2;
  const solarRa = Math.atan2(
    Math.cos(obliquity) * Math.sin(solarLongitude),
    Math.cos(solarLongitude),
  );
  const sidereal =
    solarRa + (timeOfDay - 12) * 15 * 1.0027379 * DEG;
  const sinSidereal = Math.sin(sidereal);
  const cosSidereal = Math.cos(sidereal);
  const lat = latitude * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);

  // Rows map equatorial x/y/z to east/up/north in world x/y/z.
  const horizon = new THREE.Matrix4().set(
    -sinSidereal,
    0,
    cosSidereal,
    0,
    cosLat * cosSidereal,
    sinLat,
    cosLat * sinSidereal,
    0,
    -sinLat * cosSidereal,
    cosLat,
    -sinLat * sinSidereal,
    0,
    0,
    0,
    0,
    1,
  );

  const northRotation =
    north === "-Z"
      ? Math.PI
      : north === "+X"
        ? Math.PI / 2
        : north === "-X"
          ? -Math.PI / 2
          : 0;

  return new THREE.Matrix4()
    .makeRotationY(northRotation)
    .multiply(horizon);
}

/**
 * `instancedBufferAttribute` is declared as `Node<unknown>` — a node with no
 * component type, and therefore no swizzles. What it returns at runtime is
 * whatever the attribute's `itemSize` says; the declaration is just lossy.
 * These restore the type the buffer actually has so `.x` / `.xyz` typecheck.
 */
const instancedVec3 = (attr: THREE.InstancedBufferAttribute) =>
  TSL.instancedBufferAttribute(attr) as unknown as ReturnType<typeof TSL.vec3>;
const instancedVec4 = (attr: THREE.InstancedBufferAttribute) =>
  TSL.instancedBufferAttribute(attr) as unknown as ReturnType<typeof TSL.vec4>;

/** Deterministic PRNG, so the constellation is the same on every load. */
function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The night sky.
 *
 * **Why not `@pmndrs/sky`'s own star layer.** It has one, it is genuinely free
 * (a hash grid already compiled into the sky shader behind a zeroed uniform),
 * and it is unusable here: `Sky.attach` assigns the *baked cube* as
 * `scene.background`, so everything the sky draws reaches the screen through a
 * 256px-per-face cube. A star is ~0.03° across and a cube texel at that size is
 * ~0.35°, so the field is either dropped by the sampling grid or, where a texel
 * does catch one, magnified into a soft square blob. Tried in the browser
 * before this was written; it looks exactly as bad as it sounds.
 *
 * So the stars are real geometry: one instanced quad each, drawn at raster
 * resolution where a star can be a star. The pinpricks are one draw call; a
 * second, tiny instanced layer supplies the Milky Way veil. Only their sparse
 * pixels get shaded, rather than adding another full-screen post pass.
 *
 * **How it merges with the day/night cycle.** Not by a cross-fade on the
 * slider: each star carries a magnitude, and its threshold is that magnitude,
 * so the brightest few break through at dusk and the faint majority fill in
 * over the following hours — the order the real sky does it in. At the hero's
 * default that is a handful of pinpricks high in the frame; drag `timeOfDay` to
 * midnight and the field is complete. The bright anchors use real equatorial
 * coordinates and the faint field follows the IAU galactic plane, oriented for
 * Paris and the selected date. The ramp reads the sky's own
 * `sunElevation`, so it stays right if the latitude or date ever move, and
 * daylight needs no special case: `darkness` is simply 0.
 *
 * **Why it stays out of the way.** Stars fade out toward the horizon, which is
 * both true (atmospheric extinction) and what keeps them off the skyline and
 * out of the sunset band — the busiest part of the frame stays clean, and the
 * open sky above the tower is where the eye finds them instead.
 *
 * Nothing here handles `prefers-reduced-motion`: the hero puts the whole canvas
 * into `frameloop="demand"` for those visitors, which stops the twinkle along
 * with everything else.
 */
export function Stars({
  count = 4200,
  intensity = 2.8,
  size = 5.25,
  twinkle = 0.28,
  timeOfDay = 20.5,
  latitude = 48.8566,
  dayOfYear = 176,
  north = "+Z",
}: StarsOptions) {
  const sky = useSky() as unknown as SkyWithSun | null;
  const orientation = useMemo(
    () => celestialOrientation(latitude, dayOfYear, timeOfDay, north),
    [latitude, dayOfYear, timeOfDay, north],
  );

  /**
   * Live uniforms. `darkness` is the twilight ramp, written every frame from
   * the sun; the rest are knobs. All uniforms rather than shader constants, so
   * tuning never costs a recompile.
   */
  const uniforms = useMemo(
    () => ({
      time: TSL.uniform(0),
      darkness: TSL.uniform(0),
      intensity: TSL.uniform(intensity),
      twinkle: TSL.uniform(twinkle),
      size: TSL.uniform(size),
    }),
    // Built once; the effect below owns the values from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    uniforms.intensity.value = intensity;
    uniforms.twinkle.value = twinkle;
    uniforms.size.value = size;
  }, [uniforms, intensity, twinkle, size]);

  const { geometry, material, veilGeometry, veilMaterial } = useMemo(() => {
    const random = makeRandom(0x5eed);

    const totalCount = count + BRIGHT_STARS.length;
    const offsets = new Float32Array(totalCount * 3);
    // (magnitude, phase, hue, twinkle speed) per star.
    const traits = new Float32Array(totalCount * 4);

    for (let i = 0; i < count; i++) {
      // Most stars remain an even celestial field. A third are drawn toward
      // the real galactic plane, which creates the Milky Way's extra density
      // without a texture or a conspicuous procedural stripe.
      const inMilkyWay = random() < 0.34;
      let direction: THREE.Vector3;
      if (inMilkyWay) {
        const angle = random() * Math.PI * 2;
        // Four samples produce a soft bell around the plane with few hard
        // outliers; the widest points sit about 14° from its centre.
        const offset =
          (random() + random() + random() + random() - 2) * 0.12;
        direction = directionOnGalacticPlane(angle, offset);
      } else {
        // Uniform in solid angle: a sphere's area is linear in y.
        const y = random() * 2 - 1;
        const radius = Math.sqrt(Math.max(0, 1 - y * y));
        const ra = random() * Math.PI * 2;
        direction = new THREE.Vector3(
          Math.cos(ra) * radius,
          y,
          Math.sin(ra) * radius,
        );
      }

      offsets[i * 3] = direction.x * DOME_RADIUS;
      offsets[i * 3 + 1] = direction.y * DOME_RADIUS;
      offsets[i * 3 + 2] = direction.z * DOME_RADIUS;

      // Magnitude, skewed hard toward the faint end. A real sky is mostly dim
      // stars around a handful of bright ones. The random field is capped so
      // the named bright-star skeleton below owns the first twilight arrivals.
      traits[i * 4] =
        Math.pow(random(), inMilkyWay ? 3 : 2.55) *
        (inMilkyWay ? 0.68 : 0.8);
      traits[i * 4 + 1] = random() * Math.PI * 2;
      // Dense galactic stars lean a touch warmer; isolated stars span the full
      // natural white-to-blue range.
      traits[i * 4 + 2] = inMilkyWay ? random() * 0.72 : random();
      // Per-star twinkle rate, so the field never pulses in step.
      traits[i * 4 + 3] = 0.35 + random() * 0.5;
    }

    for (let i = 0; i < BRIGHT_STARS.length; i++) {
      const index = count + i;
      const star = BRIGHT_STARS[i];
      const direction = equatorialDirection(star.ra, star.dec);

      offsets[index * 3] = direction.x * DOME_RADIUS;
      offsets[index * 3 + 1] = direction.y * DOME_RADIUS;
      offsets[index * 3 + 2] = direction.z * DOME_RADIUS;

      // Translate visual magnitude into the shader's 0..1 brightness scale.
      // The long range preserves useful spacing between magnitude 0, 1 and 2
      // during twilight instead of crushing every named star to white.
      traits[index * 4] = THREE.MathUtils.clamp(
        1 - (star.magnitude + 1.5) / 12,
        0.46,
        1,
      );
      traits[index * 4 + 1] = random() * Math.PI * 2;
      traits[index * 4 + 2] = star.tone;
      traits[index * 4 + 3] = 0.28 + random() * 0.38;
    }

    // One quad, instanced. `SpriteNodeMaterial` builds the billboard from
    // `positionGeometry.xy`, so the plane supplies the corners and the `uv`
    // while the instanced attributes supply the star.
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.attributes.position);
    geometry.setAttribute("uv", quad.attributes.uv);
    quad.dispose();

    const offsetAttr = new THREE.InstancedBufferAttribute(offsets, 3);
    const traitAttr = new THREE.InstancedBufferAttribute(traits, 4);
    geometry.setAttribute("aOffset", offsetAttr);
    geometry.setAttribute("aTrait", traitAttr);
    geometry.instanceCount = totalCount;

    const trait = instancedVec4(traitAttr);
    const magnitude = trait.x;
    const phase = trait.y;
    const hue = trait.z;
    const speed = trait.w;

    /**
     * When this star shows up.
     *
     * `darkness` runs 0 at sunset to 1 at the darkest the date reaches, and a
     * star's threshold is its own magnitude inverted — so first magnitudes
     * arrive as soon as the sun is down and the faint majority need real night.
     * The broad overlap keeps any two from switching on together. Its earlier
     * threshold is deliberate: Paris twilight still reveals only the bright
     * tail, but the hero's narrow camera wedge gets more than one lonely dot.
     */
    const threshold = TSL.float(1).sub(magnitude).mul(0.32);
    const emergence = TSL.smoothstep(
      threshold,
      threshold.add(0.34),
      uniforms.darkness,
    );

    /**
     * Extinction toward the horizon — and what keeps the stars off the skyline
     * and out of the sunset band.
     *
     * The window is narrow because the framing is: at polar 93° with a ~35° fov
     * the camera only ever sees about 0–20° of altitude, so a textbook fade
     * reaching full strength at 30° would flatten the entire visible field.
     * This clears the first degree and is fully open by ~6°, which is the top
     * of the buildings and up.
     */
    const altitude = TSL.smoothstep(
      0.015,
      0.1,
      TSL.positionWorld.normalize().y,
    );

    /**
     * Twinkle as two detuned sines multiplied: neither period is a multiple of
     * the other, so the field never settles into a visible pulse, and the
     * product sits near zero most of the time — mostly still, with the odd star
     * dipping. Periods land between 7 and 18 seconds, slow enough to be felt
     * rather than watched. One `sin` pair per star per frame.
     */
    const t = uniforms.time.mul(speed);
    const shimmer = TSL.sin(t.add(phase))
      .mul(TSL.sin(t.mul(0.61).add(phase.mul(1.7))))
      .mul(uniforms.twinkle);

    // Faint stars read as white; the bright ones carry what little colour the
    // eye can actually resolve at night.
    const tint = TSL.mix(
      TSL.vec3(1.0, 0.94, 0.88),
      TSL.vec3(0.84, 0.9, 1.0),
      hue,
    );

    // A tight round core for every star. Only the genuinely bright stars earn
    // the restrained four-ray glint; applying it to the field would turn the
    // sky into glitter wallpaper.
    const centeredUv = TSL.uv().sub(0.5);
    const core = TSL.smoothstep(1, 0, centeredUv.length().mul(2)).pow(2.35);
    const verticalRay = TSL.smoothstep(0.07, 0, TSL.abs(centeredUv.x))
      .pow(2)
      .mul(TSL.smoothstep(0.5, 0, TSL.abs(centeredUv.y)).pow(2));
    const horizontalRay = TSL.smoothstep(0.055, 0, TSL.abs(centeredUv.y))
      .pow(2)
      .mul(TSL.smoothstep(0.5, 0, TSL.abs(centeredUv.x)).pow(2));
    const glint = verticalRay
      .add(horizontalRay)
      .mul(TSL.smoothstep(0.76, 0.94, magnitude))
      .mul(0.34);
    const shape = core.add(glint);

    const luminance = TSL.float(0.3)
      .add(magnitude.mul(0.7))
      .mul(TSL.float(1).add(shimmer))
      .mul(emergence)
      .mul(altitude)
      .mul(uniforms.intensity);

    const material = new THREE.SpriteNodeMaterial();
    material.positionNode = instancedVec3(offsetAttr);
    material.sizeAttenuation = false;

    /**
     * Size the quad in raster pixels rather than world units.
     *
     * `sizeAttenuation: false` already cancels the perspective divide, which
     * leaves a *constant fraction of the viewport* — the one thing a star must
     * not be. Hold the fraction and the quad shrinks with the render target, so
     * on a 1x display it lands under a pixel: the raster misses the falloff's
     * peak, the star loses most of its brightness, and what survives crawls
     * between pixels as the camera turns. Measured, not assumed — at dpr 1 the
     * field all but disappeared.
     *
     * `SpriteNodeMaterial` puts the quad's clip-space half-height at
     * `0.5 · P₁₁ · scale`, so `scale = 2·px / (P₁₁ · height)` pins it to `px`
     * pixels. `screenSize` resolves against whatever target is being rendered —
     * the scene pass at 1/renderScale, not the display — so this tracks FSR's
     * render scale, the device pixel ratio and any resize on its own, with no
     * props to thread and nothing to recompute per frame. (FSR's jitter shifts
     * the projection's translation, never `P₁₁`.)
     *
     * Column indexing on a matrix node is how three itself reads matrices in
     * TSL (`modelWorldMatrix[0].xyz`, in this very material), but the typings
     * describe mat4 only as a whole — hence naming the column type rather than
     * moving the value to the CPU for the compiler's sake.
     */
    const projColumns = TSL.cameraProjectionMatrix as unknown as ReturnType<
      typeof TSL.vec4
    >[];
    material.scaleNode = uniforms.size
      .mul(TSL.float(0.55).add(magnitude.mul(0.8)))
      .mul(2)
      .div(projColumns[1].y.mul(TSL.screenSize.y));

    material.colorNode = TSL.vec4(tint.mul(shape).mul(TSL.max(luminance, 0)), 1);
    material.transparent = true;
    material.blending = THREE.AdditiveBlending;
    /**
     * Depth *test* on, depth *write* off, and the pairing is the whole trick:
     * the test lets the tower's ironwork and the skyline occlude stars for
     * free, while not writing depth leaves the sky's far value in the
     * attachment — which is what the post graph's `isSky` check reads, so the
     * height fog passes over the stars instead of veiling them to grey.
     */
    material.depthTest = true;
    material.depthWrite = false;
    // Stars are at infinity; distance fog has no business touching them. Only
    // reachable with the sky off (the `fogExp2` fallback in `tower-canvas`) —
    // the sky's own height fog runs in the post graph and is already handled by
    // the depth-write choice above — but it costs a line to be right in both.
    material.fog = false;

    /**
     * A sparse, soft Milky Way veil under the pinpricks.
     *
     * A photographic environment map would cost several megabytes, need a
     * visible third-party credit, and fight the live atmosphere. These 176
     * feathered sprites sit on the IAU galactic plane instead: a second draw
     * call with a few overlapping pixels, direct at raster resolution, and no
     * baked-cube softness. It reads as luminous dust, not as pasted scenery.
     */
    const veilOffsets = new Float32Array(MILKY_WAY_CLOUDS * 3);
    // (long-axis pixels, opacity, rotation, warmth) per cloud.
    const veilTraits = new Float32Array(MILKY_WAY_CLOUDS * 4);
    for (let i = 0; i < MILKY_WAY_CLOUDS; i++) {
      const angle =
        (i / MILKY_WAY_CLOUDS) * Math.PI * 2 + (random() - 0.5) * 0.16;
      const offset = (random() + random() - 1) * 0.085;
      const direction = directionOnGalacticPlane(angle, offset);

      veilOffsets[i * 3] = direction.x * (DOME_RADIUS * 0.997);
      veilOffsets[i * 3 + 1] = direction.y * (DOME_RADIUS * 0.997);
      veilOffsets[i * 3 + 2] = direction.z * (DOME_RADIUS * 0.997);
      veilTraits[i * 4] = 110 + random() * 130;
      veilTraits[i * 4 + 1] = 0.025 + random() * 0.04;
      veilTraits[i * 4 + 2] = random() * Math.PI;
      veilTraits[i * 4 + 3] = random();
    }

    const veilQuad = new THREE.PlaneGeometry(1, 1);
    const veilGeometry = new THREE.InstancedBufferGeometry();
    veilGeometry.index = veilQuad.index;
    veilGeometry.setAttribute("position", veilQuad.attributes.position);
    veilGeometry.setAttribute("uv", veilQuad.attributes.uv);
    veilQuad.dispose();

    const veilOffsetAttr = new THREE.InstancedBufferAttribute(veilOffsets, 3);
    const veilTraitAttr = new THREE.InstancedBufferAttribute(veilTraits, 4);
    veilGeometry.setAttribute("aOffset", veilOffsetAttr);
    veilGeometry.setAttribute("aTrait", veilTraitAttr);
    veilGeometry.instanceCount = MILKY_WAY_CLOUDS;

    const veilTrait = instancedVec4(veilTraitAttr);
    const veilUv = TSL.uv().sub(0.5);
    const veilFeather = TSL.smoothstep(1, 0, veilUv.length().mul(2)).pow(2.2);
    const veilMottle = TSL.sin(
      veilUv.x.mul(29).add(veilTrait.z.mul(3.1)),
    )
      .mul(TSL.sin(veilUv.y.mul(23).sub(veilTrait.z.mul(1.7))))
      .mul(0.14)
      .add(0.86);
    const laneCenter = TSL.sin(
      veilUv.x.mul(8).add(veilTrait.z.mul(2)),
    ).mul(0.04);
    const dustLane = TSL.smoothstep(
      0.018,
      0.1,
      TSL.abs(veilUv.y.sub(laneCenter)),
    )
      .mul(0.42)
      .add(0.58);
    const veilAltitude = TSL.smoothstep(
      0.025,
      0.14,
      TSL.positionWorld.normalize().y,
    );
    const veilEmergence = TSL.smoothstep(0.12, 0.82, uniforms.darkness);
    const veilStrength = veilTrait.y
      .mul(veilFeather)
      .mul(veilMottle)
      .mul(dustLane)
      .mul(veilAltitude)
      .mul(veilEmergence)
      .mul(uniforms.intensity)
      .mul(0.32);
    const veilTint = TSL.mix(
      TSL.vec3(0.23, 0.31, 0.56),
      TSL.vec3(0.42, 0.34, 0.38),
      veilTrait.w,
    );

    const veilMaterial = new THREE.SpriteNodeMaterial();
    veilMaterial.positionNode = instancedVec3(veilOffsetAttr);
    veilMaterial.rotationNode = veilTrait.z;
    veilMaterial.sizeAttenuation = false;
    const pixelScale = TSL.float(2).div(
      projColumns[1].y.mul(TSL.screenSize.y),
    );
    veilMaterial.scaleNode = TSL.vec2(
      veilTrait.x,
      veilTrait.x.mul(TSL.float(0.55).add(veilTrait.w.mul(0.25))),
    ).mul(pixelScale);
    veilMaterial.colorNode = TSL.vec4(
      veilTint.mul(TSL.max(veilStrength, 0)),
      1,
    );
    veilMaterial.transparent = true;
    veilMaterial.blending = THREE.AdditiveBlending;
    veilMaterial.depthTest = true;
    veilMaterial.depthWrite = false;
    veilMaterial.fog = false;

    return { geometry, material, veilGeometry, veilMaterial };
  }, [count, uniforms]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      veilGeometry.dispose();
      veilMaterial.dispose();
    },
    [geometry, material, veilGeometry, veilMaterial],
  );

  useFrame((state) => {
    uniforms.time.value = state.elapsed;

    // The twilight ramp, straight off the sky's own solar position.
    const elevation = sky?.sunElevation ?? -90;
    const ramp = (elevation - TWILIGHT_START) / (TWILIGHT_END - TWILIGHT_START);
    uniforms.darkness.value = Math.min(1, Math.max(0, ramp));
  });

  // No ambient sidereal animation: the camera's orbit supplies the imperceptible
  // drift during a visit. The orientation does follow the time dial, though, so
  // a sweep from dusk to midnight raises the correct seasonal sky over Paris.
  // Culling is off because both layers span the dome; a cull can only be wrong.
  return (
    <group matrix={orientation} matrixAutoUpdate={false}>
      <mesh
        geometry={veilGeometry}
        material={veilMaterial}
        frustumCulled={false}
        renderOrder={-2}
      />
      <mesh
        geometry={geometry}
        material={material}
        frustumCulled={false}
        renderOrder={-1}
      />
    </group>
  );
}
