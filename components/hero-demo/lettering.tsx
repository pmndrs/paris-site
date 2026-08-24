"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Billboard } from "@react-three/drei";
import { createPortal, useFrame, useThree } from "@react-three/fiber/webgpu";
import { Text, TextGroup, useFont } from "@pmndrs/glyph/react";
import { defineTextMaterial } from "@pmndrs/glyph/three";
import { msdf } from "@pmndrs/glyph/three/msdf";
import type { Text as TextObject } from "@pmndrs/glyph/three";
import * as THREE from "three/webgpu";
import {
  cameraFar,
  cameraNear,
  float,
  lights,
  mix,
  positionView,
  smoothstep,
  uniform,
  uv,
  vec3,
  viewZToPerspectiveDepth,
} from "three/tsl";

import type { TextLayer } from "./fx";
import { INTRO_COMPLETE, LETTER_CHAIN_START } from "./intro";

/**
 * Billboarded MSDF letters render in a full-resolution pass. Authored depth
 * bands and the tower depth twin determine the ironwork occlusion per pixel.
 */

const FONT_REQUEST = {
  input: { baked: "/hero-demo/Geist-ExtraBold.font.glb" },
  raster: { technique: msdf },
} as const;

/**
 * Creates a lit MSDF material with authored depth. The alpha test prevents
 * transparent parts of the glyph quad from writing depth.
 */
function createLetterMaterial(
  towerGlow: THREE.PointLight,
  /** The depth written for the visible glyph pixels. */
  depthNode: THREE.Node,
  /** Independent reveal for this letter. */
  revealNode: THREE.Node<"float">,
) {
  return defineTextMaterial((context) => {
    const material = new THREE.MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      depthWrite: true,
      alphaTest: 1 / 255,
    });
    material.positionNode = context.position;
    material.colorNode = context.shader.color;
    material.opacityNode = context.shader.opacity.mul(revealNode);
    material.normalNode = vec3(0, 0, 1);
    material.lightsNode = lights([towerGlow]);
    // Increase the sky response on camera-facing glyphs.
    material.envMapIntensity = 2;
    // A floor, not the glyph's brightness. This was 0.4, which after tone
    // mapping was the entire visible value of a letter — the glyphs were flat
    // emissive plates and no light could read against them. Keep just enough
    // that a letter never drops out of the wordmark, and let the tower do the
    // rest through the point light here and the bloom term in the composite.
    material.emissiveNode = context.shader.color.mul(0.18);
    material.depthNode = depthNode;
    return material;
  });
}

/**
 * Depth offsets in city units from top to bottom. Each UV band blends from
 * one offset to the next so a letter can pass through the tower.
 */
type Layering = {
  z: readonly number[];
  bands?: readonly (readonly [number, number])[];
};

/** Converts authored view-axis offsets into perspective depth. */
function layerDepthNode({ z, bands = [] }: Layering, worldScale: number) {
  const down = uv().y;
  let authored: THREE.Node<"float"> = float(z[0]);
  bands.forEach(([from, to], i) => {
    authored = mix(authored, float(z[i + 1]), smoothstep(from, to, down));
  });
  return viewZToPerspectiveDepth(
    positionView.z.add(authored.mul(worldScale)),
    cameraNear,
    cameraFar,
  );
}

/** How far the pointer may knock a letter off its slot. */
type Knock = {
  /** Horizontal travel, in city units. */
  sway: number;
  /** Vertical travel, in city units. */
  lift: number;
  /** Tilt, in radians. */
  spin: number;
};

/**
 * A depth band is a horizontal seam in glyph UV that decides which pixels sit
 * behind the ironwork, and it was authored against one fixed piece of tower.
 * Sliding a banded letter sideways is free — the seam still crosses the same
 * part of the glyph at the same height. Lifting or tilting it is not: the seam
 * walks off the feature it was cut for. So banded letters keep most of their
 * sway and give up their lift, the P most of all, whose seam is pinned to a
 * mast a fifth of a unit wide.
 */
/** No band: the glyph is wholly in front of or behind the tower. */
const FREE: Knock = { sway: 0.45, lift: 0.34, spin: 0.032 };
/** Banded across the tower's body, where the silhouette is broad. */
const BANDED: Knock = { sway: 0.36, lift: 0.18, spin: 0.018 };
/** Threaded on the spire, where the seam is only as tall as the mast tip. */
const THREADED: Knock = { sway: 0.3, lift: 0.07, spin: 0.008 };

/**
 * Poster layout in city units. Positions share the tower axis plane while
 * layers control occlusion and centers align each glyph by its outline bounds.
 */
const LETTERS: {
  char: string;
  /** Position in city units on the tower axis plane. */
  position: [number, number];
  center: [number, number];
  /** Authored depth against the tower. */
  layer: Layering;
  /** Room this letter has to be knocked around. */
  knock: Knock;
}[] = [
  {
    char: "P",
    position: [-0.3, 23.4],
    center: [0.355, 0.355],
    // Place the upper bowl behind the summit and the lower stem in front.
    layer: { z: [-1.6, 1.6], bands: [[0.36, 0.5]] },
    knock: THREADED,
  },
  {
    char: "M",
    position: [3, 20.2],
    center: [0.4635, 0.355],
    layer: { z: [-2.2] },
    knock: FREE,
  },
  {
    char: "N",
    position: [-2.5, 17.4],
    center: [0.3765, 0.355],
    layer: { z: [3] },
    knock: FREE,
  },
  {
    char: "D",
    position: [2.9, 14.6],
    center: [0.377, 0.355],
    layer: { z: [-4] },
    knock: FREE,
  },
  {
    char: "R",
    position: [-3, 11.8],
    center: [0.3635, 0.355],
    // Place the bowl behind the tower and the leg in front.
    layer: { z: [-6, 4], bands: [[0.42, 0.55]] },
    knock: BANDED,
  },
  {
    char: "S",
    position: [2.6, 9],
    center: [0.3475, 0.355],
    // Place the upper curve in front and the lower bowl behind the tower.
    layer: { z: [5, -6], bands: [[0.55, 0.7]] },
    knock: BANDED,
  },
];

/** Hit radius around a letter's center, as a fraction of the glyph em. */
const KNOCK_REACH = 0.5;
/** Pointer speed, in half-viewport-heights per second, that lands a full knock. */
const FULL_KNOCK_SPEED = 1.8;
/** Knock acceleration, in knock limits per second squared. */
const KNOCK_FORCE = 120;
/** Velocity ceiling, in knock limits per second. */
const KNOCK_SPEED_LIMIT = 13;
/** Share of the knock that shoves the letter along the pointer's travel. */
const SHOVE = 0.72;
/** Share that pushes the letter out of the pointer's way. */
const DODGE = 0.55;
/** Spring back to the authored slot. Underdamped, so the letter rings a little. */
const SWAY_STIFFNESS = 110;
const SWAY_DAMPING = 6.2;
const SPIN_STIFFNESS = 84;
const SPIN_DAMPING = 5.4;
/** Longest step the springs are integrated over. */
const MAX_STEP = 1 / 30;
/** Combined offset and velocity below which a letter is parked at rest. */
const REST = 2e-3;
/** Pointer travel slower than this is a resting hand, not a pass. */
const IDLE_SPEED = 0.02;
/** Smoothing rate for pointer velocity, in inverse seconds. */
const TRAVEL_SMOOTHING = 18;

type Wobble = {
  x: number;
  y: number;
  spin: number;
  vx: number;
  vy: number;
  vSpin: number;
};

function restingWobble(): Wobble {
  return { x: 0, y: 0, spin: 0, vx: 0, vy: 0, vSpin: 0 };
}

type LetterSpring = {
  x: number;
  y: number;
  rotation: number;
  vx: number;
  vy: number;
  vr: number;
};

/** Semi-implicit step of a damped spring, matching the hero's other springs. */
function spring(
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
) {
  const nextVelocity =
    (velocity + (target - value) * stiffness * dt) *
    Math.exp(-damping * dt);
  return [value + nextVelocity * dt, nextVelocity] as const;
}

/**
 * Knocks letters around as the pointer passes over them.
 *
 * The hero canvas is `pointer-events: none` and sits under the copy, so there
 * is nothing to raycast against — the cursor is read off the window and
 * measured against each letter in clip space instead, which also keeps the
 * cost at one projection per letter. Each letter is a spring anchored to its
 * authored slot and the pointer only ever adds velocity, so a parked cursor
 * does nothing and a pass across the stack leaves a wobble trailing behind it.
 */
function usePointerKnock(
  groups: RefObject<(THREE.Group | null)[]>,
  { size, worldScale }: { size: number; worldScale: number },
) {
  const renderer = useThree((state) => state.renderer);

  /** Latest pointer position in NDC, written from the window listener. */
  const cursor = useRef({ tracked: false, x: 0, y: 0 });

  useEffect(() => {
    const canvas = renderer.domElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      cursor.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      cursor.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      cursor.current.tracked = true;
    };

    // Motion preferences can be switched with the page open, so the listener
    // is attached and dropped rather than decided once at mount.
    const sync = () => {
      if (reduced.matches) {
        window.removeEventListener("pointermove", onMove);
        cursor.current.tracked = false;
      } else {
        window.addEventListener("pointermove", onMove, { passive: true });
      }
    };
    sync();
    reduced.addEventListener("change", sync);
    return () => {
      reduced.removeEventListener("change", sync);
      window.removeEventListener("pointermove", onMove);
    };
  }, [renderer]);

  /** Pointer position last frame, in half-height units. */
  const previous = useRef({ tracked: false, x: 0, y: 0 });
  /** Smoothed pointer velocity, in half-heights per second. */
  const travel = useRef({ x: 0, y: 0 });
  const wobbles = useRef<Wobble[]>(LETTERS.map(restingWobble));
  const [scratch] = useState(() => ({
    slot: new THREE.Vector3(),
    eye: new THREE.Vector3(),
  }));

  useFrame(({ camera }, frameDelta) => {
    const wobbleGroups = groups.current;
    const step = Math.min(frameDelta, MAX_STEP);
    const view = camera as THREE.PerspectiveCamera;
    // Clip x spans the width, so scaling it by aspect puts both axes in
    // half-height units and makes a letter's reach a circle rather than an
    // ellipse.
    const aspect = view.aspect || 1;

    // Pointer travel since the last frame. A cursor that has not moved has no
    // velocity, and therefore lands no knock.
    const now = cursor.current;
    const was = previous.current;
    const x = now.x * aspect;
    const y = now.y;
    const decay = 1 - Math.exp(-step * TRAVEL_SMOOTHING);
    if (now.tracked && was.tracked) {
      const dt = Math.max(frameDelta, 1 / 240);
      travel.current.x += ((x - was.x) / dt - travel.current.x) * decay;
      travel.current.y += ((y - was.y) / dt - travel.current.y) * decay;
    } else {
      travel.current.x -= travel.current.x * decay;
      travel.current.y -= travel.current.y * decay;
    }
    was.x = x;
    was.y = y;
    was.tracked = now.tracked;

    const speed = Math.hypot(travel.current.x, travel.current.y);
    const passing = now.tracked && speed > IDLE_SPEED;
    if (passing) view.getWorldPosition(scratch.eye);

    LETTERS.forEach(({ knock }, i) => {
      const group = wobbleGroups[i];
      // The slot group above holds the authored position, so it is the stable
      // target for the hit test — a letter cannot dodge its own knock.
      const slot = group?.parent;
      if (!group || !slot) return;
      const wobble = wobbles.current[i];

      if (passing) {
        slot.getWorldPosition(scratch.slot);
        const depth = scratch.eye.distanceTo(scratch.slot);
        scratch.slot.project(view);
        // Half the viewport in world units at the letter's depth, which turns
        // the glyph's em into a clip-space reach.
        const halfHeight =
          Math.tan((view.fov * THREE.MathUtils.DEG2RAD) / 2) * depth;
        const reach = (size * worldScale * KNOCK_REACH) / halfHeight;
        // Pointer to letter.
        const toLetterX = scratch.slot.x * aspect - x;
        const toLetterY = scratch.slot.y - y;
        const gap = Math.hypot(toLetterX, toLetterY);

        if (gap < reach) {
          const near = 1 - gap / reach;
          const falloff = near * near * (3 - 2 * near);
          const strength = Math.min(speed / FULL_KNOCK_SPEED, 1) * falloff;
          // Shove the letter along the pointer's travel, and out of its way.
          const along = SHOVE / speed;
          const away = DODGE / Math.max(gap, 1e-4);
          const pushX = travel.current.x * along + toLetterX * away;
          const pushY = travel.current.y * along + toLetterY * away;
          const drive = strength * KNOCK_FORCE * step;
          wobble.vx += pushX * knock.sway * drive;
          wobble.vy += pushY * knock.lift * drive;
          // An off-center hit spins the glyph: torque from the contact offset.
          const armX = -toLetterX / reach;
          const armY = -toLetterY / reach;
          wobble.vSpin += (armX * pushY - armY * pushX) * knock.spin * drive;
        }
      }

      const energy =
        Math.abs(wobble.x) +
        Math.abs(wobble.y) +
        Math.abs(wobble.vx) +
        Math.abs(wobble.vy);
      if (energy === 0 && wobble.spin === 0 && wobble.vSpin === 0) return;

      const swayCap = knock.sway * KNOCK_SPEED_LIMIT;
      const liftCap = knock.lift * KNOCK_SPEED_LIMIT;
      const spinCap = knock.spin * KNOCK_SPEED_LIMIT;
      wobble.vx = THREE.MathUtils.clamp(wobble.vx, -swayCap, swayCap);
      wobble.vy = THREE.MathUtils.clamp(wobble.vy, -liftCap, liftCap);
      wobble.vSpin = THREE.MathUtils.clamp(wobble.vSpin, -spinCap, spinCap);

      [wobble.x, wobble.vx] = spring(
        wobble.x,
        wobble.vx,
        0,
        SWAY_STIFFNESS,
        SWAY_DAMPING,
        step,
      );
      [wobble.y, wobble.vy] = spring(
        wobble.y,
        wobble.vy,
        0,
        SWAY_STIFFNESS,
        SWAY_DAMPING,
        step,
      );
      [wobble.spin, wobble.vSpin] = spring(
        wobble.spin,
        wobble.vSpin,
        0,
        SPIN_STIFFNESS,
        SPIN_DAMPING,
        step,
      );

      // The caps are a rail, not the shape of the motion: the force above
      // settles well inside them, and they only catch a cursor that keeps
      // scrubbing one letter.
      wobble.x = THREE.MathUtils.clamp(wobble.x, -knock.sway, knock.sway);
      wobble.y = THREE.MathUtils.clamp(wobble.y, -knock.lift, knock.lift);
      wobble.spin = THREE.MathUtils.clamp(wobble.spin, -knock.spin, knock.spin);

      // Park the letter once the ring falls below a fraction of a pixel, so a
      // settled stack stops dirtying its matrices.
      const settling =
        Math.abs(wobble.x) +
        Math.abs(wobble.y) +
        Math.abs(wobble.vx) +
        Math.abs(wobble.vy) +
        (Math.abs(wobble.spin) + Math.abs(wobble.vSpin)) * 8;
      if (settling < REST) {
        wobble.x = 0;
        wobble.y = 0;
        wobble.spin = 0;
        wobble.vx = 0;
        wobble.vy = 0;
        wobble.vSpin = 0;
      }

      group.position.set(wobble.x, wobble.y, 0);
      group.rotation.z = wobble.spin;
    });
  });
}

/**
 * One link in the PMNDRS chain. Each letter is pulled out of the tower by an
 * underdamped spring, with the next link released a beat later. Opacity stays
 * at zero until release, then position and rotation settle at different rates.
 */
function AnimatedLetter({
  index,
  target,
  clock,
  reveal,
  children,
}: {
  index: number;
  target: [number, number];
  clock: RefObject<number>;
  reveal: { value: number };
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const side = index % 2 === 0 ? -1 : 1;
  // Begin on the tower axis, just below the final slot. The letter is fully
  // sized but transparent, so its first readable motion is outward.
  const initialX = 0;
  const initialY = target[1] - 1.15;
  const initialState = (): LetterSpring => ({
    x: initialX,
    y: initialY,
    rotation: -side * 0.18,
    vx: 0,
    vy: 0,
    vr: 0,
  });
  const state = useRef<LetterSpring>(initialState());
  const settled = useRef(false);
  const previousTime = useRef(clock.current);

  useFrame((_, frameDelta) => {
    const object = group.current;
    if (!object) return;

    // Motion preferences can change while the page is open. When the shared
    // clock rewinds, restore this link so the whole chain can play from zero.
    if (clock.current < previousTime.current) {
      state.current = initialState();
      settled.current = false;
      object.position.set(initialX, initialY, 0);
      object.rotation.z = -side * 0.18;
      reveal.value = 0;
    }
    previousTime.current = clock.current;

    const finish = () => {
      object.position.set(target[0], target[1], 0);
      object.rotation.z = 0;
      reveal.value = 1;
    };

    if (clock.current >= INTRO_COMPLETE) {
      finish();
      settled.current = true;
      return;
    }

    const release = LETTER_CHAIN_START + index * 0.14;
    if (clock.current < release) {
      reveal.value = 0;
      return;
    }
    if (settled.current) return;

    const dt = Math.min(frameDelta, 1 / 30);
    const s = state.current;
    [s.x, s.vx] = spring(s.x, s.vx, target[0], 76, 6.7, dt);
    [s.y, s.vy] = spring(s.y, s.vy, target[1], 88, 7.3, dt);
    [s.rotation, s.vr] = spring(s.rotation, s.vr, 0, 72, 6.8, dt);

    const revealProgress = THREE.MathUtils.clamp(
      (clock.current - release) / 0.26,
      0,
      1,
    );
    reveal.value = revealProgress * revealProgress * (3 - 2 * revealProgress);

    object.position.set(s.x, s.y, 0);
    object.rotation.z = s.rotation;

    const error =
      Math.abs(s.x - target[0]) +
      Math.abs(s.y - target[1]) +
      Math.abs(s.rotation);
    const speed = Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.vr);
    if (error < 0.002 && speed < 0.01) {
      finish();
      settled.current = true;
    }
  });

  const finishedAtMount = clock.current >= INTRO_COMPLETE;

  return (
    <group
      ref={group}
      position={
        finishedAtMount ? [target[0], target[1], 0] : [initialX, initialY, 0]
      }
      rotation-z={finishedAtMount ? 0 : -side * 0.18}
    >
      {children}
    </group>
  );
}

export function Lettering({
  /** Glyph em size in world units. */
  size = 6,
  /** Multiplier for the authored horizontal offsets. */
  spread = 0.8,
  /** Scale shared with the main scene. */
  worldScale = 1,
  /** Full-resolution scene used for lettering and tower depth. */
  textLayer,
  introClock,
  towerLightLevel = 1,
}: {
  size?: number;
  spread?: number;
  worldScale?: number;
  textLayer: TextLayer;
  introClock: RefObject<number>;
  /** Strength of the tower light spilling onto the glyphs. */
  towerLightLevel?: number;
}) {
  const geist = useFont(FONT_REQUEST);

  const style = useMemo(() => ({ fontSize: size, lineHeight: 1 }), [size]);

  /** A tower glow scoped to the lettering material. */
  const [towerGlow] = useState(
    () => new THREE.PointLight("#ffb35c", 500, 0, 2),
  );

  /** Each letter needs a material with its own depth node. */
  const letters = useMemo(
    () =>
      LETTERS.map((letter) => {
        const reveal = uniform(0);
        return {
          letter,
          reveal,
          material: createLetterMaterial(
            towerGlow,
            layerDepthNode(letter.layer, worldScale),
            reveal,
          ),
        };
      }),
    [towerGlow, worldScale],
  );

  /** Baseline offset measured from the committed glyph layout in em units. */
  const [baselineEm, setBaselineEm] = useState<number | null>(null);
  const probeRef = useRef<TextObject<typeof msdf> | null>(null);
  useFrame(() => {
    if (baselineEm !== null) return;
    const probe = probeRef.current;
    // Measure only after the current layout properties have been applied.
    if (!probe || probe.needsApply()) return;
    const measured = probe.measureLayout();
    if (measured) setBaselineEm(measured.firstBaseline / size);
  });

  useFrame((state) => {
    // Mirror scene lighting into the independent text pass.
    textLayer.scene.environment = state.scene.environment;
    textLayer.scene.environmentIntensity = state.scene.environmentIntensity;
    textLayer.scene.environmentRotation.copy(state.scene.environmentRotation);
  });

  const wobbleGroups = useRef<(THREE.Group | null)[]>([]);
  usePointerKnock(wobbleGroups, { size, worldScale });

  // Use one glyph batch per letter so each batch can write its own depth.
  return createPortal(
    <group scale={worldScale}>
      <primitive
        object={towerGlow}
        position={[0, 11, 0]}
        intensity={500 * towerLightLevel}
      />
      <Billboard>
        {letters.map(
          ({ letter: { char, position, center }, material, reveal }, i) => (
            <TextGroup
              key={char}
              compositing="independent"
              material={material}
              visible={baselineEm !== null}
            >
              <AnimatedLetter
                index={i}
                target={[position[0] * spread, position[1]]}
                clock={introClock}
                reveal={reveal}
              >
                {/* Pointer motion is additive to the intro's authored slot. */}
                <group
                  ref={(node) => {
                    wobbleGroups.current[i] = node;
                  }}
                >
                  <Text
                    ref={i === 0 ? probeRef : undefined}
                    font={geist}
                    style={style}
                    paint={{ color: "#ffffff" }}
                    position={[
                      -center[0] * size,
                      (baselineEm ?? 1) * size - center[1] * size,
                      0,
                    ]}
                  >
                    {char}
                  </Text>
                </group>
              </AnimatedLetter>
            </TextGroup>
          ),
        )}
      </Billboard>
    </group>,
    textLayer.scene,
  );
}
