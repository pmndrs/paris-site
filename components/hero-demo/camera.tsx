"use client";

import { useEffect } from "react";
import {
  CameraControls,
  CameraControlsImpl,
  PerspectiveCamera,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber/webgpu";
import * as THREE from "three/webgpu";

/**
 * Ported from `threejs-conf-pmndrs/src/Camera.tsx`.
 *
 * Locked to a horizontal orbit at a fixed polar angle, dollied out to frame the
 * tower, with a very slow automatic rotation. Zoom is disabled on purpose —
 * the framing is the shot.
 */
export function Camera({
  targetRef,
  autoRotate = true,
}: {
  targetRef: React.RefObject<THREE.Group | null>;
  autoRotate?: boolean;
}) {
  const size = useThree((state) => state.size);
  const controls = useThree((state) => state.controls) as CameraControlsImpl;

  useEffect(() => {
    if (!controls || !targetRef.current) return;

    const dist = 60;
    const angle = THREE.MathUtils.degToRad(97);

    controls.fitToBox(targetRef.current, false);
    controls.dollyTo(dist, false);
    controls.polarAngle = angle;
    controls.minPolarAngle = angle;
    controls.maxPolarAngle = angle;

    controls.mouseButtons = {
      left: CameraControlsImpl.ACTION.ROTATE,
      middle: CameraControlsImpl.ACTION.ROTATE,
      right: CameraControlsImpl.ACTION.ROTATE,
      wheel: CameraControlsImpl.ACTION.NONE,
    };

    controls.touches = {
      one: CameraControlsImpl.ACTION.TOUCH_ROTATE,
      two: CameraControlsImpl.ACTION.TOUCH_ROTATE,
      three: CameraControlsImpl.ACTION.TOUCH_ROTATE,
    };
  }, [controls, size, targetRef]);

  useFrame((_, delta) => {
    if (!controls || !autoRotate) return;
    // Deliberately tiny. A temporal pipeline needs *some* camera motion to
    // exercise reprojection; this gives velocity vectors something to carry
    // without turning the shot into a carousel.
    controls.rotate(delta * 0.0001, 0, true);
  });

  return (
    <>
      <CameraControls makeDefault />
      <PerspectiveCamera position={[0, 4, 40]} makeDefault fov={30} />
    </>
  );
}
