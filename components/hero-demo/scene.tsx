"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber/webgpu";
import { Sky } from "@pmndrs/sky/react";
import { useControls } from "leva";
import * as THREE from "three/webgpu";

import { Buildings } from "./buildings";
import { Camera, FramingTools } from "./camera";
import { FX } from "./fx";
import { Lights } from "./lights";
import { PerfProbe, type PerfSample } from "./perf-probe";
import { Tower } from "./tower";

/** Paris. The whole point of driving the sun from a real solar position. */
const PARIS_LATITUDE = 48.8566;
/** 2026-06-25, the workshop. Sun arc is seasonal, so the date is not cosmetic. */
const CONFERENCE_DAY_OF_YEAR = 176;

/**
 * The hero demo's own canvas.
 *
 * Deliberately NOT the site's hero canvas: no `id="main"` primary registration,
 * no `alpha: true` wordmark sandwich, no `DepthAttachmentSync`, no secondaries
 * borrowing the renderer. This is a lab — it gets to be a plain opaque canvas so
 * that when something is slow or wrong, the multi-canvas machinery is not a
 * suspect. Those constraints come back when a stage folds into
 * `components/hero/`.
 *
 * The `debug` controls exist so a validation error or a frame-time cliff can be
 * bisected from the panel in a few seconds, instead of by editing and reloading:
 * every object and every MRT attachment has its own switch.
 */
export function HeroDemoScene({
  onSample,
}: {
  onSample: (s: PerfSample) => void;
}) {
  const towerRef = useRef<THREE.Group>(null);

  // Bumped when the tower's GLTF has committed, which is the moment its
  // bounding box becomes measurable and the camera can frame it.
  const [refitKey, setRefitKey] = useState(0);
  const onTowerReady = useCallback(() => setRefitKey((v) => v + 1), []);

  const { highRiseCount, lowRiseCount, treeCount, treeShadows } = useControls(
    "city",
    {
      highRiseCount: { value: 300, min: 0, max: 1000, step: 10 },
      lowRiseCount: { value: 10000, min: 0, max: 20000, step: 500 },
      treeCount: { value: 20000, min: 0, max: 40000, step: 1000 },
      treeShadows: false,
    },
  );

  /**
   * The full `SkyProps` surface.
   *
   * Split into two folders because the split is real, not cosmetic: everything
   * in `sky` is applied through a setter on the live instance, while everything
   * in `sky/rebuild` is a construction-time option that tears the `Sky` down and
   * builds a new one (its `useMemo` deps are `preset`, `quality`, `cubeSize`,
   * `enableAerialPerspective`, `apKmPerSlice`). Expect a hitch when touching the
   * second group and none when touching the first.
   */
  const {
    skyEnabled,
    timeOfDay,
    latitude,
    dayOfYear,
    exposure,
    north,
    sunDisc,
    turbidity,
    mirrorBelowHorizon,
  } = useControls("sky", {
    skyEnabled: true,
    // Hours, 0..24. Real solar position for the latitude and day below.
    timeOfDay: { value: 20.5, min: 0, max: 24, step: 0.05 },
    latitude: { value: PARIS_LATITUDE, min: -90, max: 90, step: 0.01 },
    dayOfYear: { value: CONFERENCE_DAY_OF_YEAR, min: 1, max: 365, step: 1 },
    exposure: { value: 40, min: 1, max: 200, step: 1 },
    north: { value: "+Z", options: ["+Z", "-Z", "+X", "-X"] },
    sunDisc: true,
    turbidity: { value: 1, min: 0, max: 10, step: 0.05 },
    // Mirrors the sky's lower hemisphere for a ground-free IBL bake.
    mirrorBelowHorizon: false,
  });

  const { preset, quality, cubeSize } = useControls("sky/rebuild", {
    preset: { value: "earth", options: ["earth", "mars", "titan"] },
    quality: { value: "medium", options: ["low", "medium", "high"] },
    cubeSize: { value: 256, options: [64, 128, 256, 512] },
  });

  const { haze, hazeStrength, hazePolicy, apKmPerSlice } = useControls(
    "sky/haze",
    {
      haze: true,
      hazeStrength: { value: 1, min: 0, max: 3, step: 0.05 },
      hazePolicy: { value: "auto", options: ["auto", "ap", "raymarch"] },
      // Construction-time: 8 km × 32 slices = 256 km of AP coverage.
      apKmPerSlice: { value: 8, min: 1, max: 32, step: 1 },
    },
  );

  /**
   * Metres per scene unit.
   *
   * `@pmndrs/sky` has no scale knob — it reads `camera.position.y` as **metres**
   * (SkyAtmosphereBaker.ts:289). At Faraz's authored scale the tower is ~66
   * units and the city ~400, so taken literally this is a 66 m tower in a 400 m
   * town, and atmospheric extinction over 400 m is nil: the aerial perspective
   * — the main thing sky is here for — would be invisible and we'd be tempted to
   * fake it with `hazeStrength`.
   *
   * A root-group scale is the cheap fix: at 5, the tower lands near its real
   * 330 m and the city spans ~2 km, where haze is actually a physical quantity.
   * Exposed as a slider because watching haze arrive as you scale is the clearest
   * possible demonstration of why the number matters.
   */
  const { worldScale } = useControls("world", {
    worldScale: { value: 5, min: 1, max: 20, step: 0.5 },
  });

  const { padding, autoRotate, autoRotateSpeed, unlocked, polarDegrees } =
    useControls("framing", {
      // Hands the camera over: free orbit, wheel dolly, no polar lock, no
      // auto-fit. Pair with the `logFraming` button to capture values by hand.
      unlocked: false,
      padding: { value: 0.1, min: 0, max: 1.5, step: 0.01 },
      polarDegrees: { value: 93, min: 30, max: 150, step: 0.5 },
      autoRotate: true,
      autoRotateSpeed: { value: 2, min: 0, max: 30, step: 0.5 },
    });

  const { postFx, velocity, ao, bloom } = useControls("post", {
    postFx: true,
    velocity: true,
    ao: true,
    bloom: true,
  });

  const { buildings, tower, environment, shadows } = useControls("debug", {
    buildings: true,
    tower: true,
    environment: false,
    shadows: true,
  });

  const contents = (
    <>
      <Camera
        targetRef={towerRef}
        padding={padding}
        autoRotate={autoRotate}
        autoRotateSpeed={autoRotateSpeed}
        polarDegrees={polarDegrees}
        unlocked={unlocked}
        worldScale={worldScale}
        refitKey={refitKey}
      />
      <FramingTools />

      {/* Everything with a physical size lives under one scale, so the metres
          conversion is a single number rather than sprinkled constants. */}
      <group scale={worldScale}>
        {buildings && (
          <Buildings
            count={highRiseCount}
            lowRiseCount={lowRiseCount}
            treeCount={treeCount}
            treeShadows={treeShadows}
          />
        )}

        {/* The group stays mounted even when the tower is hidden — it is the
            camera's fit target, and an empty box just means the fit is skipped
            until `onReady` fires. */}
        <group ref={towerRef}>
          {tower && <Tower onReady={onTowerReady} />}
        </group>
      </group>

      <Lights
        environment={environment && !skyEnabled}
        shadowRadius={60 * worldScale}
        sunlight={!skyEnabled}
      />

      <FX
        enabled={postFx}
        velocity={velocity}
        ao={ao}
        bloom={bloom}
        haze={haze && skyEnabled}
        hazeStrength={hazeStrength}
        hazePolicy={hazePolicy}
      />
    </>
  );

  return (
    <Canvas
      shadows={shadows}
      renderer={{ antialias: false, powerPreference: "high-performance" }}
      dpr={[1, 2]}
      forceEven
      // No `camera` prop: `<PerspectiveCamera makeDefault>` in <Camera> replaces
      // it wholesale, so anything set here is silently discarded. The clip
      // planes live there, with worldScale applied.
    >
      <Suspense>
        {skyEnabled ? (
          <Sky
            preset={preset}
            quality={quality}
            cubeSize={cubeSize}
            timeOfDay={timeOfDay}
            latitude={latitude}
            dayOfYear={dayOfYear}
            exposure={exposure}
            north={north}
            sunDisc={sunDisc}
            turbidity={turbidity}
            mirrorBelowHorizon={mirrorBelowHorizon}
            enableAerialPerspective={haze}
            apKmPerSlice={apKmPerSlice}
          >
            {contents}
          </Sky>
        ) : (
          <>
            <color attach="background" args={["#0b1428"]} />
            {/* Sky's aerial perspective replaces this once it is on — running
                both would double up the distance falloff. */}
            <fogExp2
              attach="fog"
              args={["#0b1428", 0.001 / worldScale]}
            />
            {contents}
          </>
        )}
      </Suspense>

      <PerfProbe onSample={onSample} />
    </Canvas>
  );
}
