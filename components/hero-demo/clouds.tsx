"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/webgpu";
import { useSky } from "@pmndrs/sky/react";
import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

import { HERO_INITIAL_TIME_OF_DAY } from "@/lib/time-of-day";

import { MOON_DIRECTION } from "./lights";

/**
 * A broken deck of cloud over Paris — flat patches spread across the whole
 * sky, thinning toward the horizon, undersides lit gold by a low sun.
 *
 * The deck is a height field, and that is the point. Every cloud in this
 * frame sits 5–18° above the horizon, seen nearly edge-on from below, and
 * at that grazing angle no amount of shading on a flat sheet reads as
 * volume — fluffy is a silhouette property. So the layer is a real
 * displaced surface: a large grid whose vertices hang below the cloud
 * altitude by the local density (thick columns reach deep, thin ones barely
 * dent), giving true 3D lobes that bulge, overlap and occlude each other
 * with real perspective, and a genuine surface normal to light. The mesh
 * writes depth, so lobes sort against each other and the city, the post
 * pass fogs them like any other geometry, and FSR gets honest motion.
 *
 * The density field is Perlin octaves for the broad shape with inverted
 * Worley cells for the domes, the space bent by a low-frequency warp so
 * boundaries meander, and rims eroded by the fine octave squared toward the
 * edge — cores solid, edges fraying to wisps. Lighting is a soft-wrapped
 * dot with the real normal (a low sun lights hanging bases by itself, no
 * special case), Beer's law darkening under thickness, a powder term just
 * inside bright rims, an up-sun density tap for cloud-scale shade, forward
 * scatter through thin edges, and the sky's own PMREM as ambient.
 *
 * The layer lights the city back: a hemisphere light carries the deck's own
 * sun colour times how much sky it covers — strong when a low sun lights
 * the undersides, a flat grey lift on an overcast noon — so a red sky warms
 * the roofs and streets under it instead of floating over a neutral scene.
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
 * dial's opening hour so the page always loads to a clear sky, and clouds
 * build as the dial moves forward from there — into a partly cloudy
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
  /**
   * Accepted for compatibility; the field writes depth now, so the post
   * pass's own sky fog hazes it like the rest of the scene.
   */
  fogDensity?: number;
  fogHeight?: number;
}

/** Half-width of the height-field grid, city units — just inside the far plane. */
const FIELD_RADIUS = 1350;
/** Where the field starts dissolving toward its rim, city units. */
const FIELD_FADE = 1100;
/** Grid resolution: cells of ~10 city units, far finer than the smallest lobe. */
const GRID_SEGMENTS = 256;
/** Slab depth, city units: how deep a fully thick column hangs below the top. */
const DECK_THICKNESS = 150;
/** Base-octave noise frequency, per city unit: lumps a few hundred metres across. */
const NOISE_FREQUENCY = 1 / 380;
/** How far up-sun the self-shadow sample is taken, in base-octave features. */
const SUN_STEP = 0.38;
/** City radius, for the night glow falloff. */
const CITY_RADIUS = 400;
const ALBEDO = 0.92;
/** How dark the ground gets under a fully covered patch. */
const SHADE_STRENGTH = 0.85;
/** How much of the deck's underside radiance comes back down as fill. */
const GLOW_GAIN = 0.6;

/**
 * The cloudiness curve: two incommensurate swings, a day and a half and
 * three days long, both at their trough at the epoch — the dial's opening
 * hour — so the page loads to a clear sky and clouds build from there,
 * whichever way the dial turns.
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
  };
}

type CloudUniforms = ReturnType<typeof makeUniforms>;

/**
 * One set of uniforms for the page: the deck writes them, and the key
 * light's shadow filter reads them from inside every receiving material.
 * A hero has one cloud layer, so a module singleton is the honest shape.
 */
const cloudUniforms = makeUniforms();

/** Noise space for a world-space point on the layer. */
function noiseSpace(u: CloudUniforms, xzNode: unknown) {
  const xz = xzNode as Vec2Node;
  return xz
    .div(u.worldScale)
    .add(TSL.vec2(u.windOffset, 0.0))
    .mul(u.noiseScale);
}

/**
 * Density at a point in noise space: the space itself is first bent by a
 * low-frequency warp — a boundary through warped coordinates meanders and
 * curls the way a cloud edge does, where the same boundary through straight
 * coordinates traces an airbrushed blob. Then three Perlin octaves for the
 * broad shape, inverted Worley cells for the domes, and a fine octave that
 * fades with distance because it would alias. The fine octave is returned
 * too: the caller re-uses it to erode the edges.
 */
function densityAt(u: CloudUniforms, qNode: unknown, detailNode: unknown) {
  const q0 = qNode as Vec2Node;
  const detail = detailNode as FloatNode;
  const w1 = TSL.mx_noise_float(
    TSL.vec3(q0.mul(0.65).add(TSL.vec2(13.7, 7.1)), u.boil.mul(0.9)),
  );
  const w2 = TSL.mx_noise_float(
    TSL.vec3(q0.mul(0.65).add(TSL.vec2(41.3, 23.9)), u.boil.mul(0.9).add(7.0)),
  );
  const q = q0.add(TSL.vec2(w1, w2).mul(0.35));
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
      q.mul(1.15).add(TSL.vec2(u.boil.mul(0.15), u.boil.mul(0.1))),
      1.0,
    )
      .mul(1.1)
      .clamp(0.0, 1.0),
  );
  const broad = p1.mul(0.55).add(p2.mul(0.28)).add(p3.mul(0.14)).mul(0.5).add(0.5);
  const d = broad
    .mul(0.58)
    .add(cells.mul(0.42))
    .add(fine.mul(0.09).mul(detail));
  return { d, fine };
}

/**
 * The coverage field at a world-space point on the layer: density against a
 * threshold the weather sets, with a low-frequency front term so a change
 * of weather crosses the sky rather than fading in everywhere at once, and
 * the rim eroded by the fine octave squared toward the edge — cores stay
 * solid, boundaries fray into wisps. `cover` is what you see, `thick` how
 * much cloud is above the point. Shared by the visible field, the vertex
 * displacement and the ground shade, so what hangs, shows and shades is one
 * shape.
 */
function coverageAt(u: CloudUniforms, xzNode: unknown, detailNode: unknown) {
  const q = noiseSpace(u, xzNode);
  const detail = detailNode as FloatNode;
  const { d, fine } = densityAt(u, q, detail);
  const front = TSL.mx_noise_float(
    TSL.vec3(q.mul(0.13), u.boil.mul(0.2).add(41.0)),
  );
  // At zero cloudiness the threshold clears the density's ceiling: no wisps.
  const threshold = TSL.mix(1.05, 0.4, u.cloudiness)
    .add(front.mul(0.14))
    .add(0.0);
  const pre = TSL.smoothstep(threshold, threshold.add(0.38), d);
  const fray = TSL.float(1.0)
    .sub(pre)
    .pow(2.0)
    .mul(fine.mul(0.5).add(0.5))
    .mul(0.1)
    .mul(detail.mul(0.7).add(0.3));
  const eroded = d.sub(fray);
  const cover = TSL.smoothstep(threshold, threshold.add(0.38), eroded);
  const thick = TSL.smoothstep(threshold, threshold.add(0.6), eroded);
  return { q, d, fine, threshold, cover, thick };
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
        const { cover } = coverageAt(u, xz, TSL.float(0.0));
        lit.mulAssign(TSL.float(1.0).sub(cover.mul(u.shade)));
      });
      return lit;
    })();
}

/**
 * The height field's shader graph. The vertex stage samples the field to
 * hang the surface and take its analytic normal (forward differences, one
 * grid cell apart); the fragment stage re-reads the field at full detail
 * for coverage, texture and light.
 */
function makeFieldNodes(
  u: CloudUniforms,
  skyCube?: THREE.CubeTexture,
  skyEnv?: THREE.Texture | null,
) {
  // ---- vertex stage: displacement and normal ----
  const xz = TSL.positionGeometry.xz;
  const eps = TSL.float((FIELD_RADIUS * 2) / GRID_SEGMENTS).mul(u.worldScale);
  const t0 = coverageAt(u, xz, TSL.float(0.0)).thick;
  const tx = coverageAt(u, xz.add(TSL.vec2(eps, 0.0)), TSL.float(0.0)).thick;
  const tz = coverageAt(u, xz.add(TSL.vec2(0.0, eps)), TSL.float(0.0)).thick;

  const positionNode = TSL.vec3(
    xz.x,
    u.altitude.sub(t0.mul(u.thickness)),
    xz.y,
  );

  // Surface y = altitude − thick·T; the outward (downward) normal.
  const grad = TSL.vec2(tx.sub(t0), tz.sub(t0)).div(eps).mul(u.thickness);
  const downNormal = TSL.normalize(
    TSL.vec3(grad.x.negate(), -1.0, grad.y.negate()),
  );
  const vNormal = TSL.vertexStage(downNormal) as unknown as Vec3Node;

  // ---- fragment stage ----
  const colorNode = TSL.Fn(() => {
    const N = TSL.normalize(vNormal);
    const toHere = TSL.positionWorld.sub(TSL.cameraPosition);
    const dist = TSL.length(toHere);
    const V = toHere.div(TSL.max(dist, 1e-4));

    const detail = TSL.float(1.0).sub(
      TSL.smoothstep(u.detailNear, u.detailFar, dist),
    );
    const { q, cover, thick, fine, threshold } = coverageAt(
      u,
      TSL.positionWorld.xz,
      detail,
    );

    // Up-sun occlusion: how much cloud lies between this column and the sun.
    const L = u.sunDir as unknown as Vec3Node;
    const sunAbove = TSL.smoothstep(-0.1, 0.5, L.y);
    const lateral = TSL.normalize(TSL.vec2(L.x, L.z).add(TSL.vec2(1e-4, 0.0)));
    const sunStep = lateral.mul(
      TSL.float(SUN_STEP).mul(TSL.float(1.0).sub(sunAbove.mul(0.7))),
    );
    const dSun = densityAt(u, q.add(sunStep), detail).d;
    const thickSun = TSL.smoothstep(threshold, threshold.add(0.6), dSun);
    const occlusion = TSL.smoothstep(-0.15, 0.35, thickSun.sub(thick));
    const shade = TSL.float(1.0).sub(
      occlusion.mul(TSL.mix(0.85, 0.6, sunAbove)),
    );

    // The real normal does the work: a low sun lights the hanging bases on
    // its own. Beer's law darkens under thickness, the powder term darkens
    // just inside bright rims — the signature volumetric cue.
    const litBy = (dirNode: unknown, radianceNode: unknown, extinct: unknown) => {
      const dir = dirNode as Vec3Node;
      const radiance = radianceNode as Vec3Node;
      const wrap = TSL.clamp(N.dot(dir).add(0.5).div(1.5), 0.0, 1.0);
      return radiance.mul(wrap).mul(extinct as FloatNode);
    };
    const beer = TSL.exp(thick.mul(TSL.mix(0.5, 2.6, sunAbove)).negate());
    const powder = TSL.float(1.0).sub(TSL.exp(cover.mul(-5.0)));
    const direct = litBy(u.sunDir, u.sunRadiance, beer.mul(shade))
      .add(litBy(u.moonDir, u.moonRadiance, TSL.exp(thick.mul(-1.5)).mul(0.8)))
      .mul(u.sunlight)
      .mul(TSL.mix(1.0, powder, 0.5));

    // Forward scatter through the thin edges toward the sun.
    const forward = TSL.pow(TSL.max(V.dot(L), 0.0), 5.0);
    const silver = u.sunRadiance
      .mul(forward)
      .mul(TSL.exp(thick.mul(-4.0)))
      .mul(u.sunlight)
      .mul(0.9);

    // Ambient: the sky's PMREM along the normal, clamped just above the
    // horizon (the bake is black below it) — sideways-facing lobe flanks
    // pick their own patch of sky. Mottled so big faces keep tonal life.
    const skyDir = TSL.normalize(TSL.vec3(N.x, TSL.max(N.y, 0.04), N.z));
    const skyRadiance = skyEnv
      ? TSL.pmremTexture(skyEnv, skyDir, TSL.float(1.0))
      : skyCube
        ? TSL.cubeTexture(skyCube, skyDir).rgb
        : TSL.vec3(0.35, 0.45, 0.65);
    const ambientLight = skyRadiance
      .mul(u.ambient)
      .mul(TSL.mix(1.0, 0.22, thick))
      .mul(TSL.float(1.0).sub(occlusion.mul(0.3)))
      .mul(fine.mul(0.3).add(0.9));

    // At night the city lights the underside warm — the sodium wash every
    // overcast Paris night has. The downward normal gates it for free.
    const nearCity = TSL.float(1.0).sub(
      TSL.smoothstep(
        u.cityRadius,
        u.cityRadius.mul(3.0),
        TSL.length(TSL.positionWorld.xz),
      ),
    );
    const glow = TSL.vec3(1.0, 0.6, 0.3)
      .mul(TSL.max(N.y.negate(), 0.0))
      .mul(nearCity)
      .mul(u.night)
      .mul(0.28)
      .mul(TSL.mix(1.0, 0.5, thick));

    const rgb = direct
      .div(Math.PI)
      .add(ambientLight)
      .mul(ALBEDO)
      .add(silver)
      .add(glow);

    // No fog here: the field writes depth, so the post pass's sky fog hazes
    // it with the rest of the scene. The rim fade keeps the mesh edge from
    // ever showing.
    const radial = TSL.length(TSL.positionWorld.xz);
    const rim = TSL.float(1.0).sub(
      TSL.smoothstep(
        TSL.float(FIELD_FADE).mul(u.worldScale),
        TSL.float(FIELD_RADIUS - 40).mul(u.worldScale),
        radial,
      ),
    );
    const alpha = TSL.smoothstep(0.03, 0.3, cover).mul(u.density).mul(rim);
    // Depth is written, so what stays must be body: the frayed skirt below
    // this line is dropped rather than blended out of order.
    alpha.lessThan(0.12).discard();
    return TSL.vec4(rgb, alpha);
  })();

  return { positionNode, colorNode, normalNode: vNormal };
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
}: CloudsOptions) {
  const sky = useSky() as unknown as SkyLike | null;
  const skyCube = sky?.baker?.texture;
  const skyEnv = sky?.baker?.environmentTexture ?? undefined;
  const glowRef = useRef<THREE.HemisphereLight>(null);
  const uniforms = cloudUniforms;

  // The grid is world-sized so the shader can treat vertex xz as world xz.
  const fieldGeometry = useMemo(() => {
    const width = FIELD_RADIUS * 2 * worldScale;
    const geometry = new THREE.PlaneGeometry(
      width,
      width,
      GRID_SEGMENTS,
      GRID_SEGMENTS,
    );
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [worldScale]);

  // Keyed on the sky textures so the graph rebuilds once the first bake lands.
  const fieldMaterial = useMemo(() => {
    const nodes = makeFieldNodes(uniforms, skyCube, skyEnv);
    const material = new THREE.MeshBasicNodeMaterial();
    material.name = "CloudField";
    material.positionNode = nodes.positionNode;
    material.colorNode = nodes.colorNode;
    // The analytic surface normal, so the MRT's normal attachment (and with
    // it the AO pass) sees the lobes rather than a flat plane.
    material.normalNode = nodes.normalNode;
    material.transparent = true;
    // Real geometry: lobes must occlude each other and the sun behind them.
    material.depthWrite = true;
    material.depthTest = true;
    // Seen from below, the up-facing grid shows its back.
    material.side = THREE.BackSide;
    material.blending = THREE.NormalBlending;
    material.fog = false;
    material.toneMapped = true;
    return material;
  }, [uniforms, skyCube, skyEnv]);

  useEffect(() => () => fieldGeometry.dispose(), [fieldGeometry]);
  useEffect(() => () => fieldMaterial.dispose(), [fieldMaterial]);

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

  useFrame(({ elapsed }, delta) => {
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
        geometry={fieldGeometry}
        material={fieldMaterial}
        frustumCulled={false}
        // After the stars and the sun disc, which sit on their own dome.
        renderOrder={1}
      />
      {/* The deck's light on the city; colour and strength set per frame. */}
      <hemisphereLight ref={glowRef} intensity={0} groundColor="#000000" />
    </>
  );
});
