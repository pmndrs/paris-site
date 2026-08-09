"use client";

import { Suspense, useRef } from "react";
import { Canvas } from "@react-three/fiber/webgpu";
import { useControls } from "leva";
import * as THREE from "three/webgpu";

import { Buildings } from "./buildings";
import { Camera } from "./camera";
import { FX } from "./fx";
import { Lights } from "./lights";
import { PerfProbe, type PerfSample } from "./perf-probe";
import { Tower } from "./tower";

/**
 * The hero demo's own canvas.
 *
 * Deliberately NOT the site's hero canvas: no `id="main"` primary registration,
 * no `alpha: true` wordmark sandwich, no `DepthAttachmentSync`, no secondaries
 * borrowing the renderer. This is a lab — it gets to be a plain opaque canvas so
 * that when something is slow or wrong, the multi-canvas machinery is not a
 * suspect. Those constraints come back when a stage folds into
 * `components/hero/`.
 */
export function HeroDemoScene({
  onSample,
}: {
  onSample: (s: PerfSample) => void;
}) {
  const towerRef = useRef<THREE.Group>(null);

  const { treeCount, lowRiseCount, highRiseCount, treeShadows, postFx } =
    useControls("scene", {
      highRiseCount: { value: 300, min: 0, max: 1000, step: 10 },
      lowRiseCount: { value: 10000, min: 0, max: 20000, step: 500 },
      treeCount: { value: 20000, min: 0, max: 40000, step: 1000 },
      treeShadows: false,
      postFx: true,
    });

  return (
    <Canvas
      shadows
      renderer={{ antialias: false, powerPreference: "high-performance" }}
      dpr={[1, 2]}
      forceEven
      // The original disabled events entirely; CameraControls needs them.
      camera={{ position: [0, 4, 40], fov: 30, near: 0.1, far: 1000 }}
    >
      <color attach="background" args={["#0b1428"]} />
      <fogExp2 attach="fog" args={["#0b1428", 0.001]} />

      <Suspense>
        <Camera targetRef={towerRef} />

        <Buildings
          count={highRiseCount}
          lowRiseCount={lowRiseCount}
          treeCount={treeCount}
          treeShadows={treeShadows}
        />

        <group ref={towerRef}>
          <Tower />
        </group>

        <Lights />
        <FX enabled={postFx} />
      </Suspense>

      <PerfProbe onSample={onSample} />
    </Canvas>
  );
}
