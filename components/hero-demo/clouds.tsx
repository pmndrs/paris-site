"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/webgpu";
import { useSky } from "@pmndrs/sky/react";
import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

import { HERO_INITIAL_TIME_OF_DAY } from "@/lib/time-of-day";

import { MOON_DIRECTION } from "./lights";

/**
 * A broken deck of cloud over Paris — the stratocumulus sheet of a Paris
 * sunset photo, flat patches spread across the whole sky, thinning to
 * streaks at the horizon, undersides lit gold by a low sun.
 *
 * We only ever see it from below, and only between 5° and 18° up — the
 * hero's frame stops there — so it is a dome around the camera whose
 * fragment shader marches each view ray through a slab at cloud altitude:
 * five samples between the layer's bottom and its top. The density is
 * Perlin octaves for the sheet's broad shape with inverted Worley cells on
 * top — domed cells are what make lumps round instead of blotchy — against
 * a coverage threshold the weather sets, and a thick column hangs lower in
 * the slab than a thin one. That vertical relief is what the march buys: at
 * these grazing angles a flat sheet can only ever be streaks, while lumps
 * that hang down occlude each other, show their flanks and fade at the
 * edges like the real thing.
 *
 * The shading is the cheap volumetric kind. Light reaching a sample falls
 * off with the cloud above it (Beer's law — a long path when the sun is
 * high, none when it is under the layer at dusk, so the whole base catches
 * fire then), and the column is darkened by how much cloud lies toward the
 * sun from it, read by sampling the density a step up-sun. Thin edges
 * transmit forward scatter, the glow around the holes near the sun. Ambient
 * is the sky's own PMREM read at the horizon, which is what a cloud base
 * actually sees, and thick cores fall toward the grey of a real one.
 *
 * The layer lights the city back: a hemisphere light carries the deck's own
 * sun colour times how much sky it covers — strong when a low sun lights
 * the undersides, a flat grey lift on an overcast noon — so a red sky warms
 * the roofs and streets under it instead of floating over a neutral scene.
 *
 * The clouds carry their own sun rather than the city's key light. The key
 * hands over to the moon from 6° elevation, but a layer at a kilometre still
 * sees the sun until it is a degree under the horizon, and that last stretch
 * is the one that sets it on fire.
 *
 * Shadows are cast on the receiving side, not through the shadow map: the
 * key light's shadow filter (`cloudShadowFilter`, installed by `Lights`)
 * multiplies its ordinary PCF result by the coverage where the sun ray from
 * each shaded point meets the layer. The shade is graded by thickness, soft
 * through the same edge the sky shows, composes correctly with the tower's
 * and the buildings' own shadows, and costs no extra pass. (Casting the
 * layer into the map was tried and rejected: a translucent caster above the
 * city overwrites the buildings' depth, and their shadows vanish under
 * every thin patch.)
 *
 * Weather runs on the sky's clock, not the wall clock. The dial is a
 * time-lapse — the sun sweeps, the stars wheel — so the sheet keeps pace: it
 * streams westward with the sun, the noise boils, and a cloudiness curve a
 * day or two long moves the coverage threshold. It is anchored at the
 * homepage's opening hour so the page always loads to a clear night, and
 * clouds build as the dial moves forward from there — into a partly cloudy
 * morning, an overcast afternoon, a clearing the next night — with a slower
 * swing on top so no two days match. A low-frequency noise on the threshold
 * turns each change into fronts crossing the sky rather than a uniform
 * fade. The clock counts midnight wraps, so consecutive days differ; a slow
 * wall-clock drift keeps the sky alive while the dial rests.
 */

/** The slice of the sky instance the clouds read. */
interface SkyLike {
  sunElevation: number;
  mesh?: { sunDirection?: { value: THREE.Vector3 } };
  baker?: { texture?: THREE.CubeTexture; environmentTexture?: THREE.Texture | null };
}

type Vec2Node = ReturnType<typeof TSL.vec2>;
type Vec3Node = ReturnType<typeof TSL.vec3>;
type FloatNode = ReturnType<typeof TSL.float>;

export interface CloudsOptions {
  /** Weather bias, 0..1: 0.5 leaves the day cycle alone, 1 is overcast, 0 clear. */
  coverage?: number;
  /** Layer altitude in city units (× worldScale metres). */
  altitude?: number;
  /** Feature size multiplier. */
  size?: number;
  /** Opacity of a fully covered patch. */
  density?: number;
  /** Direct-light strength. */
  sunlight?: number;
  /** Sky-ambient strength. */
  ambient?: number;
  /** Wall-clock drift along +x in city units per second; negative is westward. */
  wind?: number;
  /** Solar hours, 0..24 — the sky's own clock. */
  timeOfDay?: number;
  /** Westward travel in city units per hour of dial time. */
  travel?: number;
  /** Shade the city under the layer. */
  shadows?: boolean;
  /** Metres per city unit. */
  worldScale?: number;
  /**
   * The city's key light: the direction the cloud shade is cast along, and
   * the fallback sun when there is no sky to read the real one from.
   */
  lightPosition: [number, number, number];
  lightColor: THREE.ColorRepresentation;
  lightIntensity: number;
  /** 0 by day, 1 at night — brings in the moon and the city glow, fades the shade. */
  night?: number;
  /** The sky's exposure; the sun term tracks it partway, as the sky does fully. */
  exposure?: number;
  /** The post pass's sky fog, so the clouds sit in the same haze as the city. */
  fogDensity?: number;
  fogHeight?: number;
}

/** Slab depth, city units: how far a fully thick column hangs below the layer top. */
const DECK_THICKNESS = 90;
/** Samples per view ray through the slab. */
const MARCH_STEPS = 5;
/** Extinction per step through a fully dense sample. */
const STEP_EXTINCTION = 2.4;
/** How much of the deck's underside radiance comes back down as fill. */
const GLOW_GAIN = 0.6;
/** Base-octave noise frequency, per city unit: lumps a few hundred metres across. */
const NOISE_FREQUENCY = 1 / 380;
/** How far up-sun the self-shadow sample is taken, in base-octave features. */
const SUN_STEP = 0.38;
/** City radius, for the night glow falloff. */
const CITY_RADIUS = 400;
const ALBEDO = 0.92;
/** Dome radius as a fraction of the camera's far plane (1400 × worldScale). */
const DOME_RADIUS = 1300;
/** How dark the ground gets under a fully covered patch. */
const SHADE_STRENGTH = 0.85;

/**
 * The cloudiness curve: two incommensurate swings, a day and a half and
 * three days long, both at their trough at the epoch — the homepage's
 * opening hour — so the page loads to a clear night and clouds build from
 * there, whichever way the dial turns.
 */
const WEATHER_PERIOD_A = 24 * 1.4;
const WEATHER_PERIOD_B = 24 * 3.1;
/** The hour the dial opens on — wherever that moves, the sky loads clear. */
const WEATHER_EPOCH = (HERO_INITIAL_TIME_OF_DAY / 100) * 24;
/** Noise evolution per hour of dial time, and per wall-clock second at rest. */
const BOIL_RATE = 0.06;
const BOIL_IDLE = 0.004;

/** The key light's daytime strength, so sunlit cloud and sunlit city agree. */
const SUN_STRENGTH = 5.5;
/** The homepage's daytime exposure, where that key strength was tuned. */
const DAY_EXPOSURE = 6;
/** Disc colour by elevation — the same bands the visible sun uses. */
const SUN_HIGH = new THREE.Color("#fff1d6");
const SUN_LOW = new THREE.Color("#ffa040");
const SUN_HORIZON = new THREE.Color("#ff5a1f");
/** Faraz's moon, as the night key sees it. */
const MOON_COLOR = new THREE.Color("#aac4ff");
const MOON_STRENGTH = 0.4;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Cloudiness 0..1 at an hour on the weather clock; 0 at the epoch. */
function cloudinessAt(hours: number) {
  const t = hours - WEATHER_EPOCH;
  const a = Math.sin((t * Math.PI * 2) / WEATHER_PERIOD_A - Math.PI / 2);
  const b = Math.sin((t * Math.PI * 2) / WEATHER_PERIOD_B - Math.PI / 2);
  return THREE.MathUtils.clamp(0.5 + 0.5 * (0.6 * a + 0.4 * b), 0, 1);
}

function makeUniforms() {
  return {
    sunDir: TSL.uniform(new THREE.Vector3(0, 1, 0)),
    /** Colour × strength. */
    sunRadiance: TSL.uniform(new THREE.Color(0, 0, 0)),
    moonDir: TSL.uniform(MOON_DIRECTION.clone()),
    moonRadiance: TSL.uniform(new THREE.Color(0, 0, 0)),
    /** The key light: what the ground shade is cast along, and how hard. */
    keyDir: TSL.uniform(new THREE.Vector3(0, 1, 0)),
    shade: TSL.uniform(0),
    night: TSL.uniform(0),
    sunlight: TSL.uniform(1),
    ambient: TSL.uniform(1),
    density: TSL.uniform(1),
    /** Where the day sits on the cloudiness curve, 0..1. */
    cloudiness: TSL.uniform(0),
    /** Noise-space offset along x, city units: dial travel plus drift. */
    windOffset: TSL.uniform(0),
    /** Third noise axis: the slow evolution of the patches. */
    boil: TSL.uniform(0),
    /** Layer top altitude and slab depth, world units. */
    altitude: TSL.uniform(240 * 5),
    thickness: TSL.uniform(DECK_THICKNESS * 5),
    worldScale: TSL.uniform(5),
    noiseScale: TSL.uniform(NOISE_FREQUENCY),
    cityRadius: TSL.uniform(CITY_RADIUS * 5),
    /** Where the finest octave fades out along the view ray, world units. */
    detailNear: TSL.uniform(800 * 5),
    detailFar: TSL.uniform(2400 * 5),
    fogDensity: TSL.uniform(0.3),
    fogHeight: TSL.uniform(300),
  };
}

type CloudUniforms = ReturnType<typeof makeUniforms>;

/**
 * One set of uniforms for the page: the deck writes them, and the key
 * light's shadow filter reads them from inside every receiving material.
 * A hero has one cloud layer, so a module singleton is the honest shape.
 */
const cloudUniforms = makeUniforms();

/** Noise space for a world-space point on the layer, plus the sheet's own offset. */
function noiseSpace(u: CloudUniforms, xzNode: unknown, sheet: number) {
  const xz = xzNode as Vec2Node;
  return xz
    .div(u.worldScale)
    .add(TSL.vec2(u.windOffset, 0.0))
    .mul(u.noiseScale)
    .add(TSL.vec2(sheet * 17.3, sheet * 29.1));
}

/**
 * Density at a point in noise space: three Perlin octaves for the broad
 * shape, inverted Worley cells for the domes, and a fine octave that fades
 * with distance because it would alias.
 */
function densityAt(u: CloudUniforms, qNode: unknown, detailNode: unknown) {
  const q = qNode as Vec2Node;
  const detail = detailNode as FloatNode;
  const p1 = TSL.mx_noise_float(TSL.vec3(q, u.boil));
  const p2 = TSL.mx_noise_float(
    TSL.vec3(q.mul(2.03).add(TSL.vec2(3.7, 1.9)), u.boil.mul(1.3).add(11.0)),
  );
  const p3 = TSL.mx_noise_float(
    TSL.vec3(q.mul(4.1).add(TSL.vec2(9.1, 5.3)), u.boil.mul(1.7).add(23.0)),
  );
  const fine = TSL.mx_noise_float(
    TSL.vec3(q.mul(8.3).add(TSL.vec2(2.2, 7.7)), u.boil.mul(2.1).add(31.0)),
  );
  // Worley distance is 0 at a cell's centre: inverted, each cell is a dome.
  const cells = TSL.float(1.0).sub(
    TSL.mx_worley_noise_float(
      q.mul(1.4).add(TSL.vec2(u.boil.mul(0.15), u.boil.mul(0.1))),
      1.0,
    )
      .mul(1.1)
      .clamp(0.0, 1.0),
  );
  const broad = p1.mul(0.55).add(p2.mul(0.28)).add(p3.mul(0.14)).mul(0.5).add(0.5);
  return broad
    .mul(0.68)
    .add(cells.mul(0.32))
    .add(fine.mul(0.06).mul(detail));
}

/**
 * The coverage field on one sheet: density against a threshold the weather
 * sets, with a low-frequency front term so a change of weather crosses the
 * sky rather than fading in everywhere at once. `cover` is what you see,
 * `thick` how much cloud is above the point. Shared by the visible dome and
 * the ground shade, so the shade is the shape overhead.
 */
function coverageAt(
  u: CloudUniforms,
  xzNode: unknown,
  detailNode: unknown,
  sheet: number,
) {
  const q = noiseSpace(u, xzNode, sheet);
  const d = densityAt(u, q, detailNode);
  const front = TSL.mx_noise_float(
    TSL.vec3(q.mul(0.13), u.boil.mul(0.2).add(41.0)),
  );
  // At zero cloudiness the threshold clears the density's ceiling: no wisps.
  const threshold = TSL.mix(1.05, 0.3, u.cloudiness)
    .add(front.mul(0.14))
    .add(sheet * 0.08);
  const cover = TSL.smoothstep(threshold, threshold.add(0.3), d);
  const thick = TSL.smoothstep(threshold, threshold.add(0.6), d);
  return { q, d, threshold, cover, thick };
}

/** The inputs three hands a shadow filter; `shadow` is the light's LightShadow. */
type ShadowFilterInputs = {
  depthTexture: THREE.DepthTexture;
  shadowCoord: unknown;
  shadow: THREE.LightShadow;
  depthLayer: number;
};
type ShadowFilter = (inputs: ShadowFilterInputs) => unknown;

/**
 * A shadow filter for the key light that adds the cloud layer's shade to
 * the map's own: the sun ray from the shaded point is followed up to the
 * layer, and the coverage there darkens the result. The branch is on a
 * uniform, so with the shade off (night, or clouds disabled) the noise is
 * never evaluated.
 */
export function cloudShadowFilter(base: ShadowFilter): ShadowFilter {
  const u = cloudUniforms;
  // A plain function on the outside: three hands the inputs object straight
  // through to the base filter, untouched by Fn's parameter proxying (which
  // would turn the depth texture into a node). The Fn inside is only there
  // to give `If` a stack.
  return (inputs: ShadowFilterInputs) =>
    TSL.Fn(() => {
      const lit = TSL.float(base(inputs) as FloatNode).toVar();
      const dir = u.keyDir as unknown as Vec3Node;
      TSL.If(u.shade.greaterThan(0.0).and(dir.y.greaterThan(0.05)), () => {
        // Typed as a bare Node; it is the receiver's world position (vec3).
        const p = TSL.shadowPositionWorld as unknown as Vec3Node;
        const t = u.altitude.sub(p.y).div(dir.y);
        const xz = p.xz.add(TSL.vec2(dir.x, dir.z).mul(t));
        const { cover } = coverageAt(u, xz, TSL.float(0.0), 0);
        lit.mulAssign(TSL.float(1.0).sub(cover.mul(u.shade)));
      });
      return lit;
    })();
}

/**
 * Interleaved gradient noise, stepped through the golden ratio each frame:
 * a per-pixel offset that dithers the march, and one the temporal resolver
 * averages away instead of printing as a fixed stipple.
 */
function ditherAt(px: unknown) {
  const p = px as Vec2Node;
  const ign = TSL.fract(
    TSL.float(52.9829189).mul(TSL.fract(p.x.mul(0.06711056).add(p.y.mul(0.00583715)))),
  );
  return TSL.fract(ign.add(TSL.time.mul(60.0 * 0.61803398875)));
}

/**
 * The dome's shader graph: march the view ray through the slab from its
 * bottom to its top, lighting each sample, and composite front to back.
 */
function makeDeckNodes(
  u: CloudUniforms,
  skyCube?: THREE.CubeTexture,
  skyEnv?: THREE.Texture | null,
) {
  const colorNode = TSL.Fn(() => {
    const V = TSL.normalize(TSL.positionWorld.sub(TSL.cameraPosition));
    V.y.lessThan(0.015).discard();
    const rayY = TSL.max(V.y, 1e-3);
    const cam = TSL.cameraPosition;

    const top = u.altitude;
    const bottom = u.altitude.sub(u.thickness);
    const tEnter = bottom.sub(cam.y).div(rayY);
    const tExit = top.sub(cam.y).div(rayY);
    const span = tExit.sub(tEnter);

    // Sun terms shared by every sample.
    const L = u.sunDir as unknown as Vec3Node;
    const sunAbove = TSL.smoothstep(-0.1, 0.5, L.y);
    const under = TSL.float(1.0).sub(TSL.smoothstep(-0.2, 0.35, L.y));
    const forward = TSL.pow(TSL.max(V.dot(L), 0.0), 5.0);
    const lateral = TSL.normalize(TSL.vec2(L.x, L.z).add(TSL.vec2(1e-4, 0.0)));
    const sunStep = lateral.mul(
      TSL.float(SUN_STEP).mul(TSL.float(1.0).sub(sunAbove.mul(0.7))),
    );

    // Ambient: the sky's PMREM read just above the horizon — what a cloud
    // base sees all round.
    const skyDir = TSL.normalize(TSL.vec3(V.x, 0.08, V.z));
    const skyRadiance = skyEnv
      ? TSL.pmremTexture(skyEnv, skyDir, TSL.float(1.0))
      : skyCube
        ? TSL.cubeTexture(skyCube, skyDir).rgb
        : TSL.vec3(0.35, 0.45, 0.65);

    // Up-sun occlusion for the column the ray meets first: how much cloud
    // lies between it and the sun along the sheet.
    const entry = cam.add(V.mul(tEnter.add(span.mul(0.5))));
    const entryDetail = TSL.float(1.0).sub(
      TSL.smoothstep(u.detailNear, u.detailFar, tEnter),
    );
    const column = coverageAt(u, entry.xz, entryDetail, 0);
    const dSun = densityAt(u, column.q.add(sunStep), entryDetail);
    const thickSun = TSL.smoothstep(column.threshold, column.threshold.add(0.6), dSun);
    const occlusion = TSL.smoothstep(-0.15, 0.35, thickSun.sub(column.thick));
    const shade = TSL.float(1.0).sub(
      occlusion.mul(TSL.mix(0.88, 0.6, sunAbove)),
    );

    // City glow on the underside at night, by the entry column.
    const nearCity = TSL.float(1.0).sub(
      TSL.smoothstep(u.cityRadius, u.cityRadius.mul(3.0), TSL.length(entry.xz)),
    );
    const glow = TSL.vec3(1.0, 0.6, 0.3).mul(nearCity).mul(u.night).mul(0.25);

    const dither = ditherAt(TSL.screenCoordinate);
    const transmittance = TSL.float(1.0).toVar();
    const accumulated = TSL.vec3(0.0).toVar();

    for (let i = 0; i < MARCH_STEPS; i++) {
      const t = tEnter.add(span.mul(TSL.float(i).add(dither).div(MARCH_STEPS)));
      const p = cam.add(V.mul(t));
      // Height within the slab: 0 at the bottom, 1 at the top.
      const h = p.y.sub(bottom).div(u.thickness);
      const detail = TSL.float(1.0).sub(
        TSL.smoothstep(u.detailNear, u.detailFar, t),
      );
      const { cover, thick } = coverageAt(u, p.xz, detail, 0);

      // A thick column hangs to the slab's bottom; a thin one only fills the
      // top. The sample is inside the cloud above that column's base.
      const base = TSL.float(1.0).sub(thick);
      const inside = TSL.smoothstep(base.sub(0.08), base.add(0.12), h).mul(cover);

      // Light from above falls off through the cloud overhead; light from
      // under the layer reaches the base straight on, shaded by the lumps
      // up-sun of it.
      const overhead = TSL.float(1.0).sub(h).mul(thick);
      const fromAbove = TSL.exp(overhead.mul(-2.6)).mul(shade);
      const fromBelow = shade.mul(TSL.exp(h.sub(base).max(0.0).mul(-2.0)));
      const sun = u.sunRadiance.mul(TSL.mix(fromAbove.mul(TSL.mix(0.35, 1.0, sunAbove)), fromBelow, under));
      const moon = u.moonRadiance.mul(TSL.exp(overhead.mul(-2.0)).mul(0.6));
      const direct = sun.add(moon).mul(u.sunlight);

      // Thin cloud between here and the sun glows with forward scatter.
      const silver = u.sunRadiance
        .mul(forward)
        .mul(TSL.exp(thick.mul(-4.0)))
        .mul(u.sunlight)
        .mul(0.9);

      const ambient = skyRadiance
        .mul(u.ambient)
        .mul(TSL.mix(1.0, 0.25, thick))
        .mul(TSL.mix(0.55, 1.0, h))
        .mul(TSL.float(1.0).sub(occlusion.mul(0.3)));

      const sample = direct
        .div(Math.PI)
        .add(ambient)
        .mul(ALBEDO)
        .add(silver)
        .add(glow.mul(TSL.mix(1.0, 0.5, thick)));

      const opacity = TSL.float(1.0).sub(TSL.exp(inside.mul(-STEP_EXTINCTION)));
      accumulated.addAssign(sample.mul(opacity).mul(transmittance));
      transmittance.mulAssign(TSL.float(1.0).sub(opacity));
    }

    // The faintest traces dither pixel to pixel; remap them cleanly to zero.
    const covered = TSL.smoothstep(0.03, 0.12, TSL.float(1.0).sub(transmittance)).mul(
      TSL.float(1.0).sub(transmittance),
    );
    let rgb = accumulated.div(TSL.max(TSL.float(1.0).sub(transmittance), 1e-4));

    // The same exponential height fog the post pass applies to the city,
    // at the layer's distance. The dome writes no depth, so that pass sees
    // sky here and skips it.
    const dist = tEnter.add(span.mul(0.5));
    const H = u.fogHeight;
    const sigma = u.fogDensity.div(1000.0);
    const xx = dist.mul(rayY).div(H);
    const term = TSL.abs(xx)
      .lessThan(1e-4)
      .select(
        TSL.float(1.0).sub(xx.mul(0.5)),
        TSL.float(1.0).sub(TSL.exp(xx.negate())).div(xx),
      );
    const od = sigma.mul(TSL.exp(cam.y.negate().div(H))).mul(dist).mul(term);
    const fogAmount = TSL.clamp(TSL.float(1.0).sub(TSL.exp(od.negate())), 0.0, 1.0);
    const fogDir = TSL.normalize(TSL.vec3(V.x, TSL.max(V.y, 0.02), V.z));
    const fogColor = skyCube ? TSL.cubeTexture(skyCube, fogDir).rgb : skyRadiance;
    rgb = TSL.mix(rgb, fogColor, fogAmount);

    // The sheet dissolves into the horizon rather than reaching it: at a
    // grazing ray the slab is kilometres out and a texel thick.
    const horizon = TSL.smoothstep(0.02, 0.075, V.y);
    const alpha = covered.mul(u.density).mul(horizon);
    alpha.lessThan(0.015).discard();

    return TSL.vec4(rgb, alpha);
  })();

  return { colorNode };
}

/**
 * The sun as the clouds see it: colour by elevation on the same bands as the
 * visible disc, dimmed toward the horizon, alive until a degree below it (a
 * layer at a kilometre sees past the ground horizon). The sky renders at
 * `exposure`; the key light the city is tuned against does not track it, so
 * the cloud sun splits the difference and follows the square root.
 */
function sunRadiance(elevation: number, exposure: number, out: THREE.Color) {
  const low = 1 - smoothstep(2, 30, elevation);
  const grazing = 1 - smoothstep(-1, 6, elevation);
  out.copy(SUN_HIGH).lerp(SUN_LOW, low).lerp(SUN_HORIZON, grazing);
  const visible = smoothstep(-2.2, -0.6, elevation);
  const extinction = THREE.MathUtils.lerp(0.35, 1, smoothstep(-1, 25, elevation));
  const gain = Math.sqrt(Math.max(exposure, 0) / DAY_EXPOSURE);
  return out.multiplyScalar(SUN_STRENGTH * visible * extinction * gain);
}

/** Memoized like the city: nothing here rebuilds on the dial. */
export const Clouds = memo(function Clouds({
  coverage = 0.5,
  altitude = 240,
  size = 1,
  density = 1,
  sunlight = 1,
  ambient = 1,
  wind = 0,
  timeOfDay = WEATHER_EPOCH,
  travel = 0,
  shadows = true,
  worldScale = 5,
  lightPosition,
  lightColor,
  lightIntensity,
  night = 0,
  exposure = DAY_EXPOSURE,
  fogDensity = 0.3,
  fogHeight = 300,
}: CloudsOptions) {
  const sky = useSky() as unknown as SkyLike | null;
  const skyCube = sky?.baker?.texture;
  const skyEnv = sky?.baker?.environmentTexture ?? undefined;
  const domeRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.HemisphereLight>(null);
  const uniforms = cloudUniforms;

  const domeGeometry = useMemo(() => new THREE.SphereGeometry(1, 48, 24), []);

  // Keyed on the sky textures so the graph rebuilds once the first bake lands.
  const domeMaterial = useMemo(() => {
    const nodes = makeDeckNodes(uniforms, skyCube, skyEnv);
    const material = new THREE.MeshBasicNodeMaterial();
    material.name = "CloudDeck";
    material.colorNode = nodes.colorNode;
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.side = THREE.BackSide;
    material.blending = THREE.NormalBlending;
    material.fog = false;
    material.toneMapped = true;
    return material;
  }, [uniforms, skyCube, skyEnv]);

  useEffect(() => () => domeGeometry.dispose(), [domeGeometry]);
  useEffect(() => () => domeMaterial.dispose(), [domeMaterial]);

  // The shade is a uniform read from every receiving material: leaving it
  // at zero on unmount is what "clouds off" means to them.
  useEffect(
    () => () => {
      uniforms.shade.value = 0;
    },
    [uniforms],
  );

  useEffect(() => {
    uniforms.night.value = night;
    uniforms.sunlight.value = sunlight;
    uniforms.ambient.value = ambient;
    uniforms.density.value = density;
    uniforms.fogDensity.value = fogDensity;
    uniforms.fogHeight.value = fogHeight;
    uniforms.worldScale.value = worldScale;
    uniforms.altitude.value = altitude * worldScale;
    uniforms.thickness.value = DECK_THICKNESS * worldScale;
    uniforms.noiseScale.value = NOISE_FREQUENCY / size;
    uniforms.cityRadius.value = CITY_RADIUS * worldScale;
    uniforms.detailNear.value = 800 * worldScale;
    uniforms.detailFar.value = 2400 * worldScale;
    uniforms.moonRadiance.value.copy(MOON_COLOR).multiplyScalar(MOON_STRENGTH * night);
  }, [
    uniforms,
    night,
    sunlight,
    ambient,
    density,
    fogDensity,
    fogHeight,
    worldScale,
    altitude,
    size,
  ]);

  /**
   * The weather clock: the dial only hands over hours, so midnight wraps are
   * counted here to keep it continuous — one day's weather leads into the
   * next instead of every day being the same day. Drift is the wall-clock
   * part of the travel.
   */
  const clock = useRef({ hours: timeOfDay, day: 0, drift: 0 });

  useFrame(({ camera, elapsed }, delta) => {
    const dome = domeRef.current;
    if (!dome) return;

    // The dome rides with the camera, just inside the far plane.
    dome.position.copy(camera.position);

    // The ground shade follows the key light, and goes out by moonlight: the
    // moon is a fixed, hand-placed key, and shade swinging round to it at
    // dusk would read as a bug.
    uniforms.keyDir.value
      .set(lightPosition[0], lightPosition[1], lightPosition[2])
      .normalize();
    uniforms.shade.value = shadows && night < 0.85 ? SHADE_STRENGTH : 0;

    // The sun: the sky's true solar vector when there is a sky, else the key.
    const sunDirection = sky?.mesh?.sunDirection?.value;
    if (sunDirection) {
      uniforms.sunDir.value.copy(sunDirection);
      sunRadiance(sky?.sunElevation ?? -90, exposure, uniforms.sunRadiance.value);
    } else {
      uniforms.sunDir.value.copy(uniforms.keyDir.value);
      uniforms.sunRadiance.value.set(lightColor).multiplyScalar(lightIntensity);
    }

    const c = clock.current;
    const dh = timeOfDay - c.hours;
    if (dh < -12) c.day += 1;
    else if (dh > 12) c.day -= 1;
    c.hours = timeOfDay;
    c.drift += wind * delta;
    const hours = c.day * 24 + timeOfDay;

    const cloudiness = THREE.MathUtils.clamp(
      cloudinessAt(hours) + (coverage - 0.5) * 0.9,
      0,
      1,
    );
    uniforms.cloudiness.value = cloudiness;

    // The deck lighting the city back. Its underside radiance is the sun
    // term × facing / π × albedo; over the fraction of sky it covers that
    // is an irradiance of sunRadiance × facing × albedo × cover, which is
    // exactly a hemisphere light of that colour and intensity.
    const glowLight = glowRef.current;
    if (glowLight) {
      const under = 1 - smoothstep(-0.2, 0.35, uniforms.sunDir.value.y);
      const facing = THREE.MathUtils.lerp(0.25, 0.7, under);
      const covered = Math.pow(THREE.MathUtils.clamp(cloudiness * 1.1 - 0.05, 0, 1), 1.3);
      glowLight.color.copy(uniforms.sunRadiance.value);
      glowLight.intensity = facing * ALBEDO * covered * GLOW_GAIN * sunlight;
    }
    // Sampling offset grows as the sheet moves west: features slide to -x.
    uniforms.windOffset.value = hours * travel - c.drift;
    uniforms.boil.value = hours * BOIL_RATE + elapsed * BOIL_IDLE;
  });

  return (
    <>
      <mesh
        ref={domeRef}
        geometry={domeGeometry}
        material={domeMaterial}
        scale={DOME_RADIUS * worldScale}
        frustumCulled={false}
        // After the stars and the sun disc, which sit on their own dome.
        renderOrder={1}
      />
      {/* The deck's light on the city; colour and strength set per frame. */}
      <hemisphereLight ref={glowRef} intensity={0} groundColor="#000000" />
    </>
  );
});
