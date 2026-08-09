"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber/webgpu";
import * as THREE from "three/webgpu";

import {
  rgbToHex,
  sunPosition,
  todAt,
  type TodKeyframe,
} from "@/lib/time-of-day";
import { DepthAttachmentSync } from "@/components/three/depth-attachment-sync";
import { City } from "./city";
import { Stars } from "./stars";
import { Tower, TOWER_HEIGHT } from "./tower";

const LOOK_AT = new THREE.Vector3(0, TOWER_HEIGHT * 0.46, 0);

/**
 * Frames the tower and adds a slow drift plus pointer parallax.
 *
 * Three's `fov` is vertical, so the tower keeps the same share of the viewport
 * height at any aspect ratio for free. Only the fov widening on small screens is
 * deliberate — it pulls the tower back to leave room for the headline.
 */
function Rig({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, size } = useThree();
  const target = useRef(new THREE.Vector3(0, TOWER_HEIGHT * 0.34, 26));

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = size.width < 640 ? 47 : size.width < 1024 ? 40 : 35;
    cam.updateProjectionMatrix();
  }, [camera, size.width]);

  useFrame((state, delta) => {
    // v10 replaced `state.clock` with flat timing on the frame state.
    const t = state.elapsed;
    const drift = reducedMotion ? 0 : 1;

    target.current.set(
      Math.sin(t * 0.08) * 1.2 * drift + state.pointer.x * 0.9,
      TOWER_HEIGHT * 0.34 +
        Math.sin(t * 0.11) * 0.4 * drift -
        state.pointer.y * 0.7,
      26 + Math.cos(t * 0.06) * 0.8 * drift,
    );

    // Frame-rate independent easing.
    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      target.current.x,
      2.2,
      delta,
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      target.current.y,
      2.2,
      delta,
    );
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      target.current.z,
      2.2,
      delta,
    );
    camera.lookAt(LOOK_AT);
  });

  return null;
}

function Scene({
  tod,
  reducedMotion,
}: {
  tod: TodKeyframe;
  reducedMotion: boolean;
}) {
  const sun = sunPosition(tod);
  // Fog has to match the CSS gradient at the height the horizon lands on, not at
  // its very bottom — otherwise far blocks fade to black against a blue sky.
  const fogColor = rgbToHex([
    tod.skyBottom[0] + (tod.skyMid[0] - tod.skyBottom[0]) * 0.72,
    tod.skyBottom[1] + (tod.skyMid[1] - tod.skyBottom[1]) * 0.72,
    tod.skyBottom[2] + (tod.skyMid[2] - tod.skyBottom[2]) * 0.72,
  ]);

  return (
    <>
      {/* Fog colour tracks the bottom of the CSS gradient behind the canvas, so
          distant blocks dissolve into the same sky the DOM is painting. */}
      <fogExp2 attach="fog" args={[fogColor, 0.016]} />

      <ambientLight
        color={rgbToHex(tod.ambientColor)}
        intensity={tod.ambientIntensity}
      />
      <hemisphereLight
        color={rgbToHex(tod.skyMid)}
        groundColor={rgbToHex(tod.cityColor)}
        intensity={0.45}
      />
      <directionalLight
        position={sun}
        color={rgbToHex(tod.sunColor)}
        intensity={tod.sunIntensity}
      />
      {/* Fill from behind the camera. Without it the ironwork goes to
          silhouette at night and the tower stops reading as the subject. */}
      <directionalLight
        position={[7, 16, 34]}
        color={rgbToHex(tod.skyMid)}
        intensity={2.6}
      />

      <Stars tod={tod} />
      <City tod={tod} />
      <Tower tod={tod} />

      <Rig reducedMotion={reducedMotion} />
      <DepthAttachmentSync />
    </>
  );
}

export function ParisScene({
  value,
  reducedMotion = false,
  paused = false,
}: {
  /** Time of day, 0..100, matching the slider. */
  value: number;
  reducedMotion?: boolean;
  /** Hero is off-screen — render on demand only. */
  paused?: boolean;
}) {
  const tod = todAt(value / 100);

  return (
    <Canvas
      // The primary canvas: it owns the one WebGPURenderer, and every section
      // canvas further down the page shares it via
      // `renderer={{ primaryCanvas: "main" }}`. It must stay mounted for the
      // whole page life — pausing it is fine, unmounting it is not.
      id="main"
      // Transparent so the CSS sky gradient and the logotype layer behind the
      // canvas both stay visible — that is what produces the interleave.
      renderer={{
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      }}
      dpr={[1, 2]}
      // Odd/fractional drawing buffers desync the depth attachment from the
      // swap chain — see DepthAttachmentSync.
      forceEven
      camera={{
        position: [0, TOWER_HEIGHT * 0.34, 26],
        fov: 35,
        near: 0.1,
        far: 400,
      }}
      // "demand" still repaints when props change, so the scrubber keeps working
      // for reduced-motion users and the scene stays correct while paused.
      frameloop={paused || reducedMotion ? "demand" : "always"}
      style={{ pointerEvents: "none" }}
      // No WebGL: fall back to the design doc's original tower plate, placed to
      // match the 3D framing, so the wordmark still interleaves with something.
      fallback={
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: "clamp(40px, 7vh, 80px)",
            width: "min(430px, 74vw)",
            height: "min(660px, 64vh)",
            backgroundImage: "url(/concept/tower-cutout.png)",
            backgroundSize: "contain",
            backgroundPosition: "center bottom",
            backgroundRepeat: "no-repeat",
          }}
        />
      }
    >
      <Scene tod={tod} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
