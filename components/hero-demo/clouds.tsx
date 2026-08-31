"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/webgpu";
import { useSky } from "@pmndrs/sky/react";
import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

import { MOON_DIRECTION } from "./lights";

/**
 * Cumulus over Paris, built the way Felix Westin builds his VR clouds: out of
 * spheres. Each cloud is a cluster grown by four rules — new spheres spawn on
 * the shell of old ones, never inside one, in size tiers (big cores, medium
 * lumps, small cauliflower bumps), with their height biased toward the sphere
 * they grew from so the cloud stays flat-bottomed instead of growing tall.
 *
 * Every sphere is then drawn as one camera-facing sprite. A sphere looks the
 * same from every direction, so a billboard of one is not a cheat — the
 * silhouette is right from the hero's orbit and from the sun. The sprite
 * shades itself as a sphere: a normal is reconstructed from the disc and
 * blended with the cloud-scale normal (where the sphere sits in its cluster),
 * so the light reads across the whole cloud rather than bubble by bubble. A
 * soft wrap stands in for multiple scattering, spheres on the far side of the
 * cloud from the light sit in its shade, and a forward-scattering rim gives
 * the silver lining when the sun is behind them. Ambient is the sky's own
 * PMREM sampled along the normal: tops take the zenith, undersides take the
 * horizon — at sunset the orange band, which is what lights a real cloud
 * base then.
 *
 * The clouds carry their own sun rather than the city's key light. The key
 * hands over to the moon from 6° elevation, but a cloud at a kilometre still
 * sees the sun until it is a degree under the horizon, and that last stretch
 * is the one that sets them on fire.
 *
 * The shadows are the "extra points": the same sprites cast into the key
 * light's existing shadow map. `castShadowPositionNode` billboards each quad
 * toward whichever camera is drawing it — the light, in that pass — and
 * `maskShadowNode` punches the sphere's eroded silhouette out of the depth
 * write. One shadow pass, no second render, and cloud shade drifts over the
 * ring, the park and the tower.
 *
 * Weather runs on the sky's clock, not the wall clock. The dial is a
 * time-lapse — the sun sweeps, the stars wheel — so the clouds keep pace: the
 * field streams westward with the sun, silhouettes boil, and a cloudiness
 * curve spanning several days decides how much of the field is up. Each
 * cloud has its own threshold on that curve (cores appearing before bumps), so
 * a clear day has a few clouds building and dissolving while an overcast one
 * fills the sky, and scrubbing the dial fast-forwards through both. The clock
 * counts midnight wraps, so consecutive days differ. A slow wall-clock drift
 * keeps the sky alive while the dial rests.
 *
 * Positions are in world units with an identity model matrix (the billboard
 * maths wants that), pre-scaled from city units by `worldScale`.
 */

/** The slice of the sky instance the clouds read. */
interface SkyLike {
  sunElevation: number;
  mesh?: { sunDirection?: { value: THREE.Vector3 } };
  baker?: { texture?: THREE.CubeTexture; environmentTexture?: THREE.Texture | null };
}

type Vec3Node = ReturnType<typeof TSL.vec3>;
type Vec4Node = ReturnType<typeof TSL.vec4>;
type FloatNode = ReturnType<typeof TSL.float>;

export interface CloudsOptions {
  /** Fraction of the field's cloud slots that get a cloud, 0..1. */
  coverage?: number;
  /** Cloud-base altitude in city units (× worldScale metres). */
  altitude?: number;
  /** Overall cloud size multiplier. */
  size?: number;
  /** How solid one sphere reads; overlaps accumulate toward opaque. */
  density?: number;
  /** Direct-light strength. */
  sunlight?: number;
  /** Sky-ambient strength. */
  ambient?: number;
  /** Wall-clock drift along +x in city units per second; negative is westward. */
  wind?: number;
  /** Solar hours, 0..24 — the sky's own clock. */
  timeOfDay?: number;
  /** Field widths the clouds travel per day of dial time, westward with the sun. */
  travel?: number;
  /** Let the key light see the clouds. */
  shadows?: boolean;
  /** Metres per city unit. */
  worldScale?: number;
  /**
   * The city's key light. Only the fallback sun when there is no sky to read
   * the real one from.
   */
  lightPosition: [number, number, number];
  lightColor: THREE.ColorRepresentation;
  lightIntensity: number;
  /** 0 by day, 1 at night — brings in the moon and the city glow, fades the shadows. */
  night?: number;
  /** The sky's exposure; the sun term tracks it partway, as the sky does fully. */
  exposure?: number;
  /** The post pass's sky fog, so the clouds sit in the same haze as the city. */
  fogDensity?: number;
  fogHeight?: number;
}

/** Field radius in city units: the far ring sits near the horizon. */
export const CLOUD_FIELD_RADIUS = 1250;
/**
 * How far behind the city the key's shadow frustum must reach. At a low sun
 * the cloud that shades the ring is kilometres out on the sun side.
 */
export const CLOUD_SHADOW_REACH = CLOUD_FIELD_RADIUS + 250;

/** Cloud slots over the city itself — the ones whose shade reaches the ring. */
const INNER_RADIUS = 480;
const INNER_CLOUDS = 12;
/** ...and around it, seen high over the skyline. */
const OUTER_CLOUDS = 40;
/** Beyond this the small tier is dropped: too far to read. */
const LOD_RADIUS = 850;
/** Rule 4: how strongly a spawned sphere's height is pulled to its parent's. */
const FLATNESS = 0.55;
/** City radius, for the night glow falloff. */
const CITY_RADIUS = 400;
/** Silhouette noise frequency, per city unit. */
const NOISE_FREQUENCY = 0.1;
const ALBEDO = 0.92;
const CLOUD_SEED = 0x2f6e2b1;

/**
 * The cloudiness curve: two incommensurate swings, days long, so the pattern
 * of clear and cloudy days takes a couple of weeks to repeat. Anchored at the
 * homepage's opening hour so the first view is an ordinary half-cloudy sky.
 */
const WEATHER_PERIOD_A = 24 * 2.3;
const WEATHER_PERIOD_B = 24 * 5.1;
const WEATHER_EPOCH = 20.4;
/** Half-width of a cloud's fade band on the cloudiness curve. */
const WEATHER_BAND = 0.08;
/** Each smaller tier needs this much more cloudiness: cores first, bumps last. */
const TIER_STEP = 0.06;
/** Per-cloud lag on the curve, hours — so a front does not switch on at once. */
const STAGGER_HOURS = 6;
/** Silhouette boil per hour of dial time, in noise units. */
const BOIL_RATE = 0.05;

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

/** Re-sort the clouds when the view turns this far or the field moves. */
const SORT_COS = Math.cos(THREE.MathUtils.degToRad(1.5));
const SORT_MOVE_SQ = 25;
const SORT_INTERVAL = 2;
/** ...or the field has travelled this far (world units) under the dial. */
const SORT_SHIFT = 40;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG (mulberry32) — the field must not reshuffle on re-render. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CloudSpec {
  cx: number;
  cz: number;
  /** Radius of the whole cluster. */
  size: number;
  /** Flat base altitude. */
  base: number;
  /** Cloudiness this cloud needs to exist, and its lag on the curve. */
  threshold: number;
  stagger: number;
}

interface Puff {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Position relative to the cloud centre, in cloud radii. */
  rx: number;
  ry: number;
  rz: number;
  seed: number;
  /** This sphere's own threshold: the cloud's, stepped up per tier. */
  threshold: number;
  stagger: number;
}

/** One cloud's run of puffs, and where its centre is — the sort unit. */
interface CloudRange {
  start: number;
  count: number;
  cx: number;
  cy: number;
  cz: number;
}

/** Scatters cloud centres: a sparse disc over the city, a ring around it. */
function scatterClouds(
  rng: () => number,
  coverage: number,
  altitude: number,
  sizeMul: number,
) {
  const specs: CloudSpec[] = [];
  const place = (
    count: number,
    minR: number,
    maxR: number,
    sizeMin: number,
    sizeMax: number,
  ) => {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 80; tries++) {
      const a = rng() * Math.PI * 2;
      // Uniform over the annulus.
      const rr = Math.sqrt(minR * minR + (maxR * maxR - minR * minR) * rng());
      const cx = Math.cos(a) * rr;
      const cz = Math.sin(a) * rr;
      const size = (sizeMin + (sizeMax - sizeMin) * rng() ** 2) * sizeMul;
      if (
        specs.some(
          (s) => Math.hypot(s.cx - cx, s.cz - cz) < (s.size + size) * 1.3,
        )
      ) {
        continue;
      }
      specs.push({
        cx,
        cz,
        size,
        base: altitude + (rng() - 0.5) * 30,
        threshold: rng(),
        stagger: rng() * STAGGER_HOURS,
      });
      placed++;
    }
  };
  place(Math.round(INNER_CLOUDS * coverage), 90, INNER_RADIUS, 40, 90);
  place(
    Math.round(OUTER_CLOUDS * coverage),
    INNER_RADIUS,
    CLOUD_FIELD_RADIUS,
    60,
    170,
  );
  return specs;
}

/** Grows one cloud from spheres by the four rules. */
function growCloud(spec: CloudSpec, rng: () => number, far: boolean, out: Puff[]) {
  const { cx, cz, size, base, threshold, stagger } = spec;
  const puffs: { x: number; y: number; z: number; r: number; tier: number }[] =
    [];

  // Tier 0: one to three cores strung along a random axis, bottoms on the base.
  const angle = rng() * Math.PI * 2;
  const ex = Math.cos(angle);
  const ez = Math.sin(angle);
  const r0 = size * 0.5;
  const cores = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < cores; i++) {
    const t = cores === 1 ? 0 : (i / (cores - 1)) * 2 - 1;
    const r = r0 * (0.75 + rng() * 0.35);
    puffs.push({
      x: cx + ex * t * size * 0.42 + (rng() - 0.5) * r0 * 0.4,
      y: base + r * 0.8,
      z: cz + ez * t * size * 0.42 + (rng() - 0.5) * r0 * 0.4,
      r,
      tier: 0,
    });
  }

  // Rule 3: size tiers. Far clouds skip the small tier (the LOD).
  const tiers = far
    ? [{ r: r0 * 0.6, n: 6 + Math.floor(rng() * 4), up: 0.45 }]
    : [
        { r: r0 * 0.55, n: 6 + Math.floor(rng() * 5), up: 0.35 },
        { r: r0 * 0.32, n: 12 + Math.floor(rng() * 9), up: 0.65 },
      ];

  tiers.forEach((tier, tierIndex) => {
    const parents = puffs.length;
    let placed = 0;
    for (let tries = 0; placed < tier.n && tries < tier.n * 14; tries++) {
      const p = puffs[Math.floor(rng() * parents)];

      // Rule 1: on the parent's shell, in a direction folded upward by the
      // tier's bias — the small bumps are what make the top cauliflower.
      let dx = rng() * 2 - 1;
      let dy = rng() * 2 - 1;
      let dz = rng() * 2 - 1;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      dy = dy * (1 - tier.up) + Math.abs(dy) * tier.up;

      const r = tier.r * (0.7 + rng() * 0.6);
      const reach = (p.r + r) * 0.62;
      const x = p.x + dx * reach;
      let y = p.y + dy * reach;
      const z = p.z + dz * reach;

      // Rule 4: pull the height toward the parent's, and never let a sphere
      // hang below the base.
      y = p.y + (y - p.y) * (1 - FLATNESS);
      y = Math.max(y, base + r * 0.8);

      // Rule 2: not inside anything already there.
      if (
        puffs.some(
          (q) => Math.hypot(q.x - x, q.y - y, q.z - z) < q.r * 0.9,
        )
      ) {
        continue;
      }
      // Stay one cloud, not a drift of loose lumps.
      if (Math.hypot(x - cx, z - cz) > size * 1.15) continue;

      puffs.push({ x, y, z, r, tier: tierIndex + 1 });
      placed++;
    }
  });

  // Where each sphere sits within its cloud, for the sun-side/shade split.
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const p of puffs) {
    mx += p.x;
    my += p.y;
    mz += p.z;
  }
  mx /= puffs.length;
  my /= puffs.length;
  mz /= puffs.length;
  // Generation order is cores → lumps → bumps, which is also the draw order
  // within a cloud: the small spheres land on top.
  for (const p of puffs) {
    out.push({
      x: p.x,
      y: p.y,
      z: p.z,
      r: p.r,
      rx: (p.x - mx) / size,
      ry: (p.y - my) / size,
      rz: (p.z - mz) / size,
      seed: rng(),
      threshold: threshold + p.tier * TIER_STEP,
      stagger,
    });
  }
}

function buildField(coverage: number, altitude: number, sizeMul: number) {
  const rng = makeRng(CLOUD_SEED);
  const specs = scatterClouds(
    rng,
    THREE.MathUtils.clamp(coverage, 0, 1),
    altitude,
    sizeMul,
  );
  const puffs: Puff[] = [];
  const clouds: CloudRange[] = [];
  for (const spec of specs) {
    const start = puffs.length;
    growCloud(spec, rng, Math.hypot(spec.cx, spec.cz) > LOD_RADIUS, puffs);
    clouds.push({
      start,
      count: puffs.length - start,
      cx: spec.cx,
      cy: spec.base,
      cz: spec.cz,
    });
  }
  return { puffs, clouds };
}

function makeUniforms() {
  return {
    sunDir: TSL.uniform(new THREE.Vector3(0, 1, 0)),
    /** Colour × strength. */
    sunRadiance: TSL.uniform(new THREE.Color(0, 0, 0)),
    moonDir: TSL.uniform(MOON_DIRECTION.clone()),
    moonRadiance: TSL.uniform(new THREE.Color(0, 0, 0)),
    night: TSL.uniform(0),
    sunlight: TSL.uniform(1),
    ambient: TSL.uniform(1),
    density: TSL.uniform(0.85),
    /** Accumulated wall-clock drift, world units. */
    drift: TSL.uniform(0),
    /** The weather clock: solar hours, continuous across midnight. */
    clock: TSL.uniform(WEATHER_EPOCH),
    /** Field widths travelled per day of dial time. */
    travel: TSL.uniform(0),
    /** Field half-width, world units; x wraps across it. */
    fieldRadius: TSL.uniform(CLOUD_FIELD_RADIUS * 5),
    cityRadius: TSL.uniform(CITY_RADIUS * 5),
    noiseScale: TSL.uniform(NOISE_FREQUENCY / 5),
    fogDensity: TSL.uniform(0.3),
    fogHeight: TSL.uniform(300),
    /** Silhouette level that counts as solid in the shadow pass. */
    shadowThreshold: TSL.uniform(0.35),
  };
}

type CloudUniforms = ReturnType<typeof makeUniforms>;

/** Cloudiness 0.1..1 at an hour on the weather clock. */
function cloudinessAt(hoursNode: unknown) {
  // Uniform arithmetic yields a plain Node type; the maths is float either way.
  const hours = hoursNode as FloatNode;
  const t = hours.sub(WEATHER_EPOCH);
  const a = TSL.sin(t.mul((Math.PI * 2) / WEATHER_PERIOD_A));
  const b = TSL.sin(t.mul((Math.PI * 2) / WEATHER_PERIOD_B));
  return a.mul(0.6).add(b.mul(0.4)).mul(0.45).add(0.55);
}

/** The sprite's shader graph, shared by the main pass and the shadow pass. */
function makeCloudNodes(
  u: CloudUniforms,
  skyCube?: THREE.CubeTexture,
  skyEnv?: THREE.Texture | null,
) {
  const offset = TSL.attribute("aOffset", "vec4") as unknown as Vec4Node;
  const rel = TSL.attribute("aRel", "vec4") as unknown as Vec4Node;
  const life = TSL.attribute("aLife", "vec2") as unknown as Vec4Node;
  const radius = offset.w;

  // Is this sphere up? Its cloud's lagged reading of the cloudiness curve
  // against its own threshold, with a soft band so it fades in and out.
  const cloudiness = cloudinessAt(u.clock.sub(life.y));
  const alive = TSL.smoothstep(
    life.x.sub(WEATHER_BAND),
    life.x.add(WEATHER_BAND),
    cloudiness,
  );

  // Travel: the field streams westward (-x) with the sun, plus the
  // wall-clock drift, and wraps so it never runs out.
  const R = u.fieldRadius;
  const span = R.mul(2.0);
  const shift = u.drift.sub(u.clock.div(24.0).mul(u.travel).mul(span));
  const x = TSL.fract(offset.x.add(shift).add(R).div(span)).mul(span).sub(R);
  const center = TSL.vec3(x, offset.y, offset.z);

  // A sphere's normal, reconstructed from the disc in view space — the view
  // of whichever camera is drawing, which is the light in the shadow pass.
  const d = TSL.uv().sub(0.5).mul(2.0);
  const r2 = d.dot(d);
  const nz = TSL.sqrt(TSL.max(TSL.float(1.0).sub(r2), 0.0));
  const nView = TSL.vec3(d.x, d.y, nz);
  const nWorld = TSL.normalize(
    TSL.cameraWorldMatrix.mul(TSL.vec4(nView, 0.0)).xyz,
  );

  // Erode the disc with noise sampled on the sphere's surface, so the
  // silhouette is a lump rather than a coin and stays put as the view turns.
  // The noise slides with the clock, so the lumps boil in the time-lapse.
  const surface = center.add(nWorld.mul(radius));
  const boil = u.clock.mul(BOIL_RATE);
  const noise = TSL.mx_fractal_noise_float(
    surface
      .mul(u.noiseScale)
      .add(rel.w.mul(37.0))
      .add(TSL.vec3(boil, boil.mul(0.35), 0.0)),
    3,
    2.2,
    0.5,
    1.0,
  );
  const shape = TSL.smoothstep(1.0, 0.25, r2.add(noise.mul(0.65)));

  // Shading normal: the sphere's, pulled toward the cloud's — where this
  // sphere sits in the cluster, tilted up so the top surface faces the sky.
  const nCloud = TSL.normalize(rel.xyz.add(TSL.vec3(0.0, 0.3, 0.0)));
  const nShade = TSL.normalize(TSL.mix(nWorld, nCloud, 0.6));
  const up = nWorld.y;
  // Occlusion terms follow the blended normal, so an underside darkens per
  // cloud rather than per bubble.
  const top = TSL.smoothstep(-0.9, 0.4, nShade.y);
  const exposure = TSL.smoothstep(0.1, 0.9, TSL.length(rel.xyz));

  // One light's contribution: soft wrap (clouds are all multiple scattering,
  // the terminator is never crisp) and the cloud-scale sun-side/shade split.
  // No underside darkening here on purpose: at sunset the underside is the
  // lit side, and the wrap already handles a high sun.
  const litBy = (dirNode: unknown, radianceNode: unknown) => {
    // Uniform nodes carry a narrower TS type than the swizzle-able var nodes.
    const dir = dirNode as Vec3Node;
    const radiance = radianceNode as Vec3Node;
    const ndl = nShade.dot(dir);
    const wrap = TSL.clamp(ndl.add(0.75).div(1.75), 0.0, 1.0);
    const shade = TSL.smoothstep(-0.6, 0.5, rel.xyz.dot(dir));
    return radiance.mul(wrap).mul(TSL.mix(0.15, 1.0, shade));
  };
  const direct = litBy(u.sunDir, u.sunRadiance)
    .add(litBy(u.moonDir, u.moonRadiance))
    .mul(u.sunlight);

  // Silver lining: forward scattering through the thin rim when the sun is
  // behind the cloud. In view space, z negative means beyond it.
  const sunView = TSL.normalize(
    TSL.cameraViewMatrix.mul(TSL.vec4(u.sunDir, 0.0)).xyz,
  );
  const rim = TSL.pow(TSL.float(1.0).sub(nz), 3.0);
  const forward = TSL.pow(TSL.max(sunView.z.negate(), 0.0), 8.0);
  const silver = u.sunRadiance.mul(forward).mul(rim).mul(u.sunlight).mul(0.5);

  // Ambient from the sky itself, along the normal, pre-convolved — a cloud in
  // shade is lit by the whole hemisphere, not one direction. Clamped just
  // above the horizon because the bake is black below it. Occlusion darkens
  // undersides and buried spheres.
  const skyDir = TSL.normalize(TSL.vec3(nWorld.x, TSL.max(up, 0.04), nWorld.z));
  const skyRadiance = skyEnv
    ? TSL.pmremTexture(skyEnv, skyDir, TSL.float(1.0))
    : skyCube
      ? TSL.cubeTexture(skyCube, skyDir).rgb
      : TSL.vec3(0.35, 0.45, 0.65);
  const ao = TSL.mix(0.5, 1.0, top).mul(TSL.mix(0.6, 1.0, exposure));
  const ambientLight = skyRadiance.mul(u.ambient).mul(ao);

  // At night the city lights the undersides warm — the sodium wash every
  // overcast Paris night has.
  const horizontal = TSL.length(center.xz);
  const nearCity = TSL.float(1.0).sub(
    TSL.smoothstep(u.cityRadius, u.cityRadius.mul(3.0), horizontal),
  );
  const under = TSL.float(1.0).sub(TSL.smoothstep(-0.7, 0.4, nShade.y));
  const glow = TSL.vec3(1.0, 0.6, 0.3)
    .mul(under)
    .mul(nearCity)
    .mul(u.night)
    .mul(0.22);

  let rgb = direct
    .div(Math.PI)
    .add(ambientLight)
    .mul(ALBEDO)
    .add(silver)
    .add(glow);

  // The same exponential height fog the post pass applies to the city. The
  // sprites write no depth, so that pass sees sky behind them and skips them.
  const toCloud = center.sub(TSL.cameraPosition);
  const dist = TSL.length(toCloud);
  const rayY = toCloud.y.div(dist);
  const H = u.fogHeight;
  const sigma = u.fogDensity.div(1000.0);
  const xx = dist.mul(rayY).div(H);
  const term = TSL.abs(xx)
    .lessThan(1e-4)
    .select(
      TSL.float(1.0).sub(xx.mul(0.5)),
      TSL.float(1.0).sub(TSL.exp(xx.negate())).div(xx),
    );
  const od = sigma
    .mul(TSL.exp(TSL.cameraPosition.y.negate().div(H)))
    .mul(dist)
    .mul(term);
  const fogAmount = TSL.clamp(TSL.float(1.0).sub(TSL.exp(od.negate())), 0.0, 1.0);
  const fogDir = TSL.normalize(
    TSL.vec3(toCloud.x, TSL.max(toCloud.y, dist.mul(0.02)), toCloud.z),
  );
  const fogColor = skyCube ? TSL.cubeTexture(skyCube, fogDir).rgb : skyRadiance;
  rgb = TSL.mix(rgb, fogColor, fogAmount);

  // Fade out toward the wrap seam so nothing pops at the field's edge.
  const seam = TSL.float(1.0).sub(TSL.smoothstep(R.mul(0.86), R, TSL.abs(x)));
  const alpha = shape.mul(u.density).mul(seam).mul(alive);

  const colorNode = TSL.Fn(() => {
    r2.greaterThan(1.0).discard();
    return TSL.vec4(rgb, alpha);
  })();

  // Shadow pass: billboard toward the light. The view matrix there is the
  // light camera's, and with an identity model matrix its rotation rows are
  // the view axes in world space.
  const V = TSL.cameraViewMatrix as unknown as Vec4Node[];
  const right = TSL.vec3(V[0].x, V[1].x, V[2].x);
  const upAxis = TSL.vec3(V[0].y, V[1].y, V[2].y);
  const q = TSL.positionGeometry.xy;
  const castPosition = center.add(
    right.mul(q.x).add(upAxis.mul(q.y)).mul(radius.mul(2.0)),
  );
  // A dissolving cloud stops casting before it is gone.
  const shadowMask = shape.mul(alive).greaterThan(u.shadowThreshold);

  return {
    positionNode: center,
    // Spheres that are not up collapse to nothing in the vertex stage.
    scaleNode: radius.mul(2.0).mul(TSL.step(0.001, alive)),
    colorNode,
    castPosition,
    shadowMask,
  };
}

interface Field {
  geometry: THREE.InstancedBufferGeometry;
  offsetAttr: THREE.InstancedBufferAttribute;
  relAttr: THREE.InstancedBufferAttribute;
  lifeAttr: THREE.InstancedBufferAttribute;
  /** Master copies in world units, in generation order. */
  offsets: Float32Array;
  rels: Float32Array;
  lives: Float32Array;
  count: number;
  clouds: CloudRange[];
  order: Uint32Array;
  keys: Float32Array;
}

const _forward = new THREE.Vector3();

/**
 * Painter's order, per cloud: clouds back to front along the view axis, and
 * within a cloud the fixed cores → lumps → bumps order. Sorting whole clouds
 * rather than spheres keeps overlaps from swapping as the view turns — a
 * wrong overlap inside one cloud is invisible, a flickering one is not. One
 * instanced draw renders in attribute order, so the permutation is written
 * into the buffers: a few kilobytes, only when the view has turned or the
 * field has moved.
 */
function sortField(
  field: Field,
  camera: THREE.Camera,
  shift: number,
  fieldRadius: number,
) {
  const {
    offsets,
    rels,
    lives,
    clouds,
    order,
    keys,
    offsetAttr,
    relAttr,
    lifeAttr,
  } = field;
  const cam = camera.position;
  const span = fieldRadius * 2;
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    let x = c.cx + shift;
    x = ((((x + fieldRadius) % span) + span) % span) - fieldRadius;
    keys[i] =
      (x - cam.x) * _forward.x +
      (c.cy - cam.y) * _forward.y +
      (c.cz - cam.z) * _forward.z;
  }
  order.sort((a, b) => keys[b] - keys[a]);
  const oa = offsetAttr.array as Float32Array;
  const ra = relAttr.array as Float32Array;
  const la = lifeAttr.array as Float32Array;
  let k = 0;
  for (let n = 0; n < clouds.length; n++) {
    const c = clouds[order[n]];
    oa.set(offsets.subarray(c.start * 4, (c.start + c.count) * 4), k * 4);
    ra.set(rels.subarray(c.start * 4, (c.start + c.count) * 4), k * 4);
    la.set(lives.subarray(c.start * 2, (c.start + c.count) * 2), k * 2);
    k += c.count;
  }
  offsetAttr.needsUpdate = true;
  relAttr.needsUpdate = true;
  lifeAttr.needsUpdate = true;
}

/**
 * The sun as the clouds see it: colour by elevation on the same bands as the
 * visible disc, dimmed toward the horizon, alive until a degree below it (a
 * cloud at a kilometre sees past the ground horizon). The sky renders at
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

/** Memoized like the city: the field only rebuilds when its own knobs move. */
export const Clouds = memo(function Clouds({
  coverage = 0.6,
  altitude = 240,
  size = 1,
  density = 0.85,
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
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(makeUniforms, []);

  const field = useMemo<Field>(() => {
    const { puffs, clouds } = buildField(coverage, altitude, size);
    const count = puffs.length;
    const offsets = new Float32Array(count * 4);
    const rels = new Float32Array(count * 4);
    const lives = new Float32Array(count * 2);
    puffs.forEach((p, i) => {
      offsets[i * 4] = p.x * worldScale;
      offsets[i * 4 + 1] = p.y * worldScale;
      offsets[i * 4 + 2] = p.z * worldScale;
      offsets[i * 4 + 3] = p.r * worldScale;
      rels[i * 4] = p.rx;
      rels[i * 4 + 1] = p.ry;
      rels[i * 4 + 2] = p.rz;
      rels[i * 4 + 3] = p.seed;
      lives[i * 2] = p.threshold;
      lives[i * 2 + 1] = p.stagger;
    });
    for (const c of clouds) {
      c.cx *= worldScale;
      c.cy *= worldScale;
      c.cz *= worldScale;
    }

    // One instanced quad per sphere, same construction as the star field.
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.attributes.position);
    geometry.setAttribute("uv", quad.attributes.uv);
    quad.dispose();

    const offsetAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(offsets),
      4,
    ).setUsage(THREE.DynamicDrawUsage);
    const relAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(rels),
      4,
    ).setUsage(THREE.DynamicDrawUsage);
    const lifeAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(lives),
      2,
    ).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aOffset", offsetAttr);
    geometry.setAttribute("aRel", relAttr);
    geometry.setAttribute("aLife", lifeAttr);
    geometry.instanceCount = count;

    const order = new Uint32Array(clouds.length);
    for (let i = 0; i < clouds.length; i++) order[i] = i;

    return {
      geometry,
      offsetAttr,
      relAttr,
      lifeAttr,
      offsets,
      rels,
      lives,
      count,
      clouds,
      order,
      keys: new Float32Array(clouds.length),
    };
  }, [coverage, altitude, size, worldScale]);

  // Keyed on the sky textures so the graph rebuilds once the first bake lands.
  const material = useMemo(() => {
    const nodes = makeCloudNodes(uniforms, skyCube, skyEnv);
    const material = new THREE.SpriteNodeMaterial() as THREE.SpriteNodeMaterial & {
      maskShadowNode: THREE.Node | null;
      castShadowPositionNode: THREE.Node | null;
    };
    material.name = "CloudPuff";
    material.positionNode = nodes.positionNode;
    material.scaleNode = nodes.scaleNode as unknown as THREE.Node;
    material.colorNode = nodes.colorNode;
    material.castShadowPositionNode = nodes.castPosition;
    material.maskShadowNode = nodes.shadowMask;
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.blending = THREE.NormalBlending;
    material.fog = false;
    material.toneMapped = true;
    // The shadow pass culls front faces by default; the light-facing
    // billboard is all front face.
    material.shadowSide = THREE.DoubleSide;
    return material;
  }, [uniforms, skyCube, skyEnv]);

  useEffect(
    () => () => {
      field.geometry.dispose();
    },
    [field],
  );
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    uniforms.night.value = night;
    uniforms.sunlight.value = sunlight;
    uniforms.ambient.value = ambient;
    uniforms.density.value = density;
    uniforms.fogDensity.value = fogDensity;
    uniforms.fogHeight.value = fogHeight;
    uniforms.fieldRadius.value = CLOUD_FIELD_RADIUS * worldScale;
    uniforms.cityRadius.value = CITY_RADIUS * worldScale;
    uniforms.noiseScale.value = NOISE_FREQUENCY / worldScale;
    uniforms.moonRadiance.value.copy(MOON_COLOR).multiplyScalar(MOON_STRENGTH * night);
    uniforms.travel.value = travel;
  }, [
    uniforms,
    night,
    sunlight,
    ambient,
    density,
    fogDensity,
    fogHeight,
    worldScale,
    travel,
  ]);

  /**
   * The weather clock: the dial only hands over hours, so midnight wraps are
   * counted here to keep it continuous — one day's weather leads into the
   * next instead of every day being the same day.
   */
  const clock = useRef({ hours: timeOfDay, day: 0 });

  const sortState = useRef({
    forward: new THREE.Vector3(),
    position: new THREE.Vector3(),
    time: -Infinity,
    shift: 0,
    field: null as Field | null,
  });

  useFrame(({ camera, elapsed }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // No cloud shadows by moonlight: the moon is a fixed, hand-placed key,
    // and shade swinging round to it at dusk would read as a bug.
    mesh.castShadow = shadows && night < 0.85;

    // The sun: the sky's true solar vector when there is a sky, else the key.
    const sunDirection = sky?.mesh?.sunDirection?.value;
    if (sunDirection) {
      uniforms.sunDir.value.copy(sunDirection);
      sunRadiance(sky?.sunElevation ?? -90, exposure, uniforms.sunRadiance.value);
    } else {
      uniforms.sunDir.value
        .set(lightPosition[0], lightPosition[1], lightPosition[2])
        .normalize();
      uniforms.sunRadiance.value.set(lightColor).multiplyScalar(lightIntensity);
    }

    const c = clock.current;
    const dh = timeOfDay - c.hours;
    if (dh < -12) c.day += 1;
    else if (dh > 12) c.day -= 1;
    c.hours = timeOfDay;
    uniforms.clock.value = c.day * 24 + timeOfDay;

    uniforms.drift.value += wind * worldScale * delta;
    const fieldRadius = uniforms.fieldRadius.value;
    const shift =
      uniforms.drift.value -
      (uniforms.clock.value / 24) * travel * fieldRadius * 2;

    const s = sortState.current;
    camera.getWorldDirection(_forward);
    const stale =
      s.field !== field ||
      _forward.dot(s.forward) < SORT_COS ||
      camera.position.distanceToSquared(s.position) > SORT_MOVE_SQ ||
      Math.abs(shift - s.shift) > SORT_SHIFT ||
      (wind !== 0 && elapsed - s.time > SORT_INTERVAL);
    if (!stale) return;

    s.field = field;
    s.forward.copy(_forward);
    s.position.copy(camera.position);
    s.time = elapsed;
    s.shift = shift;
    sortField(field, camera, shift, fieldRadius);
  });

  // Culling is per draw, and the field spans the whole sky.
  return (
    <mesh
      ref={meshRef}
      geometry={field.geometry}
      material={material}
      frustumCulled={false}
      renderOrder={1}
    />
  );
});
