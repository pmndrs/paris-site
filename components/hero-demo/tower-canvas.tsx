"use client";

import { Suspense, useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber/webgpu";
import { Sky } from "@pmndrs/sky/react";
import * as THREE from "three/webgpu";

import { Buildings } from "./buildings";
import { Camera, FramingTools } from "./camera";
import { FX, type TextLayer } from "./fx";
import { Lights } from "./lights";
import { Lettering } from "./lettering";
import { PerfProbe, type PerfSample } from "./perf-probe";
import { Terrain } from "./terrain";
import { Tower, type TowerMode } from "./tower";

/** Paris. The whole point of driving the sun from a real solar position. */
export const PARIS_LATITUDE = 48.8566;
/** 2026-06-25, the workshop. Sun arc is seasonal, so the date is not cosmetic. */
export const CONFERENCE_DAY_OF_YEAR = 176;

/**
 * The verified tower scene as one component with plain props.
 *
 * Every default below is the browser-verified boot configuration the lab
 * (`/demos/paris-hero`) settled on — FSR3 on as the sole temporal resolver,
 * SSGI off, sky fog standing in for aerial perspective, dusk at real Paris
 * solar position. Two consumers, two prop sources: the demo page feeds these
 * from Leva so everything stays tunable, and the site hero passes a fixed
 * subset (time of day, motion flags) so the marketing page ships the
 * verified look with no debug surface.
 */
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
  // sky
  skyEnabled?: boolean;
  timeOfDay?: number;
  latitude?: number;
  dayOfYear?: number;
  exposure?: number;
  north?: string;
  sunDisc?: boolean;
  turbidity?: number;
  mirrorBelowHorizon?: boolean;
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
  // host integration
  /** Perf readout callback; the probe only mounts when this is given. */
  onSample?: (s: PerfSample) => void;
  /** Mounts the Leva `logFraming` button — demo page only (it spawns a panel). */
  tools?: boolean;
  /** Canvas id. The site hero passes "main" to register as the primary canvas. */
  canvasId?: string;
  /** Canvas frameloop; the hero switches to "demand" under reduced motion. */
  frameloop?: "always" | "demand" | "never";
  canvasStyle?: CSSProperties;
  /** Rendered when WebGPU is unavailable (the hero's poster plate). */
  fallback?: ReactNode;
  /** Extra in-canvas nodes — the hero mounts DepthAttachmentSync here. */
  children?: ReactNode;
}

export function TowerCanvas({
  highRiseCount = 300,
  lowRiseCount = 10000,
  treeCount = 20000,
  treeShadows = false,
  river = true,
  park = true,
  haussmann = true,
  towerMode = "glow",
  beacon = false,
  lettering = true,
  letterSize = 6,
  letterSpread = 0.8,
  skyEnabled = true,
  timeOfDay = 20.5,
  latitude = PARIS_LATITUDE,
  dayOfYear = CONFERENCE_DAY_OF_YEAR,
  exposure = 40,
  north = "+Z",
  sunDisc = true,
  turbidity = 1,
  mirrorBelowHorizon = false,
  preset = "earth",
  quality = "medium",
  cubeSize = 256,
  haze = false,
  hazeStrength = 1,
  hazePolicy = "auto",
  apKmPerSlice = 8,
  skyFog = true,
  fogDensity = 0.3,
  fogHeight = 300,
  fogHorizonClamp = true,
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
  onSample,
  tools = false,
  canvasId,
  frameloop,
  canvasStyle,
  fallback,
  children,
}: TowerCanvasProps) {
  const towerRef = useRef<THREE.Group>(null);

  // Bumped when the tower's GLTF has committed, which is the moment its
  // bounding box becomes measurable and the camera can frame it.
  const [refitKey, setRefitKey] = useState(0);
  const onTowerReady = useCallback(() => setRefitKey((v) => v + 1), []);

  /**
   * The lettering's full-resolution layer (see `TextLayer` in fx.tsx):
   * `Lettering` portals the letters into `scene`; `FX` renders the scene as
   * its own display-res pass after the resolver and composites it — sharp
   * glyphs over a 1/renderScale world, with the ironwork interleave
   * restored per pixel from the pass's own depth texture.
   */
  const [textLayer] = useState<TextLayer>(() => ({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
  }));

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
          />
        )}

        {/* The group stays mounted even when the tower is hidden — it is the
            camera's fit target, and an empty box just means the fit is skipped
            until `onReady` fires. */}
        <group ref={towerRef}>
          {tower && (
            <Tower onReady={onTowerReady} mode={towerMode} beacon={beacon} />
          )}
        </group>

      </group>

      {/* Outside the worldScale group on purpose: the component portals its
          content into the text layer's own scene (where it wraps itself in
          the same scale), so its mount point here is only a hook site. */}
      {lettering && (
        <Lettering
          size={letterSize}
          spread={letterSpread}
          worldScale={worldScale}
          textLayer={textLayer}
        />
      )}

      <Lights
        environment={environment && !skyEnabled}
        shadowRadius={60 * worldScale}
        sunlight={!skyEnabled}
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
        // The hero interleave needs the canvas transparent until the sky's
        // opaque background takes over; costs nothing on the demo page.
        alpha: true,
        // WebGPU's maxColorAttachmentBytesPerSample default is 32, and the
        // spec's per-sample cost table charges rgba8unorm attachments 8 bytes
        // (same as rgba16float — byte textures save bandwidth, NOT this
        // budget). The 5-attachment SSGI MRT (output + emissive + normal +
        // velocity + diffuse) therefore costs 5×8 = 40 and needs the limit
        // raised. This Mac's adapter reports 128; 64 is widely supported on
        // desktop. A production build should query the adapter and degrade
        // (drop `diffuse`, composite GI without albedo) instead of failing
        // device creation on weaker hardware.
        requiredLimits: { maxColorAttachmentBytesPerSample: 64 },
      }}
      dpr={[1, 2]}
      forceEven
      style={canvasStyle}
      fallback={fallback}
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
