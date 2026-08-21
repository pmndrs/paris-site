"use client";

import { useEffect, useRef } from "react";
import {
  useFrame,
  useRenderPipeline,
  useUniforms,
} from "@react-three/fiber/webgpu";
import { upscale } from "@pmndrs/upscaler";
import { useSky } from "@pmndrs/sky/react";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { denoise } from "three/examples/jsm/tsl/display/DenoiseNode.js";
import { ssgi } from "three/examples/jsm/tsl/display/SSGINode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

import { ssao } from "./ssao-node.js";

/**
 * `ssao-node.js` is vendored JS, and three's TSL types describe `uniform().value`
 * as a callable node rather than the plain number you assign to it — so the
 * documented way to configure the node doesn't typecheck against its own types.
 * Narrow it to the surface we actually touch instead of scattering `any`.
 */
interface SSAOPass {
  radius: { value: number };
  sliceCount: { value: number };
  stepCount: { value: number };
  aoIntensity: { value: number };
  useScreenSpaceSampling: { value: boolean };
  useLinearThickness: { value: boolean };
  useTemporalFiltering: boolean;
  getAONode(): { r: unknown };
}

/** Same story for three's untyped addon SSGINode. */
interface SSGIPass {
  sliceCount: { value: number };
  stepCount: { value: number };
  radius: { value: number };
  giIntensity: { value: number };
  aoIntensity: { value: number };
  useTemporalFiltering: boolean;
  getAONode(): { r: unknown };
  getGINode(): unknown;
}

/** The slice of the FSR3 node we touch imperatively from useFrame. */
interface FSRNodeLike {
  upscaler: { unjitteredProjectionMatrix: THREE.Matrix4 } | null;
}

/** The slice of the `Sky` instance the sky-fog node reads. */
interface SkyWithBaker {
  baker?: { texture?: THREE.CubeTexture };
}

function makeFogUniforms(density: number, heightFalloff: number) {
  return {
    invProj: TSL.uniform(new THREE.Matrix4()),
    camWorld: TSL.uniform(new THREE.Matrix4()),
    camPos: TSL.uniform(new THREE.Vector3()),
    density: TSL.uniform(density),
    heightFalloff: TSL.uniform(heightFalloff),
    // 0/1 switch for the horizon clamp on the cube-color lookup — a
    // uniform, not a graph branch, so the A/B toggle is free (no rebuild).
    horizonClamp: TSL.uniform(1),
  };
}

/**
 * Faraz's post graph, ported from `threejs-conf-pmndrs/src/FX/FX.tsx`.
 *
 * **The important change.** The original built its own `THREE.RenderPipeline`
 * and called `pass(scene, camera)` *twice* — once for an MRT of
 * output/normal/velocity, and again for an MRT of output/emissive/alpha —
 * because it needed emissive on its own attachment. Two passes over the same
 * scene means the entire city, tower and all, was rasterised twice per frame on
 * top of the shadow pass. With 10k blocks and 20k trees that was the single
 * largest cost in the demo.
 *
 * MRT exists precisely so you don't have to do that. There is now one pass with
 * one MRT carrying output + emissive + normal + velocity, and alpha read off
 * `output.a`. Identical inputs, half the geometry work.
 *
 * Structurally this also moves off a hand-rolled pipeline onto v10's
 * `useRenderPipeline`, which owns the scenePass and its sizing (so the manual
 * resize listener is gone too). That matters beyond tidiness: it is the seam
 * where `@pmndrs/sky`'s haze and the FSR3 upscale node compose into the same
 * graph at Stages 1 and 2, instead of three libraries fighting over
 * `outputNode`.
 */
export interface FXOptions {
  enabled?: boolean;
  ao?: boolean;
  bloom?: boolean;
  /** Composite `@pmndrs/sky`'s aerial-perspective haze into this graph. */
  haze?: boolean;
  hazeStrength?: number;
  hazePolicy?: string;
  /**
   * Sky-colored exponential height fog — the cheap stand-in for aerial
   * perspective. Same density math as classic height fog (analytic
   * exponential falloff with distance and altitude), but the inscatter color
   * is the **baked sky cube sampled along the view ray** instead of a
   * constant — so distant geometry fades toward whatever the sky actually
   * looks like behind it (sun-side glow, horizon gradient), not a single
   * hue. Costs one cube sample + a few ALU per pixel and, unlike real haze,
   * needs **no per-frame AP LUT update**: the cube is already re-baked only
   * when the sun/turbidity change. What it can't do vs. AP: per-channel
   * transmittance (distant objects veil but never color-shift through the
   * atmosphere). Density/height are live uniforms; the toggle rebuilds.
   */
  skyFog?: boolean;
  /** Fog extinction per km of world units (world units ≈ metres at worldScale 5). */
  skyFogDensity?: number;
  /** Altitude falloff scale of the fog layer, in world units (~metres). */
  skyFogHeight?: number;
  /**
   * Clamp the cube-color lookup to just above the horizon for downward
   * rays. The baked cube is black below the horizon, so without this,
   * ground fog fades geometry toward black and reads as no fog. Off shows
   * the raw cube sample — useful with `mirrorBelowHorizon`, or for
   * comparing against the upstream haze behavior.
   */
  skyFogHorizonClamp?: boolean;
  /**
   * Stage 2: FSR3 (`@pmndrs/upscaler`) as the **sole** temporal resolver.
   * Replaces TRAA — two temporal resolvers ghost, so they never stack; TRAA
   * runs only when `!fsr`. The scene pass renders at `1/renderScale`
   * resolution and FSR3 reconstructs to display res (jitter on: the pass
   * renders in-graph under the node, so the sub-pixel offsets land on it
   * for free).
   */
  fsr?: boolean;
  /** FSR3 upscale ratio (1 = native AA, 1.5 = Quality, 1.7 = Balanced). */
  renderScale?: number;
  /**
   * Stage 3: three's SSGINode for GI + AO, replacing the vendored GTAO
   * (which becomes redundant — SSGI computes AO as a byproduct). Per the
   * fsr3 repo's GPU-verified examples (06/09): `useTemporalFiltering` stays
   * **off** — its per-frame pattern rotation defeats FSR3's variance clip and
   * ghost-streaks off moving silhouettes — and the GI term goes through
   * `DenoiseNode`, with FSR3 converging the residual noise.
   */
  ssgi?: boolean;
  ssgiIntensity?: number;
  ssgiAoIntensity?: number;
  ssgiSlices?: number;
  ssgiSteps?: number;
  ssgiRadius?: number;
}

export function FX({
  enabled = true,
  ao = true,
  bloom: withBloom = true,
  haze = false,
  hazeStrength = 1,
  hazePolicy = "auto",
  skyFog = false,
  skyFogDensity = 0.3,
  skyFogHeight = 300,
  skyFogHorizonClamp = true,
  fsr = true,
  renderScale = 1.5,
  ssgi: withSSGI = false,
  ssgiIntensity = 10,
  ssgiAoIntensity = 2,
  ssgiSlices = 2,
  ssgiSteps = 8,
  ssgiRadius = 12,
}: FXOptions) {
  // Null outside a `<Sky>` provider, which is exactly the sky-disabled case.
  const sky = useSky();

  const useFsr = fsr;
  const useSsgi = withSSGI;
  // SSGI computes AO as a byproduct, so the standalone GTAO is redundant
  // under it and drops out.
  const useGtao = ao && !useSsgi;
  const useSkyFog = skyFog && Boolean(sky);

  /**
   * Latch for `velocity.setProjectionMatrix(unjitteredProjectionMatrix)`.
   *
   * FSR3 jitters the camera projection before the pipeline renders, but motion
   * vectors must be computed **without** jitter or the sub-pixel offset reads
   * as motion and the resolver smears. The upscaler exposes its unjittered
   * matrix for exactly this; three's `velocity` is a module-level singleton, so
   * this is bound once when the node's internal upscaler exists (it is null
   * until first `setup`), and unbound when FSR turns off so TRAA's velocities
   * go back to matching the actual (unjittered) projection.
   */
  const fsrNodeRef = useRef<FSRNodeLike | null>(null);
  const velocityBoundRef = useRef(false);

  /**
   * The built SSGI pass, held so the Leva sliders write straight into its
   * uniforms — sliceCount/stepCount/radius/intensities are all runtime
   * uniforms in SSGINode (read via `.toConst()`, which is a shader-side
   * `let`, not a bake), so tuning them costs nothing. Only the on/off
   * toggle changes the graph shape and pays a rebuild.
   */
  const ssgiPassRef = useRef<SSGIPass | null>(null);

  /**
   * Sky-fog uniforms, created once and shared across rebuilds.
   *
   * The camera trio exists because TSL's `cameraWorldMatrix` etc. resolve to
   * the camera *rendering the current pass* — in an output-node context
   * that's the present quad's orthographic camera, not the scene camera
   * (the same reason the sky's own haze node takes explicit camera
   * uniforms). Refreshed per frame in `useFrame`. Density/height are plain
   * live knobs.
   */
  const fogUniformsRef = useRef<ReturnType<typeof makeFogUniforms> | null>(
    null,
  );
  if (fogUniformsRef.current === null) {
    fogUniformsRef.current = makeFogUniforms(skyFogDensity, skyFogHeight);
  }
  const fogU = fogUniformsRef.current;

  // Register the fog uniforms in fiber's global uniform store. They're the
  // same node objects the graph below closes over — `useUniforms` adopts
  // existing uniform nodes as-is — so this changes no behavior; it makes them
  // visible to HMR rebuilds, to `useLocalNodes` creators elsewhere, and to
  // the `uniforms` slice the `useRenderPipeline` callbacks receive. Scoped,
  // because the store resolves against the *primary* canvas and the hero
  // shares that store with the section canvases (flip-grid scopes for the
  // same reason).
  useUniforms(() => fogU, "heroFog");

  /**
   * Options the last *completed* pipeline build used, as a comparable key.
   * Null until a build has run to completion.
   *
   * Exists because the post megashader (bloom + GTAO + haze raymarch + TRAA)
   * takes seconds of synchronous main-thread time to compile, and every
   * `rebuild()` now really recompiles it (see the `needsUpdate` note below).
   * The mount-time `rebuild()` this replaced fired unconditionally — and twice
   * under Strict Mode — so a page load paid for the compile three or four
   * times over and froze the tab for minutes. Rebuilding only when the wanted
   * options differ from the built ones makes mount a no-op and still covers
   * the case the mount rebuild existed for: a first build that ran before
   * `sky`/`scenePass` existed and bailed early (key stays null → mismatch).
   */
  /**
   * The `Sky` **instance** the last build's haze node was wired to. The key
   * below only tracks sky *truthiness* — but `<Sky>` tears down and rebuilds
   * its instance whenever a construction-time option changes (preset,
   * quality, cubeSize, enableAerialPerspective, apKmPerSlice), and a haze
   * graph built against the old instance keeps sampling the old baker's
   * disposed AP LUT: haze silently dies until something else forces a
   * rebuild. Tracking identity closes that hole.
   */
  const builtSkyRef = useRef<unknown>(null);
  const builtKeyRef = useRef<string | null>(null);
  const wantedKey = JSON.stringify([
    enabled,
    useGtao,
    withBloom,
    haze && Boolean(sky),
    hazePolicy,
    useSkyFog,
    useFsr,
    useFsr ? renderScale : 1,
    useSsgi,
  ]);

  useEffect(() => {
    if (!sky) return;
    sky.setHazeStrength(hazeStrength);
    sky.setHazePolicy(hazePolicy);
  }, [sky, hazeStrength, hazePolicy]);

  // Live knobs — straight into uniforms, no rebuild.
  useEffect(() => {
    fogU.density.value = skyFogDensity;
    fogU.heightFalloff.value = skyFogHeight;
    fogU.horizonClamp.value = skyFogHorizonClamp ? 1 : 0;
  }, [fogU, skyFogDensity, skyFogHeight, skyFogHorizonClamp]);

  useEffect(() => {
    const pass = ssgiPassRef.current;
    if (!pass) return;
    pass.sliceCount.value = ssgiSlices;
    pass.stepCount.value = ssgiSteps;
    pass.radius.value = ssgiRadius;
    pass.giIntensity.value = ssgiIntensity;
    pass.aoIntensity.value = ssgiAoIntensity;
  }, [ssgiSlices, ssgiSteps, ssgiRadius, ssgiIntensity, ssgiAoIntensity]);

  // Per-frame AP LUT refresh is upstream's job now: the react binding's
  // useFrame calls `sky.updateAerialPerspective()` when `applyHaze` has been
  // wired (`sky._hazeApplied`), which was our flagged fix — driving it here
  // too would just pay the ~half-frame AP cost twice.
  useFrame(({ camera }) => {
    // Sky fog reconstructs rays from the *scene* camera, which output-node
    // TSL can't reach implicitly (see makeFogUniforms).
    if (useSkyFog) {
      fogU.invProj.value.copy(camera.projectionMatrixInverse);
      fogU.camWorld.value.copy(camera.matrixWorld);
      fogU.camPos.value.setFromMatrixPosition(camera.matrixWorld);
    }

    // Bind/unbind the unjittered projection for motion vectors (see the ref's
    // doc comment). `upscaler` is null until the node's first setup, so this
    // polls until it exists — the same latch the fsr3 examples use.
    if (useFsr) {
      const upscaler = fsrNodeRef.current?.upscaler;
      if (!velocityBoundRef.current && upscaler) {
        (
          TSL.velocity as unknown as {
            setProjectionMatrix(m: THREE.Matrix4 | null): void;
          }
        ).setProjectionMatrix(upscaler.unjitteredProjectionMatrix);
        velocityBoundRef.current = true;
      }
    } else if (velocityBoundRef.current) {
      (
        TSL.velocity as unknown as {
          setProjectionMatrix(m: THREE.Matrix4 | null): void;
        }
      ).setProjectionMatrix(null);
      velocityBoundRef.current = false;
    }
  });

  const { rebuild } = useRenderPipeline(
    // Main: build the effect graph and hand back an output node.
    ({ renderPipeline, passes, camera }) => {
      if (!renderPipeline || !passes?.scenePass) return;
      const scenePass = passes.scenePass;

      if (!enabled) {
        renderPipeline.outputNode = scenePass.getTextureNode("output");
        // Upstream bug in `useRenderPipeline`: it assigns `outputNode` without
        // setting `needsUpdate`, and three's RenderPipeline only recompiles its
        // present-quad material when `needsUpdate` is true (three.webgpu.js
        // RenderPipeline._update). `needsUpdate` starts true, so the FIRST graph
        // compiles — and every later rebuild() silently renders the old one.
        renderPipeline.needsUpdate = true;
        builtKeyRef.current = wantedKey;
        builtSkyRef.current = sky;
        return;
      }

      const color = scenePass.getTextureNode("output");
      const depth = scenePass.getTextureNode("depth");

      let graph = color;

      if (withBloom) {
        const emissive = scenePass.getTextureNode("emissive");
        graph = graph.add(bloom(emissive, 0.5, 0.5));
      }

      // Normals are packed into a byte texture, so they come back as colour
      // and have to be unpacked per sample rather than read directly. Both
      // GTAO and SSGI `.sample()` whatever node they're handed, so the same
      // wrapper serves either consumer.
      const sceneNormal =
        useGtao || useSsgi
          ? TSL.sample((uv: unknown) =>
              TSL.unpackRGBToNormal(
                scenePass.getTextureNode("normal").sample(uv),
              ),
            )
          : null;

      if (useSsgi && sceneNormal) {
        // Stage 3. SSGI replaces GTAO: it computes AO as a byproduct, so the
        // composite is `beauty·AO + albedo·GI` (the fsr3 examples' shape),
        // applied over the bloom-composited graph the same way the GTAO
        // multiply was. GI is denoised spatially; temporal filtering stays
        // off (see FXOptions.ssgi). All of it runs at render res — under FSR
        // that's `1/renderScale`, which is where SSGI gets cheap.
        const giPass = ssgi(
          color,
          depth,
          sceneNormal,
          camera as THREE.PerspectiveCamera,
        ) as unknown as SSGIPass;
        giPass.sliceCount.value = ssgiSlices;
        giPass.stepCount.value = ssgiSteps;
        giPass.radius.value = ssgiRadius;
        giPass.giIntensity.value = ssgiIntensity;
        giPass.aoIntensity.value = ssgiAoIntensity;
        giPass.useTemporalFiltering = false;
        ssgiPassRef.current = giPass;

        const gi = denoise(
          giPass.getGINode() as unknown as THREE.Node,
          depth,
          sceneNormal,
          camera as THREE.PerspectiveCamera,
        ) as unknown as { rgb: unknown };
        const albedo = scenePass.getTextureNode("diffuse");
        graph = TSL.vec4(
          graph.rgb
            .mul(giPass.getAONode().r)
            .add(albedo.rgb.mul(gi.rgb)),
          graph.a,
        );
      }

      if (!useSsgi) ssgiPassRef.current = null;

      if (useGtao && sceneNormal) {
        const aoPass = ssao(
          depth,
          sceneNormal,
          camera as THREE.PerspectiveCamera,
          // `alphaNode` must be the *texture node*, not its alpha channel: the
          // node does `alphaNode.sample(uv).a` internally (ssao-node.js:399), so
          // handing it a swizzle throws "sample is not a function". Passing the
          // colour attachment gives it the scene alpha it wants, and is what the
          // original's separate `alpha` MRT attachment was standing in for.
          color,
        ) as unknown as SSAOPass;
        aoPass.radius.value = 4;
        aoPass.sliceCount.value = 2;
        aoPass.stepCount.value = 4;
        aoPass.aoIntensity.value = 2;
        aoPass.useScreenSpaceSampling.value = true;
        aoPass.useTemporalFiltering = true;
        aoPass.useLinearThickness.value = true;

        graph = TSL.vec4(graph.rgb.mul(aoPass.getAONode().r), graph.a);
      }

      if (haze && sky) {
        // Before the temporal resolve, after the scene-space effects: haze is
        // part of the image TRAA/FSR3 should be stabilising, not something
        // painted over an already-resolved frame.
        //
        // Note this is the `useSky()` + `applyHaze` path rather than
        // `<AutoHaze/>`, and deliberately: AutoHaze assigns
        // `renderPipeline.outputNode` itself, which would race this callback for
        // ownership of the same graph. Its own docs call the two mutually
        // exclusive. Stage 2 needs this seam anyway, to slot FSR3 in last.
        graph = sky.applyHaze(graph, { scenePass, policy: hazePolicy });
      }

      const skyCube = useSkyFog
        ? (sky as SkyWithBaker | null)?.baker?.texture
        : undefined;
      if (skyCube) {
        // Sky-colored exponential height fog (see FXOptions.skyFog). Ray
        // reconstruction follows the sky's own haze node: hand-built NDC with
        // WebGPU's flipped Y, inverse projection to a view ray, distance =
        // |viewZ| / |rayDir.z| so oblique pixels aren't underfogged, and the
        // sky masked out by linear depth. The fog color is the baked sky cube
        // sampled along the world ray — the cube is in scene-luminance units
        // already (the background renders it directly), so no scaling.
        const input = graph;
        graph = TSL.Fn(() => {
          const u = TSL.uv();
          const viewZ = scenePass.getViewZNode();
          const ndc = TSL.vec2(
            u.x.mul(2.0).sub(1.0),
            TSL.float(1.0).sub(u.y.mul(2.0)),
          );
          const viewFar = fogU.invProj.mul(TSL.vec4(ndc, 1.0, 1.0));
          const rayDirView = viewFar.xyz.div(viewFar.w);
          const cosFromAxis = TSL.max(
            TSL.abs(rayDirView.normalize().z),
            1e-6,
          );
          const dist = TSL.abs(viewZ).div(cosFromAxis);
          const rayDirWorld = TSL.normalize(
            fogU.camWorld.mul(TSL.vec4(rayDirView, 0.0)).xyz,
          );

          // Analytic optical depth through σ(h) = σ₀·e^(−h/H) along the ray:
          //   OD = σ₀ · e^(−camY/H) · dist · (1 − e^(−x)) / x,  x = dist·rayY/H
          // with the x→0 limit handled explicitly (level rays).
          const H = fogU.heightFalloff;
          const sigma = fogU.density.div(1000.0); // per-km → per-world-unit
          const rayY = rayDirWorld.y;
          const x = dist.mul(rayY).div(H);
          const term = TSL.abs(x)
            .lessThan(1e-4)
            .select(
              TSL.float(1.0).sub(x.mul(0.5)),
              TSL.float(1.0).sub(TSL.exp(x.negate())).div(x),
            );
          const od = sigma
            .mul(TSL.exp(fogU.camPos.y.negate().div(H)))
            .mul(dist)
            .mul(term);
          const isSky = scenePass.getLinearDepthNode().greaterThan(0.999);
          const fogAmount = isSky.select(
            TSL.float(0.0),
            TSL.clamp(TSL.float(1.0).sub(TSL.exp(od.negate())), 0.0, 1.0),
          );

          // The baked cube is black below the horizon (verified by rendering
          // the raw sample: sky upright above, void below — the rays are
          // fine), so downward rays must not sample it directly or ground
          // fog fades toward black and reads as no fog. Clamp the *color*
          // lookup to just above the horizon — near-ground inscatter is
          // horizon light in real aerial perspective anyway. The density
          // math above keeps the true ray. Toggleable via the uniform for
          // A/B against the raw sample (see FXOptions.skyFogHorizonClamp).
          const sampleDir = TSL.normalize(
            TSL.vec3(
              rayDirWorld.x,
              TSL.mix(
                rayDirWorld.y,
                TSL.max(rayDirWorld.y, 0.02),
                fogU.horizonClamp,
              ),
              rayDirWorld.z,
            ),
          );
          const skyColor = TSL.cubeTexture(skyCube, sampleDir).rgb;
          return TSL.vec4(
            TSL.mix(input.rgb, skyColor, fogAmount),
            input.a,
          );
        })();
      }

      if (useFsr) {
        // Stage 2. FSR3 is the sole temporal resolver — TRAA never stacks on
        // top (two temporal resolvers ghost). The composited graph is pinned
        // to the reduced render resolution with an explicit convertToTexture:
        // upscale() would wrap it anyway, but unpinned at *full* res, and the
        // input size is what configures the upscaler, so the pin is the
        // authority.
        //
        // Pinned by **resolution scale**, not fixed pixels. This callback
        // runs once (rebuilds only on option changes), so a fixed-size RTT
        // goes stale the moment the window resizes — the upscaler then
        // reconstructs an old-aspect input into the new display size and the
        // whole frame smears. With autoResize + setResolutionScale the RTT
        // tracks the drawing buffer every frame using the same floor()
        // PassNode applies for setResolutionScale (so the sizes agree), and
        // UpscalerNode.updateBefore re-configures itself whenever its input
        // or the display size changes. Resize heals in one frame, no
        // recompile.
        const pinned = TSL.convertToTexture(graph);
        pinned.setResolutionScale(1 / renderScale);
        const fsrNode = upscale(
          pinned,
          depth,
          scenePass.getTextureNode("velocity"),
          camera,
          { path: "temporal", jitter: true },
        );
        fsrNodeRef.current = fsrNode as unknown as FSRNodeLike;
        velocityBoundRef.current = false;
        graph = fsrNode;
      } else {
        fsrNodeRef.current = null;
        // TRAA is the temporal resolver on the non-FSR path.
        const traaPass = traa(
          graph,
          depth,
          scenePass.getTextureNode("velocity"),
          camera,
        );
        traaPass.useSubpixelCorrection = true;
        graph = traaPass;
      }

      renderPipeline.outputNode = graph;
      // See the `!enabled` branch: without this, only the first-ever graph
      // compiles and every rebuild is a silent no-op.
      renderPipeline.needsUpdate = true;
      builtKeyRef.current = wantedKey;
      builtSkyRef.current = sky;
    },
    // Setup: one MRT, every attachment the graph above needs.
    ({ passes }) => {
      const scenePass = passes?.scenePass;
      if (!scenePass) return;

      // Under FSR the scene renders small and the resolver reconstructs to
      // display res; that reduction is where the whole pipeline gets cheap.
      scenePass.setResolutionScale(useFsr ? 1 / renderScale : 1);

      const needsNormal = useGtao || useSsgi;
      scenePass.setMRT(
        TSL.mrt({
          output: TSL.output,
          ...(withBloom ? { emissive: TSL.emissive } : {}),
          ...(needsNormal
            ? { normal: TSL.packNormalToRGB(TSL.normalView) }
            : {}),
          // Always present: every config ends in a temporal resolver (FSR3
          // or TRAA), and both consume motion vectors.
          velocity: TSL.velocity,
          // SSGI's composite needs unlit albedo (`albedo · GI`).
          ...(useSsgi ? { diffuse: TSL.diffuseColor } : {}),
        }),
      );

      // Byte textures where float precision buys nothing: packed normals and
      // LDR albedo. This halves memory bandwidth but does NOT reduce the
      // maxColorAttachmentBytesPerSample cost — the WebGPU spec charges
      // rgba8unorm attachments 8 bytes/sample, same as rgba16float, so the
      // 5-attachment SSGI MRT costs 40 and relies on the raised
      // `requiredLimits` on the Canvas renderer (scene.tsx).
      if (needsNormal) {
        scenePass.getTexture("normal").type = THREE.UnsignedByteType;
      }
      if (useSsgi) {
        scenePass.getTexture("diffuse").type = THREE.UnsignedByteType;
      }
    },
  );

  /**
   * `useRenderPipeline` runs its callbacks exactly **once**.
   *
   * Its layout effect gates on `callbacksRanRef`, which latches true after the
   * first run (`@react-three/fiber/dist/webgpu/index.mjs:16020`), and only a
   * scene/camera swap clears it. So the graph is frozen at first mount: every
   * option below was inert after that, and if the first run bailed early —
   * before `sky` or `scenePass` existed — `outputNode` stays the raw scene pass
   * and there is no bloom, no AO and no haze, permanently.
   *
   * `rebuild()` clears the latch and re-runs. The callbacks themselves are read
   * from refs that update every render, so the re-run picks up current props.
   *
   * (Each rebuild constructs fresh bloom/ssao/traa nodes and drops the previous
   * ones without disposing — and fiber leaks the replaced scenePass too, filed
   * upstream as react-three-fiber#3854. Acceptable for a lab panel driven by
   * hand; it would need `dispose()` on the old graph before this pattern went
   * anywhere near the real hero.)
   *
   * Guarded by `builtKeyRef` because a rebuild costs a full megashader
   * recompile (seconds of frozen main thread) — see the ref's doc comment.
   * On mount the layout-effect build has already run with current props, so
   * the keys match and this is a no-op; it fires only when an option really
   * changed, or when the initial build bailed before `sky`/`scenePass`
   * existed (key still null).
   */
  useEffect(() => {
    // Both haze and sky fog bind resources owned by a specific Sky instance
    // (the AP LUT and the baked cube respectively), so an instance swap
    // invalidates either graph.
    const skyChanged =
      (haze || skyFog) && Boolean(sky) && builtSkyRef.current !== sky;
    if (builtKeyRef.current !== wantedKey || skyChanged) rebuild();
  }, [rebuild, wantedKey, sky, haze, skyFog]);

  return null;
}
