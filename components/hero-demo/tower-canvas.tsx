"use client";

import {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Canvas } from "@react-three/fiber/webgpu";
import { solarPosition } from "@pmndrs/sky";
import { Sky } from "@pmndrs/sky/react";
import * as THREE from "three/webgpu";

import type { HeroGateController } from "@/lib/hero-gate";
import { Buildings } from "./buildings";
import { Camera, FramingTools } from "./camera";
import { FX, type TextLayer } from "./fx";
import { INTRO_COMPLETE, IntroClock } from "./intro";
import { Lights } from "./lights";
import { Lettering } from "./lettering";
import {
  PARIS_ATMOSPHERE_DEFAULTS,
  PARIS_CITY_DEFAULTS,
} from "./paris-defaults";
import { PerfProbe, type PerfSample } from "./perf-probe";
import { Stars } from "./stars";
import { Sun, type SunPlacement } from "./sun";
import { Terrain } from "./terrain";
import { Tower, type TowerMode } from "./tower";
import { WarmupProbe } from "./warmup-probe";

/** Paris. The whole point of driving the sun from a real solar position. */
export const PARIS_LATITUDE = 48.8566;
/** 2026-06-25, the workshop. Sun arc is seasonal, so the date is not cosmetic. */
export const CONFERENCE_DAY_OF_YEAR = 176;

/** Maps solar elevation to the tower light level. */
export function towerLightLevel({
  timeOfDay,
  latitude,
  dayOfYear,
}: {
  timeOfDay: number;
  latitude: number;
  dayOfYear: number;
}) {
  const { elevation } = solarPosition({ timeOfDay, latitude, dayOfYear });
  // Fade from late golden hour through civil twilight.
  const fade = THREE.MathUtils.clamp((6 - elevation) / 10, 0, 1);
  return fade * fade * (3 - 2 * fade);
}

const NORTH_OFFSET: Record<string, number> = {
  "+Z": 0,
  "-Z": 180,
  "+X": 90,
  "-X": -90,
};

/** Configuration for the reusable tower scene. */
export interface TowerCanvasProps {
  // city
  highRiseCount?: number;
  lowRiseCount?: number;
  treeCount?: number;
  treeShadows?: boolean;
  river?: boolean;
  park?: boolean;
  haussmann?: boolean;
  // tower
  towerMode?: TowerMode;
  beacon?: boolean;
  lettering?: boolean;
  letterSize?: number;
  letterSpread?: number;
  /** How strongly the tower bloom lights the lettering. */
  letterGlow?: number;
  // sky
  skyEnabled?: boolean;
  timeOfDay?: number;
  latitude?: number;
  dayOfYear?: number;
  exposure?: number;
  north?: string;
  sunDisc?: boolean;
  /**
   * The visible sun: an emissive sphere on the sky dome that bloom and
   * SSGI pick up. Independent of `sunDisc`, which is the atmosphere's own
   * pinpoint disc — the baked background hides that one, so this is the
   * sun the viewer actually sees.
   */
  sun?: boolean;
  /** Apparent angular diameter of the sun in degrees. */
  sunSize?: number;
  /** Emissive strength of the sun at high elevation. */
  sunIntensity?: number;
  /**
   * Where the disc hangs: `solar` is the true position (which this framing
   * almost never shows); `arc` is a world-anchored arc narrowed to
   * `sunArcCenter ± sunArcSweep` degrees of bearing and lowered into the
   * frame, so it moves with the orbit but is usually in view; `framed` is a
   * composed camera-relative arc from `sunOffset − sunSweep` at sunrise to
   * `sunOffset + sunSweep` at sunset.
   */
  sunPlacement?: SunPlacement;
  /** `arc` only: bearing of the arc midpoint in degrees, 180 = south. */
  sunArcCenter?: number;
  /** `arc` only: degrees of bearing swept either side of the centre. */
  sunArcSweep?: number;
  /** `framed` only: centre of the arc, fraction of the view half-width. */
  sunOffset?: number;
  /** `framed` only: half-width of the arc, fraction of the view half-width. */
  sunSweep?: number;
  turbidity?: number;
  groundAlbedo?:
    | number
    | THREE.Vector3
    | { x?: number; y?: number; z?: number };
  mirrorBelowHorizon?: boolean;
  stars?: boolean;
  starCount?: number;
  starIntensity?: number;
  starSize?: number;
  starTwinkle?: number;
  preset?: string;
  quality?: string;
  cubeSize?: number;
  // haze / fog
  haze?: boolean;
  hazeStrength?: number;
  hazePolicy?: string;
  apKmPerSlice?: number;
  skyFog?: boolean;
  fogDensity?: number;
  fogHeight?: number;
  fogHorizonClamp?: boolean;
  // world / framing
  worldScale?: number;
  unlocked?: boolean;
  padding?: number;
  polarDegrees?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  // post
  postFx?: boolean;
  ao?: boolean;
  bloom?: boolean;
  fsr?: boolean;
  renderScale?: number;
  ssgi?: boolean;
  ssgiIntensity?: number;
  ssgiAoIntensity?: number;
  ssgiSlices?: number;
  ssgiSteps?: number;
  ssgiRadius?: number;
  // debug switches
  buildings?: boolean;
  tower?: boolean;
  environment?: boolean;
  shadows?: boolean;
  // performance envelope
  /**
   * Caps the render job's rate. ProMotion phones and 120Hz monitors
   * otherwise drive the whole pipeline at 120fps — twice the GPU work for
   * motion this scene doesn't need, and on iOS the difference between an
   * entrance that holds its frame budget and one that thermally sags partway
   * through. `0` lifts the cap (the lab measures uncapped throughput).
   */
  maxFps?: number;
  /**
   * Device pixel ratio range, as r3f's `dpr`. The ceiling scales the stages
   * FSR's `renderScale` cannot touch — the reconstruction itself, the
   * full-resolution lettering pass, and the present — so it is the knob for
   * devices where those are the budget.
   */
  dpr?: [number, number];
  /**
   * Requests the widened `maxColorAttachmentBytesPerSample` device limit the
   * five SSGI attachments need. Without SSGI the MRT layout fits WebGPU's
   * default 32 bytes, and asking for headroom the adapter can't grant fails
   * device creation outright — a hero that shows the fallback poster on
   * devices that could have run it. The lab keeps the headroom so its SSGI
   * toggle works live; surfaces that never enable SSGI should turn this off.
   */
  reserveSsgiHeadroom?: boolean;
  // host integration
  /** Performance samples are collected only when this callback is set. */
  onSample?: (s: PerfSample) => void;
  /** Enables the demo framing controls. */
  tools?: boolean;
  /** Canvas identifier used by the renderer registry. */
  canvasId?: string;
  /** Canvas frame scheduling mode. */
  frameloop?: "always" | "demand" | "never";
  canvasStyle?: CSSProperties;
  /** Content shown when WebGPU is unavailable. */
  fallback?: ReactNode;
  /** Additional nodes rendered inside the canvas. */
  children?: ReactNode;
  /** Plays the staged city and PMNDRS entrance. The demo stays immediate. */
  intro?: boolean;
  /** Fires when the in-scene lettering is far enough along to reveal the UI. */
  onUiReveal?: () => void;
  /** Coordinates first-load warmup and intro playback. */
  gate?: HeroGateController;
}

export function TowerCanvas({
  highRiseCount = PARIS_CITY_DEFAULTS.highRiseCount,
  lowRiseCount = PARIS_CITY_DEFAULTS.lowRiseCount,
  treeCount = PARIS_CITY_DEFAULTS.treeCount,
  treeShadows = PARIS_CITY_DEFAULTS.treeShadows,
  river = PARIS_CITY_DEFAULTS.river,
  park = PARIS_CITY_DEFAULTS.park,
  haussmann = PARIS_CITY_DEFAULTS.haussmann,
  towerMode = "glow",
  beacon = false,
  lettering = true,
  letterSize = 5,
  letterSpread = 0.8,
  letterGlow = 1,
  skyEnabled = PARIS_ATMOSPHERE_DEFAULTS.skyEnabled,
  timeOfDay = 20.5,
  latitude = PARIS_LATITUDE,
  dayOfYear = CONFERENCE_DAY_OF_YEAR,
  exposure = 40,
  north = "+Z",
  sunDisc = true,
  sun = true,
  sunSize = 2.2,
  sunIntensity = 8,
  sunPlacement = "arc",
  sunArcCenter = 180,
  sunArcSweep = 45,
  sunOffset = 0.2,
  sunSweep = 0.75,
  turbidity = PARIS_ATMOSPHERE_DEFAULTS.turbidity,
  groundAlbedo,
  mirrorBelowHorizon = PARIS_ATMOSPHERE_DEFAULTS.mirrorBelowHorizon,
  stars = true,
  starCount = 4200,
  starIntensity = 2.8,
  starSize = 5.25,
  starTwinkle = 0.28,
  preset = PARIS_ATMOSPHERE_DEFAULTS.preset,
  quality = PARIS_ATMOSPHERE_DEFAULTS.quality,
  cubeSize = PARIS_ATMOSPHERE_DEFAULTS.cubeSize,
  haze = PARIS_ATMOSPHERE_DEFAULTS.haze,
  hazeStrength = PARIS_ATMOSPHERE_DEFAULTS.hazeStrength,
  hazePolicy = PARIS_ATMOSPHERE_DEFAULTS.hazePolicy,
  apKmPerSlice = PARIS_ATMOSPHERE_DEFAULTS.apKmPerSlice,
  skyFog = PARIS_ATMOSPHERE_DEFAULTS.skyFog,
  fogDensity = PARIS_ATMOSPHERE_DEFAULTS.fogDensity,
  fogHeight = PARIS_ATMOSPHERE_DEFAULTS.fogHeight,
  fogHorizonClamp = PARIS_ATMOSPHERE_DEFAULTS.fogHorizonClamp,
  worldScale = 5,
  unlocked = false,
  padding = 0.1,
  polarDegrees = 93,
  autoRotate = true,
  autoRotateSpeed = 2,
  postFx = true,
  ao = true,
  bloom = true,
  fsr = true,
  renderScale = 1.5,
  ssgi = false,
  ssgiIntensity = 10,
  ssgiAoIntensity = 2,
  ssgiSlices = 2,
  ssgiSteps = 8,
  ssgiRadius = 12,
  buildings = true,
  tower = true,
  environment = false,
  shadows = true,
  maxFps = 60,
  dpr = [1, 2],
  reserveSsgiHeadroom = true,
  onSample,
  tools = false,
  canvasId,
  frameloop,
  canvasStyle,
  fallback,
  children,
  intro = false,
  onUiReveal,
  gate,
}: TowerCanvasProps) {
  const towerRef = useRef<THREE.Group>(null);
  // Begin gated warmup at the final pose.
  const introClock = useRef(intro && !gate ? 0 : INTRO_COMPLETE);
  const towerLights = towerLightLevel({ timeOfDay, latitude, dayOfYear });
  const sunLight = useMemo(() => {
    const { elevation, azimuth } = solarPosition({
      timeOfDay,
      latitude,
      dayOfYear,
    });
    const position = new THREE.Vector3()
      .setFromSphericalCoords(
        50,
        THREE.MathUtils.degToRad(90 - elevation),
        THREE.MathUtils.degToRad(
          azimuth + (NORTH_OFFSET[north] ?? NORTH_OFFSET["+Z"]),
        ),
      )
      .toArray();
    // Warm the sunlight as it approaches the horizon.
    const warmth = THREE.MathUtils.clamp((24 - elevation) / 20, 0, 1);
    const color = new THREE.Color("#fff6e8").lerp(
      new THREE.Color("#ff9c63"),
      warmth,
    );

    return {
      color,
      intensity: 5.5 * (1 - towerLights),
      position,
    };
  }, [dayOfYear, latitude, north, timeOfDay, towerLights]);

  // Refit the camera after the tower geometry becomes measurable.
  const [refitKey, setRefitKey] = useState(0);
  const onTowerReady = useCallback(() => setRefitKey((v) => v + 1), []);

  /** Full-resolution scene and camera for lettering and tower depth. */
  const [textLayer] = useState<TextLayer>(() => ({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
  }));

  const contents = (
    <>
      <IntroClock
        clock={introClock}
        enabled={intro}
        gate={gate}
        onUiReveal={onUiReveal}
      />

      {gate && (
        <WarmupProbe gate={gate} replayIntro={intro} maxFps={maxFps} />
      )}

      {/* Stars use their own dome radius and render target pixel size. */}
      {stars && (
        <Stars
          count={starCount}
          intensity={starIntensity}
          size={starSize}
          twinkle={starTwinkle}
          timeOfDay={timeOfDay}
          latitude={latitude}
          dayOfYear={dayOfYear}
          north={north}
        />
      )}

      {/* The sun rides the same dome, anchored to the camera. */}
      {sun && skyEnabled && (
        <Sun
          size={sunSize}
          intensity={sunIntensity}
          worldScale={worldScale}
          placement={sunPlacement}
          arcCenter={sunArcCenter}
          arcSweep={sunArcSweep}
          north={north}
          offset={sunOffset}
          sweep={sunSweep}
          timeOfDay={timeOfDay}
          latitude={latitude}
          dayOfYear={dayOfYear}
        />
      )}

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
      {tools && <FramingTools />}

      {/* Everything with a physical size lives under one scale, so the metres
          conversion is a single number rather than sprinkled constants. */}
      <group scale={worldScale}>
        <Terrain river={river} park={park} />

        {buildings && (
          <Buildings
            count={highRiseCount}
            lowRiseCount={lowRiseCount}
            treeCount={treeCount}
            treeShadows={treeShadows}
            river={river}
            park={park}
            haussmann={haussmann}
            introClock={introClock}
          />
        )}

        {/* The group stays mounted even when the tower is hidden — it is the
            camera's fit target, and an empty box just means the fit is skipped
            until `onReady` fires. */}
        <group ref={towerRef}>
          {tower && (
            <Tower
              onReady={onTowerReady}
              mode={towerMode}
              beacon={beacon}
              lightLevel={towerLights}
              occluderScene={lettering ? textLayer.scene : undefined}
              worldScale={worldScale}
            />
          )}
        </group>
      </group>

      {/* Lettering applies world scale inside its portal scene. */}
      {lettering && (
        <Lettering
          size={letterSize}
          spread={letterSpread}
          worldScale={worldScale}
          textLayer={textLayer}
          introClock={introClock}
          towerLightLevel={towerLights}
        />
      )}

      <Lights
        environment={environment && !skyEnabled}
        shadowRadius={60 * worldScale}
        sunlight={!skyEnabled}
        sunColor={sunLight.color}
        sunIntensity={skyEnabled ? sunLight.intensity : 0}
        sunPosition={sunLight.position}
      />

      <FX
        enabled={postFx}
        ao={ao}
        bloom={bloom}
        haze={haze && skyEnabled}
        hazeStrength={hazeStrength}
        hazePolicy={hazePolicy}
        skyFog={skyFog && skyEnabled}
        skyFogDensity={fogDensity}
        skyFogHeight={fogHeight}
        skyFogHorizonClamp={fogHorizonClamp}
        fsr={fsr}
        renderScale={renderScale}
        ssgi={ssgi}
        ssgiIntensity={ssgiIntensity}
        ssgiAoIntensity={ssgiAoIntensity}
        ssgiSlices={ssgiSlices}
        ssgiSteps={ssgiSteps}
        ssgiRadius={ssgiRadius}
        textLayer={textLayer}
        textEnabled={lettering}
        textGlow={letterGlow}
      />
    </>
  );

  return (
    <Canvas
      id={canvasId}
      shadows={shadows}
      frameloop={frameloop}
      renderer={{
        antialias: false,
        powerPreference: "high-performance",
        // Keep the canvas transparent until the sky background is ready.
        alpha: true,
        // The five SSGI attachments require at least 40 bytes per sample.
        ...(reserveSsgiHeadroom
          ? { requiredLimits: { maxColorAttachmentBytesPerSample: 64 } }
          : {}),
        ...(maxFps ? { scheduler: { fps: maxFps } } : {}),
      }}
      dpr={dpr}
      forceEven
      style={canvasStyle}
      fallback={fallback}
      // The Camera component owns the default camera and clip planes.
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
            groundAlbedo={groundAlbedo}
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
            <fogExp2 attach="fog" args={["#0b1428", 0.001 / worldScale]} />
            {contents}
          </>
        )}
      </Suspense>

      {onSample && <PerfProbe onSample={onSample} />}
      {children}
    </Canvas>
  );
}
