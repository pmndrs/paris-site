"use client";

import { useCallback, useEffect } from "react";
import {
  CameraControls,
  CameraControlsImpl,
  PerspectiveCamera,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber/webgpu";
import { button, useControls } from "leva";
import * as THREE from "three/webgpu";

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

export interface FramingOptions {
  /**
   * Breathing room around the tower, as a fraction of its largest dimension.
   *
   * NOT pixels: `fitToBox` adds padding to the bounding box in **world units**
   * (camera-controls.module.js:1665), so a viewport-relative value here would be
   * a hundred-odd world units of padding on a ~66-unit tower and dolly the
   * camera into the next arrondissement. Scaling off the box keeps it framing-
   * relative, which is what a viewport fraction was reaching for anyway.
   */
  padding?: number;
  autoRotate?: boolean;
  /**
   * Orbit drift, **degrees per second**.
   *
   * The original was `controls.rotate(delta * 0.0001, 0, true)` — about
   * 0.005°/sec, which is invisible, and passing `enableTransition: true` made it
   * worse: each frame damps toward a target a hair away and never arrives, so
   * the drift largely cancels itself. Real units, and no transition, since a
   * continuous drift wants to be applied directly.
   */
  autoRotateSpeed?: number;
  /** Locked orbit elevation, degrees. 90 is level with the horizon. */
  polarDegrees?: number;
  /**
   * Hand the camera over: free orbit, wheel dolly, no polar lock, no auto-fit.
   * Use it to dial framing in by hand — `logFraming` prints values to paste back
   * in as the new defaults.
   */
  unlocked?: boolean;
}

/**
 * Ported from `threejs-conf-pmndrs/src/Camera.tsx`, with the framing fixed.
 *
 * The original called `fitToBox(tower)` and then `dollyTo(60)` on the very next
 * line, which throws the fit away and pins the camera at a constant distance —
 * correct at exactly one window size, cropped or tiny at every other. Since
 * `fov` is vertical, portrait was the worst case.
 *
 * Two things about `fitToBox` that are easy to get wrong, and were:
 *
 * 1. Padding is world units, not pixels (see `padding` above).
 * 2. It **snaps the polar angle to the nearest 90°** internally —
 *    `rotateTo(theta, roundToStep(phi, PI_HALF))`. Setting `min/maxPolarAngle`
 *    to the desired angle *before* fitting makes the two fight: the fit is
 *    computed for a snapped orientation and then clamped back. So the polar
 *    limits are released for the fit and re-applied after, which also means the
 *    fitted distance is measured against a level shot rather than a tilted one.
 */
export function Camera({
  targetRef,
  padding = 0.1,
  autoRotate = true,
  autoRotateSpeed = 2,
  polarDegrees = 93,
  unlocked = false,
}: FramingOptions & {
  targetRef: React.RefObject<THREE.Group | null>;
}) {
  const size = useThree((state) => state.size);
  const controls = useThree((state) => state.controls) as CameraControlsImpl;

  const frame = useCallback(() => {
    const target = targetRef.current;
    if (!controls || !target) return false;

    // The GLTF may not have populated the group yet on the first pass.
    _box.setFromObject(target);
    if (_box.isEmpty()) return false;

    const angle = THREE.MathUtils.degToRad(polarDegrees);
    const pad = padding * _box.getSize(_size).length();

    // Release the polar limits so the fit isn't fighting its own 90° snap.
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;

    controls.fitToBox(_box, false, {
      cover: false,
      paddingTop: pad,
      paddingBottom: pad,
      paddingLeft: pad,
      paddingRight: pad,
    });

    // Now take the elevation we actually want, and lock it there.
    controls.rotateTo(controls.azimuthAngle, angle, false);
    controls.minPolarAngle = angle;
    controls.maxPolarAngle = angle;
    return true;
  }, [controls, targetRef, padding, polarDegrees]);

  useEffect(() => {
    if (!controls) return;

    if (unlocked) {
      // Full manual control. Keep a sliver away from the poles so the orbit
      // doesn't gimbal at straight up / straight down.
      controls.minPolarAngle = 0.01;
      controls.maxPolarAngle = Math.PI - 0.01;
      controls.mouseButtons = {
        left: CameraControlsImpl.ACTION.ROTATE,
        middle: CameraControlsImpl.ACTION.DOLLY,
        right: CameraControlsImpl.ACTION.TRUCK,
        wheel: CameraControlsImpl.ACTION.DOLLY,
      };
      controls.touches = {
        one: CameraControlsImpl.ACTION.TOUCH_ROTATE,
        two: CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK,
        three: CameraControlsImpl.ACTION.TOUCH_TRUCK,
      };
      return;
    }

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

    if (frame()) return;

    // Model wasn't ready — retry until the bounding box exists.
    let raf = 0;
    const retry = () => {
      if (!frame()) raf = requestAnimationFrame(retry);
    };
    raf = requestAnimationFrame(retry);
    return () => cancelAnimationFrame(raf);
    // `size` is not read here, but a resize must re-fit — that is the entire
    // point of the rewrite.
  }, [controls, frame, unlocked, size.width, size.height]);

  useFrame((_, delta) => {
    if (!controls || !autoRotate || unlocked || autoRotateSpeed === 0) return;
    // Applied directly (no transition) — a continuous drift is the target, not
    // something to ease toward. Also gives the temporal passes real motion to
    // reproject against, which a static camera never exercises.
    controls.rotate(
      THREE.MathUtils.degToRad(autoRotateSpeed) * delta,
      0,
      false,
    );
  });

  return (
    <>
      <CameraControls makeDefault />
      <PerspectiveCamera position={[0, 4, 40]} makeDefault fov={30} />
    </>
  );
}

/**
 * Mounts inside the Canvas so it can reach `useThree().controls`, and adds a
 * "log framing" button to the panel. Separate from `<Camera>` so the ported
 * component stays free of Leva.
 */
export function FramingTools() {
  const controls = useThree((state) => state.controls) as CameraControlsImpl;

  useControls("framing", {
    logFraming: button(() => logFraming(controls)),
  });

  return null;
}

/** Print the current framing in a form that can be pasted back as defaults. */
export function logFraming(controls: CameraControlsImpl | null) {
  if (!controls) {
    console.warn("[hero-demo] no camera controls yet");
    return;
  }
  const pos = controls.getPosition(new THREE.Vector3());
  const tgt = controls.getTarget(new THREE.Vector3());
  const round = (v: number) => Math.round(v * 100) / 100;

  console.log(
    `[hero-demo] framing
  position:  [${round(pos.x)}, ${round(pos.y)}, ${round(pos.z)}]
  target:    [${round(tgt.x)}, ${round(tgt.y)}, ${round(tgt.z)}]
  distance:  ${round(controls.distance)}
  polar:     ${round(THREE.MathUtils.radToDeg(controls.polarAngle))}°
  azimuth:   ${round(THREE.MathUtils.radToDeg(controls.azimuthAngle))}°`,
  );
}
