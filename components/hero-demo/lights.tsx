"use client";

import { Environment } from "@react-three/drei";
import { Vector3, type ColorRepresentation } from "three";

/**
 * Ported from `threejs-conf-pmndrs/src/Lights.tsx`.
 *
 * The cubemap IBL, the ambient and the hemisphere fill are Stage 0
 * scaffolding that `@pmndrs/sky` replaces once it drives the scene. What
 * survives is one shadow-casting key light: the sun by day, Faraz's
 * hand-placed moon by night, blended through twilight by the caller. One
 * light rather than two, so the city pays for a single shadow pass and the
 * shadows swing around at dusk instead of popping from one caster to the
 * other.
 */

/** How far the key sits from the origin — a direction, held well outside the city. */
export const KEY_DISTANCE = 400;

/** Faraz's moon, as a direction. */
export const MOON_DIRECTION = new Vector3(-25, 40, -20).normalize();

/**
 * Depth bias as a world-space offset. Three's `shadow.bias` is in NDC depth,
 * so a fixed value would grow with the frustum's depth range — and the range
 * grows when the clouds need the frustum to start kilometres behind the light.
 * 0.4 is the -0.0005 the ring was tuned with, at its original 800-unit range.
 */
const SHADOW_BIAS_WORLD = 0.4;

export function Lights({
  shadowRadius = 60,
  shadowNear = 1,
  environment = true,
  sunlight = true,
  keyColor = "#aac4ff",
  keyIntensity = 0.6,
  keyPosition = MOON_DIRECTION.clone()
    .multiplyScalar(KEY_DISTANCE)
    .toArray() as [number, number, number],
  fillIntensity = 0,
}: {
  shadowRadius?: number;
  /**
   * Near plane of the key's ortho frustum, world units. Negative reaches
   * behind the light — how clouds on the sun side of the city get into the
   * map at all.
   */
  shadowNear?: number;
  environment?: boolean;
  /** The shadow-casting key: sun by day, moon by night. */
  keyColor?: ColorRepresentation;
  keyIntensity?: number;
  /** Direction only, but keep its length at `KEY_DISTANCE` for the frustum. */
  keyPosition?: [number, number, number];
  /** Daylight fill for camera-facing latticework; casts nothing. */
  fillIntensity?: number;
  /**
   * Faraz's ambient + hemisphere fill.
   *
   * Off once sky is driving the scene: sky sets `scene.environment` from its own
   * PMREM bake, so keeping these would double-count the ambient and light the
   * city from a direction the sky doesn't agree with. The shadow-casting
   * key stays either way — sky provides illumination, not shadows.
   */
  sunlight?: boolean;
}) {
  const shadowFar = KEY_DISTANCE * 2;
  const shadowBias = -SHADOW_BIAS_WORLD / (shadowFar - shadowNear);

  return (
    <>
      {/* Night sky cubemap, image-based lighting only — the sky itself is the
          scene background. Deleted at Stage 1. */}
      {environment && (
        <Environment
          files={["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"]}
          path="/hero-demo/sky_81_cubemap_2k/"
          environmentIntensity={0.12}
          blur={0.5}
        />
      )}

      {sunlight && (
        <>
          {/* Cool ambient fill so shadows stay a deep blue rather than black */}
          <ambientLight color="#33456b" intensity={0.12} />

          {/* Sky/ground bounce to lift the scene subtly */}
          <hemisphereLight
            color="#3a4d80"
            groundColor="#0a0f1c"
            intensity={0.1}
          />
        </>
      )}

      {/* Daylight fill for camera facing latticework. */}
      <directionalLight
        position={[12, 24, 35]}
        intensity={fillIntensity}
        color="#ffd3b0"
      />

      {/* The key. The ortho frustum is fitted to the near city rather than the
          full 400-unit disc — the original spent its whole 2048² map on
          geometry too far away to read, which is why near shadows were mushy.
          The depth range is sized from KEY_DISTANCE so a low sun's long
          shadows still fit. */}
      <directionalLight
        castShadow
        position={keyPosition}
        intensity={keyIntensity}
        color={keyColor}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={shadowNear}
        shadow-camera-far={shadowFar}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-bias={shadowBias}
        shadow-normalBias={0.05}
      />
    </>
  );
}
