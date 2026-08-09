"use client";

import { folder, useControls } from "leva";
import dynamic from "next/dynamic";
import { useRef } from "react";

import { DemoShell, InfoSection } from "@/components/demos/demo-shell";
import {
  FLIP_GRID_DEFAULTS,
  type FlipGridConfig,
} from "@/components/three/flip-grid/config";
import { useWebGPU } from "@/lib/use-webgpu";

// `@react-three/fiber/webgpu` touches `localStorage` at module scope, so it can
// never appear in the server render graph.
const FlipGridScene = dynamic(
  () => import("./scene").then((m) => m.FlipGridScene),
  { ssr: false },
);

const d = FLIP_GRID_DEFAULTS;

export default function FlipGridDemo() {
  const bounds = useRef<HTMLDivElement>(null);
  const support = useWebGPU();

  // One Leva folder per demo. The panel is a DOM overlay with a global store,
  // so it is entirely indifferent to how many canvases are on the page —
  // namespacing is all it takes to keep demos from colliding.
  const config = useControls("flip grid", {
    grid: folder({
      cols: { value: d.cols, min: 8, max: 120, step: 1 },
      rows: { value: d.rows, min: 6, max: 80, step: 1 },
      fill: { value: d.fill, min: 0.3, max: 1, step: 0.01 },
      thickness: { value: d.thickness, min: 0.01, max: 0.5, step: 0.005 },
    }),
    cursor: folder({
      radius: { value: d.radius, min: 0.5, max: 12, step: 0.1 },
      hold: { value: d.hold, min: 0, max: 10, step: 0.1 },
    }),
    spring: folder({
      stiffness: { value: d.stiffness, min: 5, max: 300, step: 1 },
      damping: { value: d.damping, min: 0.5, max: 60, step: 0.5 },
      massJitter: { value: d.massJitter, min: 0, max: 6, step: 0.05 },
    }),
    faces: folder({
      front: d.front,
      back: d.back,
      edge: d.edge,
      roughness: { value: d.roughness, min: 0, max: 1, step: 0.01 },
    }),
    surface: folder({
      flakeCells: { value: d.flakeCells, min: 1, max: 32, step: 1 },
      flakeStrength: { value: d.flakeStrength, min: 0, max: 2, step: 0.01 },
      flakeRoughness: { value: d.flakeRoughness, min: 0, max: 1, step: 0.01 },
      toneJitter: { value: d.toneJitter, min: 0, max: 1, step: 0.01 },
      roughJitter: { value: d.roughJitter, min: 0, max: 1, step: 0.01 },
      tiltJitter: { value: d.tiltJitter, min: 0, max: 1.5, step: 0.01 },
      curvature: { value: d.curvature, min: 0, max: 2.5, step: 0.01 },
    }),
    environment: folder({
      envPreset: { value: d.envPreset, options: ["outdoor", "studio"] },
      ground: d.ground,
      sky: d.sky,
      keyIntensity: { value: d.keyIntensity, min: 0, max: 120, step: 0.5 },
      kickIntensity: { value: d.kickIntensity, min: 0, max: 60, step: 0.1 },
      fillIntensity: { value: d.fillIntensity, min: 0, max: 10, step: 0.1 },
      envIntensity: { value: d.envIntensity, min: 0, max: 4, step: 0.05 },
    }),
    cursorLight: folder({
      cursorLight: { value: d.cursorLight, min: 0, max: 60, step: 0.5 },
      cursorLightHeight: {
        value: d.cursorLightHeight,
        min: 0.2,
        max: 20,
        step: 0.1,
      },
      cursorLightColor: d.cursorLightColor,
    }),
  });

  // Leva types a select as plain `string`, so the union has to be restored on
  // the way out. Narrowing the one field beats casting the whole object.
  const scene: FlipGridConfig = {
    ...config,
    envPreset: config.envPreset as FlipGridConfig["envPreset"],
  };

  return (
    <DemoShell
      eyebrow="demo · flip grid"
      intro={
        support === "checking"
          ? "Checking for WebGPU…"
          : support === "no"
            ? "This demo needs WebGPU — the simulation is a compute pass over a storage buffer, so there is no WebGL path to fall back to."
            : "Sweep the cursor across the grid. Tiles flip to gold and hold the pose before falling back."
      }
      info={<HowItWorks />}
    >
      <div ref={bounds} className="absolute inset-0">
        {support === "yes" ? (
          <FlipGridScene config={scene} bounds={bounds} />
        ) : null}
      </div>
    </DemoShell>
  );
}

function HowItWorks() {
  return (
    <>
      <InfoSection title="The state lives on the GPU">
        <p>
          Each tile owns three numbers — its flip angle, its angular velocity,
          and a countdown for how long it stays flipped. They live in a WebGPU
          storage buffer as a TSL <code className="text-foreground">struct</code>
          , one per instance, and a compute pass integrates them every frame.
        </p>
        <p>
          The CPU writes five floats per frame no matter how many tiles there
          are: the timestep, and the cursor&rsquo;s position now and last frame.
          Nothing else crosses the boundary.
        </p>
        <p>
          That is the whole reason this needs WebGPU. Without somewhere to keep
          per-instance state, the flip angle has to be derived from cursor
          distance every frame — and then there is nowhere to put a timer, so
          &ldquo;stay flipped for three seconds&rdquo; simply cannot be
          expressed.
        </p>
      </InfoSection>

      <InfoSection title="The cursor is a swept segment, not a point">
        <p>
          This canvas runs at a throttled framerate, so a quick sweep moves the
          pointer several cells between samples. Testing each tile against
          where the cursor <em>is</em> leaves gaps — a dotted trail. Each tile
          instead measures its distance to the segment the cursor travelled
          since the last frame, which fills them in for the cost of one dot
          product.
        </p>
      </InfoSection>

      <InfoSection title="Flipping is a spring, and mass is free">
        <p>
          Tiles don&rsquo;t animate to a pose, they&rsquo;re pulled there. An
          angular spring accelerates each tile toward 0 or π and damps as it
          arrives, so heavier tiles lag into the flip and overshoot on landing.
        </p>
        <p>
          That mass isn&rsquo;t stored anywhere. It&rsquo;s hashed from the
          instance index — deterministic, free, and it needs no initialisation
          pass, which means the zero-filled buffer the GPU hands back is already
          a valid starting state.
        </p>
      </InfoSection>

      <InfoSection title="Why it reads as metal">
        <p>
          Metal is nothing but its reflection: a fully metallic surface has no
          diffuse term, so gold with no environment renders black. There is a
          generated studio here — an HDR equirectangular texture built at
          runtime, no download — and the material samples it properly, with
          fresnel and roughness, rather than faking a gradient.
        </p>
        <p>
          The harder problem is that a flat tile has <em>one</em> normal. It
          samples one direction and comes back one flat colour, whatever the
          material does. Mirror-smooth it goes binary — catch the light or go
          black; rough, every tile averages to the same beige. What makes a
          rounded object read as gold is curvature, so each tile domes slightly
          across its own face and picks up a gradient instead of a value.
        </p>
        <p>
          On top of that: a hash lattice of facets perturbing normal and
          roughness, and a little per-tile variation in lean, tone and polish.
          Detail has to sit at a frequency the tile can resolve — a texture map
          fine enough to matter just mipmaps away at this size.
        </p>
      </InfoSection>

      <InfoSection title="Try it">
        <p>
          Open the controls, top right. <strong>curvature</strong> to 0 is the
          quickest way to see the point — the gold immediately flattens into
          paint. <strong>envPreset</strong> switches the outdoor sky for a
          studio; watch the tonal spread between neighbouring tiles collapse,
          because a hard horizon is what gives each tile something different to
          reflect. <strong>hold</strong> and <strong>damping</strong> change the
          feel of the trail more than anything else.
        </p>
      </InfoSection>
    </>
  );
}
