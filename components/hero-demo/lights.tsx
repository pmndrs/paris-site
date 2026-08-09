"use client";

import { Environment } from "@react-three/drei";

/**
 * Ported from `threejs-conf-pmndrs/src/Lights.tsx`.
 *
 * Everything here is Stage 0 scaffolding with a short life: `@pmndrs/sky`
 * replaces the cubemap IBL, the ambient, and the hemisphere fill at Stage 1,
 * and drives the directional light from a real solar position instead of a
 * hand-placed moon. Kept faithful for now so Stage 1 is a legible diff and we
 * have an honest before/after.
 */
export function Lights({ shadowRadius = 60 }: { shadowRadius?: number }) {
  return (
    <>
      {/* Night sky cubemap, image-based lighting only — the sky itself is the
          scene background. Deleted at Stage 1. */}
      <Environment
        files={["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"]}
        path="/hero-demo/sky_81_cubemap_2k/"
        environmentIntensity={0.12}
        blur={0.5}
      />

      {/* Cool ambient fill so shadows stay a deep blue rather than black */}
      <ambientLight color="#33456b" intensity={0.12} />

      {/* Sky/ground bounce to lift the scene subtly */}
      <hemisphereLight color="#3a4d80" groundColor="#0a0f1c" intensity={0.1} />

      {/* Moonlight key light casting soft cool shadows.
          The ortho frustum is fitted to the near city rather than the full
          400-unit disc — the original spent its whole 2048² map on geometry
          too far away to read, which is why near shadows were mushy. */}
      <directionalLight
        castShadow
        position={[-25, 40, -20]}
        intensity={0.6}
        color="#aac4ff"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={150}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-bias={-0.0005}
      />
    </>
  );
}
