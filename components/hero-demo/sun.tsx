"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/webgpu";
import { useSky } from "@pmndrs/sky/react";
import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

/**
 * The parts of the sky instance the sun reads. `mesh.sunDirection` is the
 * Y-up world uniform the atmosphere itself samples with, north rotation
 * included, so following it keeps the sphere exactly where the sky's own
 * glow and the scene's directional light already agree the sun is.
 */
interface SkyWithSun {
  sunElevation: number;
  mesh?: { sunDirection?: { value: THREE.Vector3 } };
}

/**
 * Where the disc hangs.
 *
 * - `solar`: the true solar position. Honest, and practically never on
 *   screen: the June sun over Paris tops out at 64° while a 30° fov reaches
 *   ~18° above the horizon.
 * - `arc`: a world-anchored arc — it moves with the orbit like a real sun
 *   and can leave the frame — but narrower and lower than the true path:
 *   the bearing sweeps from `arcCenter − arcSweep` at sunrise to
 *   `arcCenter + arcSweep` at sunset (south ±45° by default, SE to SW) with
 *   the elevation compressed into the top of the frame, so it spends far
 *   more of the day where the camera can see it.
 * - `framed`: a composed arc relative to the camera, rising at
 *   `offset − sweep`, crossing the frame as the day advances, setting at
 *   `offset + sweep`. Always in the picture; the city turns beneath it.
 *
 * In every mode colour, extinction and the horizon crossing follow the real
 * solar elevation, so the disc rises and sets with the atmosphere.
 */
export type SunPlacement = "solar" | "arc" | "framed";

export interface SunOptions {
  /**
   * Apparent angular diameter in degrees. The real sun is 0.53°, which at
   * a 30° vertical fov is a handful of pixels; a stylised 2–3° reads as a
   * sun and gives bloom a core worth blooming.
   */
  size?: number;
  /** Emissive strength at high elevation, before atmospheric extinction. */
  intensity?: number;
  /** Metres per scene unit; sets the dome distance inside the far plane. */
  worldScale?: number;
  placement?: SunPlacement;
  /** `arc` only: bearing of the arc's midpoint in degrees; 180 is south. */
  arcCenter?: number;
  /** `arc` only: bearing swept either side of the centre by sunset. */
  arcSweep?: number;
  /** Which world axis points north, matching the atmosphere. */
  north?: string;
  /**
   * `framed` only: centre of the arc, as a fraction of the view half-width.
   * 0 is dead centre behind the tower, ±1 the frame edge. A little to the
   * right keeps the noon sun clear of the lettering.
   */
  offset?: number;
  /** `framed` only: half-width of the arc, same units as `offset`. */
  sweep?: number;
  /** Solar hours, shared with the atmosphere; drives the `framed` arc. */
  timeOfDay?: number;
  /** Observer latitude, for the day length the arc is timed against. */
  latitude?: number;
  /** Calendar day, shared with the atmosphere's solar model. */
  dayOfYear?: number;
}

/**
 * Sun dome distance per unit of `worldScale`. The camera far plane is
 * `1400 · worldScale`, so 800 keeps the sphere in front of it at every
 * scale while sitting on the same 4000-unit dome the stars use by default.
 */
const DOME_PER_SCALE = 800;

/** Elevation window over which the disc slips below the horizon. */
const HORIZON_FADE_START = 0.6;
const HORIZON_FADE_END = -1.4;

/**
 * Lowered elevation: below `FRAME_KNEE` the disc keeps its real elevation so
 * rising and setting behind the skyline stay honest; above it the rest of
 * the day is squeezed into the band up to `FRAME_PEAK`. The frame's top
 * edge is ~18° above the horizon at the hero's 93° polar angle, so at high
 * noon the disc sits well inside it while still reading as a low sun — the
 * natural-looking end of the trade between height and staying in the
 * picture. `FRAME_SOFTNESS` sets
 * how quickly the climb saturates: smaller reaches the peak earlier and
 * plateaus through midday, larger keeps it rising and falling all day.
 */
const FRAME_KNEE = 3;
const FRAME_PEAK = 12;
const FRAME_SOFTNESS = 16;

const framedElevation = (elevation: number) =>
  elevation <= FRAME_KNEE
    ? elevation
    : FRAME_KNEE +
      (FRAME_PEAK - FRAME_KNEE) *
        (1 - Math.exp(-(elevation - FRAME_KNEE) / FRAME_SOFTNESS));

/**
 * Progress through the daylight hours: −1 at sunrise, 0 at solar noon,
 * +1 at sunset. The half day length comes from the sunrise hour angle
 * (`cos H₀ = −tan φ · tan δ`) with the standard declination approximation;
 * the atmosphere's equation-of-time refinement shifts noon by minutes,
 * which the arc cannot show.
 */
function dayProgress(timeOfDay: number, latitude: number, dayOfYear: number) {
  const DEG = Math.PI / 180;
  const declination = 23.44 * DEG * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const cosH0 = THREE.MathUtils.clamp(
    -Math.tan(latitude * DEG) * Math.tan(declination),
    -1,
    1,
  );
  // Hours from noon to sunset; floored so a polar night cannot divide by 0.
  const halfDay = Math.max(Math.acos(cosH0) / (15 * DEG), 0.5);
  return THREE.MathUtils.clamp((timeOfDay - 12) / halfDay, -1.25, 1.25);
}

/** World yaw of north, matching the atmosphere's `north` convention. */
const NORTH_OFFSET: Record<string, number> = {
  "+Z": 0,
  "-Z": 180,
  "+X": 90,
  "-X": -90,
};

const scratchForward = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();

/**
 * Disc colour by elevation. With a 30° fov the sun only ever shares the
 * frame with the tower below ~18°, so the ramp is tuned for the golden
 * band: warm white overhead, gold through the low teens, orange-red at the
 * horizon.
 */
const COLOR_HIGH = new THREE.Color("#fff1d6");
const COLOR_LOW = new THREE.Color("#ffa040");
const COLOR_HORIZON = new THREE.Color("#ff5a1f");

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * A visible sun for the day/night cycle.
 *
 * The atmosphere's own disc never reaches the screen here: the React `Sky`
 * paints the *baked* cube as the background, and the bake hides the disc so
 * the IBL and fog cubes don't carry a hot spot. This sphere is the sun the
 * viewer sees. It tracks the sky's sun uniform every frame, and it is
 * written through `emissiveNode` rather than plain colour, so the scene
 * pass's emissive MRT attachment hands it to bloom the same way it hands
 * over the tower glitter — the halo is real bloom, not a painted glow. Its
 * radiance also lands in the colour buffer SSGI samples, so with GI on the
 * disc leaks warm light onto the skyline in front of it.
 *
 * Depth is tested but not written: the tower and city still occlude it, but
 * the depth buffer keeps the sky's far-plane value at every sun pixel, which
 * is what the sky fog uses to skip the sky. Extinction near the horizon is
 * handled by the elevation ramp instead of by fogging a 4 km sphere.
 */
export function Sun({
  size = 2.2,
  intensity = 8,
  worldScale = 5,
  placement = "arc",
  arcCenter = 180,
  arcSweep = 45,
  north = "+Z",
  offset = 0.2,
  sweep = 0.75,
  timeOfDay = 12,
  latitude = 48.8566,
  dayOfYear = 176,
}: SunOptions) {
  const sky = useSky() as unknown as SkyWithSun | null;
  const meshRef = useRef<THREE.Mesh>(null);

  /** Live uniforms: colour and strength follow elevation without a rebuild. */
  const uniforms = useMemo(
    () => ({
      color: TSL.uniform(new THREE.Color(COLOR_HIGH)),
      strength: TSL.uniform(0),
    }),
    [],
  );

  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.SphereGeometry(1, 48, 24);

    // Angle from the disc centre: 1 facing the camera, 0 at the limb.
    const facing = TSL.normalView.z.clamp(0, 1);
    // Feather the outer few percent of the radius so the rim is antialiased
    // at scene resolution rather than left to FSR to guess at.
    const coverage = TSL.smoothstep(0.0, 0.3, facing);
    // The core clips to white through the tone mapper whatever its colour,
    // so the hue has to live in a rim band: strong limb darkening leaves the
    // outer disc in the range where the ramp colour survives tone mapping.
    const limb = TSL.mix(0.16, 1.0, facing.pow(2.0));

    // `emissiveNode` is honoured by `NodeMaterial.setupLighting` on every
    // node material (it is what feeds the `emissive` MRT output bloom reads),
    // but only the standard material's typings declare it. The basic
    // material is the right runtime: unlit, no PBR pass for a disc.
    const material = new THREE.MeshBasicNodeMaterial() as
      THREE.MeshBasicNodeMaterial & { emissiveNode: THREE.Node | null };
    // No diffuse contribution: nothing for the environment map or SSGI to
    // light, and the `diffuse` MRT attachment stays black under the disc.
    material.colorNode = TSL.vec4(0.0, 0.0, 0.0, coverage);
    material.emissiveNode = uniforms.color.mul(uniforms.strength).mul(limb);
    material.transparent = true;
    material.depthTest = true;
    material.depthWrite = false;
    material.fog = false;
    material.toneMapped = true;

    return { geometry, material };
  }, [uniforms]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const distance = DOME_PER_SCALE * worldScale;
  const radius = distance * Math.tan(THREE.MathUtils.degToRad(size / 2));

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const solar = sky?.mesh?.sunDirection?.value;
    const elevation = sky?.sunElevation ?? -90;

    // Below the horizon there is nothing to draw; skip the pass entirely.
    const visibility = smoothstep(HORIZON_FADE_END, HORIZON_FADE_START, elevation);
    mesh.visible = Boolean(solar) && visibility > 0;
    if (!solar || !mesh.visible) return;

    let direction: THREE.Vector3 = solar;
    const pitch = THREE.MathUtils.degToRad(framedElevation(elevation));
    const cosPitch = Math.cos(pitch);

    if (placement === "arc") {
      // Bearing sweeps the narrowed arc as the day advances; the same
      // spherical convention as the sky's `setSun`, north offset included.
      const bearing =
        arcCenter + arcSweep * dayProgress(timeOfDay, latitude, dayOfYear);
      const theta = THREE.MathUtils.degToRad(
        bearing + (NORTH_OFFSET[north] ?? 0),
      );
      direction = scratchDirection.set(
        Math.sin(theta) * cosPitch,
        Math.sin(pitch),
        Math.cos(theta) * cosPitch,
      );
    } else if (placement === "framed") {
      // Yaw off the camera's heading by the arc's screen fraction, then
      // lift to the compressed elevation. Working from the projection keeps
      // the same on-screen placement across aspect ratios.
      const cam = camera as THREE.PerspectiveCamera;
      const halfV = THREE.MathUtils.degToRad(cam.fov) / 2;
      const halfH = Math.atan(Math.tan(halfV) * cam.aspect);
      const across = offset + sweep * dayProgress(timeOfDay, latitude, dayOfYear);
      const yaw = Math.atan(Math.tan(halfH) * across);

      const forward = camera.getWorldDirection(scratchForward);
      forward.y = 0;
      forward.normalize();
      // Camera right on the ground plane.
      const rightX = -forward.z;
      const rightZ = forward.x;
      direction = scratchDirection.set(
        (forward.x * Math.cos(yaw) + rightX * Math.sin(yaw)) * cosPitch,
        Math.sin(pitch),
        (forward.z * Math.cos(yaw) + rightZ * Math.sin(yaw)) * cosPitch,
      );
    }

    // Anchor to the camera so the disc sits at infinity like the sky's own
    // glow: an orbit of a few hundred metres must not parallax the sun.
    mesh.position.copy(camera.position).addScaledVector(direction, distance);

    // Atmospheric extinction: the low sun reddens and dims, the horizon
    // crossing goes deep orange before the disc fades out. Dimming is what
    // lets the colour show — at full strength even the rim clips to white.
    const low = 1 - smoothstep(2, 30, elevation);
    const grazing = 1 - smoothstep(-1, 6, elevation);
    uniforms.color.value
      .copy(COLOR_HIGH)
      .lerp(COLOR_LOW, low)
      .lerp(COLOR_HORIZON, grazing);
    const extinction = THREE.MathUtils.lerp(0.25, 1, smoothstep(-1, 25, elevation));
    uniforms.strength.value = intensity * extinction * visibility;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      scale={radius}
      // Position is written every frame from the sky; start hidden so a
      // first frame before the sky has a direction draws nothing.
      visible={false}
    />
  );
}
