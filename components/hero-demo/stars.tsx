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
}

/**
 * Sun elevations, in degrees, bounding the twilight ramp.
 *
 * Measured against this scene rather than chosen. Midnight on the workshop date
 * only reaches −17.7° — late June in Paris never gets an astronomical night —
 * so a textbook −18° end would mean the field never quite arrives. And the
 * hero's default view sits at −2.9°, barely past sunset, which is where the one
 * liberty here is taken: the ramp opens at 0° rather than the −6° civil
 * twilight where a dozen stars would really be out, so the shipping frame gets
 * its handful of first magnitudes instead of a bare sky. Everything after that
 * point is the honest order.
 */
const TWILIGHT_START = 0;
const TWILIGHT_END = -16;

/** Well past the city, comfortably inside the camera's 7000 far plane. */
const DOME_RADIUS = 4000;

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
 * resolution where a star can be a star. One draw call, 2200 instances, 4400
 * triangles, and only the few thousand pixels the stars actually cover get
 * shaded. Measured at 0.1 ms against a 30 ms frame — inside the run-to-run
 * noise of the same scene with the layer hidden.
 *
 * **How it merges with the day/night cycle.** Not by a cross-fade on the
 * slider: each star carries a magnitude, and its threshold is that magnitude,
 * so the brightest few break through at dusk and the faint majority fill in
 * over the following hours — the order the real sky does it in. At the hero's
 * default that is a handful of pinpricks high in the frame; drag `timeOfDay` to
 * midnight and the field is complete. The ramp reads the sky's own
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
  count = 2200,
  intensity = 2.6,
  size = 5.5,
  twinkle = 0.35,
}: StarsOptions) {
  const sky = useSky() as unknown as SkyWithSun | null;

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

  const { geometry, material } = useMemo(() => {
    const random = makeRandom(0x5eed);

    const offsets = new Float32Array(count * 3);
    // (magnitude, phase, hue, twinkle speed) per star.
    const traits = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      // Uniform in solid angle: a sphere's area is linear in y, so a flat y and
      // a flat azimuth scatter evenly with no polar clumping. The band stops
      // just below the horizon — anything lower is behind the city, and
      // generating it would only pay for stars nobody sees.
      const y = -0.06 + random() * 1.06;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = random() * Math.PI * 2;

      offsets[i * 3] = Math.cos(phi) * r * DOME_RADIUS;
      offsets[i * 3 + 1] = y * DOME_RADIUS;
      offsets[i * 3 + 2] = Math.sin(phi) * r * DOME_RADIUS;

      // Magnitude, skewed hard toward the faint end. A real sky is mostly dim
      // stars around a handful of bright ones, and an even spread is the single
      // thing that makes a starfield read as wallpaper.
      traits[i * 4] = Math.pow(random(), 2.4);
      traits[i * 4 + 1] = random() * Math.PI * 2;
      traits[i * 4 + 2] = random();
      // Per-star twinkle rate, so the field never pulses in step.
      traits[i * 4 + 3] = 0.35 + random() * 0.5;
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
    geometry.instanceCount = count;

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
     * The 0.3 overlap keeps any two from switching on together.
     */
    const threshold = TSL.float(1).sub(magnitude).mul(0.7);
    const emergence = TSL.smoothstep(
      threshold,
      threshold.add(0.3),
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

    // Round, soft-edged, brightest dead centre. Squaring the falloff keeps the
    // core tight while the skirt still antialiases the edge.
    const shape = TSL.smoothstep(1, 0, TSL.uv().sub(0.5).length().mul(2)).pow(2);

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

    return { geometry, material };
  }, [count, uniforms]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state) => {
    uniforms.time.value = state.elapsed;

    // The twilight ramp, straight off the sky's own solar position.
    const elevation = sky?.sunElevation ?? -90;
    const ramp = (elevation - TWILIGHT_START) / (TWILIGHT_END - TWILIGHT_START);
    uniforms.darkness.value = Math.min(1, Math.max(0, ramp));
  });

  // No sidereal drift: the camera's own orbit already parallaxes the field, and
  // the real rate — 15°/hour — moves a star a quarter of a degree over a long
  // visit, which is a comment rather than an effect.
  //
  // Culling is off because the dome is larger than the frustum and always
  // behind everything, so a cull can only ever be wrong; `renderOrder` puts the
  // field under the rest of the transparent queue for the same reason.
  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-1}
    />
  );
}
