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

/** Runtime controls exposed by the vendored SSAO node. */
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

/** Runtime controls exposed by the SSGI node. */
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

/** FSR3 fields used for motion vectors and cleanup. */
interface FSRNodeLike {
  upscaler: { unjitteredProjectionMatrix: THREE.Matrix4 } | null;
  dispose(): void;
}

/** Sky texture used to color the fog. */
interface SkyWithBaker {
  baker?: { texture?: THREE.CubeTexture };
}

/**
 * Full-resolution lettering pass. Glyphs and tower depth share the scene,
 * while the camera mirrors the main camera without temporal jitter.
 */
export interface TextLayer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

/** TSL node shapes used at graph helper boundaries. */
type AnyFloat = ReturnType<typeof TSL.float>;
type AnyVec3 = ReturnType<typeof TSL.vec3>;
type AnyVec4 = ReturnType<typeof TSL.vec4>;

function makeFogCameraUniforms() {
  return {
    invProj: TSL.uniform(new THREE.Matrix4()),
    camWorld: TSL.uniform(new THREE.Matrix4()),
    camPos: TSL.uniform(new THREE.Vector3()),
  };
}

/** Fog uniforms consumed by the render graph. */
type FogKnobs = Record<
  "density" | "heightFalloff" | "horizonClamp",
  THREE.UniformNode<"float", number>
>;

/** Post-processing options for the tower scene render graph. */
export interface FXOptions {
  enabled?: boolean;
  ao?: boolean;
  bloom?: boolean;
  /** Adds sky aerial perspective to the graph. */
  haze?: boolean;
  hazeStrength?: number;
  hazePolicy?: string;
  /** Adds exponential height fog colored by the baked sky cube. */
  skyFog?: boolean;
  /** Fog extinction per kilometer of world units. */
  skyFogDensity?: number;
  /** Altitude falloff scale in world units. */
  skyFogHeight?: number;
  /** Clamps downward sky samples to the illuminated horizon. */
  skyFogHorizonClamp?: boolean;
  /** Uses FSR3 as the temporal resolver. TRAA runs when disabled. */
  fsr?: boolean;
  /** FSR3 upscale ratio (1 = native AA, 1.5 = Quality, 1.7 = Balanced). */
  renderScale?: number;
  /** Uses spatially denoised SSGI for indirect light and ambient occlusion. */
  ssgi?: boolean;
  ssgiIntensity?: number;
  ssgiAoIntensity?: number;
  ssgiSlices?: number;
  ssgiSteps?: number;
  ssgiRadius?: number;
  /** Full-resolution lettering pass. */
  textLayer: TextLayer;
  /** Includes the lettering pass in the graph. */
  textEnabled?: boolean;
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
  textLayer,
  textEnabled = true,
}: FXOptions) {
  // The sky is null when no Sky provider is mounted.
  const sky = useSky();

  const useFsr = fsr;
  const useSsgi = withSSGI;
  // SSGI provides its own ambient occlusion.
  const useGtao = ao && !useSsgi;
  const useSkyFog = skyFog && Boolean(sky);

  /** Tracks the unjittered projection used for FSR3 motion vectors. */
  const fsrNodeRef = useRef<FSRNodeLike | null>(null);
  const velocityBoundRef = useRef(false);

  /** Lettering pass reused across render graph rebuilds. */
  const textPassRef = useRef<ReturnType<typeof TSL.pass> | null>(null);

  // Release GPU resources owned by this effect.
  useEffect(() => {
    return () => {
      fsrNodeRef.current?.dispose();
      fsrNodeRef.current = null;
      textPassRef.current?.dispose();
      textPassRef.current = null;
    };
  }, []);

  /** Active SSGI pass whose tuning values are runtime uniforms. */
  const ssgiPassRef = useRef<SSGIPass | null>(null);

  /** Stable fog uniforms shared with the render graph. */
  const fogKnobs = useUniforms(
    {
      density: skyFogDensity,
      heightFalloff: skyFogHeight,
      // Use a uniform so this toggle does not rebuild the graph.
      horizonClamp: skyFogHorizonClamp ? 1 : 0,
    },
    "heroFog",
  ) as unknown as FogKnobs;

  /** Main camera uniforms for ray reconstruction in the output pass. */
  const fogCamRef = useRef<ReturnType<typeof makeFogCameraUniforms> | null>(
    null,
  );
  if (fogCamRef.current === null) {
    fogCamRef.current = makeFogCameraUniforms();
  }
  const fogCam = fogCamRef.current;
  useUniforms(() => fogCam, "heroFogCamera");

  /** Sky instance and option key used by the active render graph. */
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
    textEnabled,
  ]);

  useEffect(() => {
    if (!sky) return;
    sky.setHazeStrength(hazeStrength);
    sky.setHazePolicy(hazePolicy);
  }, [sky, hazeStrength, hazePolicy]);

  useEffect(() => {
    const pass = ssgiPassRef.current;
    if (!pass) return;
    pass.sliceCount.value = ssgiSlices;
    pass.stepCount.value = ssgiSteps;
    pass.radius.value = ssgiRadius;
    pass.giIntensity.value = ssgiIntensity;
    pass.aoIntensity.value = ssgiAoIntensity;
  }, [ssgiSlices, ssgiSteps, ssgiRadius, ssgiIntensity, ssgiAoIntensity]);

  useFrame(({ camera }) => {
    // Output nodes need explicit main camera uniforms for fog rays.
    if (useSkyFog) {
      fogCam.invProj.value.copy(camera.projectionMatrixInverse);
      fogCam.camWorld.value.copy(camera.matrixWorld);
      fogCam.camPos.value.setFromMatrixPosition(camera.matrixWorld);
    }

    // Keep the full-resolution text camera free of temporal jitter.
    const source = camera as THREE.PerspectiveCamera;
    if (source.isPerspectiveCamera) {
      const textCamera = textLayer.camera;
      source.matrixWorld.decompose(
        textCamera.position,
        textCamera.quaternion,
        textCamera.scale,
      );
      textCamera.fov = source.fov;
      textCamera.aspect = source.aspect;
      textCamera.near = source.near;
      textCamera.far = source.far;
      textCamera.updateProjectionMatrix();
    }

    // Bind the unjittered projection after the FSR3 upscaler initializes.
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
    // Build the effect graph and return its output node.
    ({ renderPipeline, passes, camera }) => {
      if (!renderPipeline || !passes?.scenePass) return;
      const scenePass = passes.scenePass;

      // Dispose FSR3 timer queries before replacing the node.
      fsrNodeRef.current?.dispose();
      fsrNodeRef.current = null;

      // Render glyph color and tower occlusion depth at display resolution.
      if (!textEnabled && textPassRef.current) {
        textPassRef.current.dispose();
        textPassRef.current = null;
      }
      if (textEnabled && !textPassRef.current) {
        textPassRef.current = TSL.pass(textLayer.scene, textLayer.camera);
      }
      const textTex = textPassRef.current?.getTextureNode("output");
      // Reuse authored glyph depth when applying fog to visible text pixels.
      const textDepth = textPassRef.current
        ? TSL.abs(textPassRef.current.getViewZNode())
        : null;

      /** Composites premultiplied text after depth occlusion is resolved. */
      const overlayText = textTex
        ? (baseNode: unknown, textRgbNode: unknown) => {
            const base = baseNode as AnyVec4;
            const covered = textTex.a;
            const rgb = base.rgb
              .mul(TSL.oneMinus(covered))
              .add(textRgbNode as AnyVec3) as unknown as AnyVec3;
            return TSL.vec4(rgb, TSL.max(base.a, covered));
          }
        : null;

      if (!enabled) {
        // Preserve lettering when post processing is disabled.
        const base = scenePass.getTextureNode("output");
        renderPipeline.outputNode =
          overlayText && textTex
            ? TSL.Fn(() => overlayText(base, textTex.rgb))()
            : base;
        // Mark the presentation material dirty after replacing its output node.
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
          graph.rgb.mul(giPass.getAONode().r).add(albedo.rgb.mul(gi.rgb)),
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

      /**
       * Sky-colored exponential height fog (see FXOptions.skyFog), split
       * into two helpers for its two consumers: the scene fog below, which
       * takes distance from the depth buffer, and the text composite at the
       * end, which takes it from the text pass's depth. Ray reconstruction
       * follows the sky's own haze node: hand-built NDC with WebGPU's
       * flipped Y, inverse projection to a view ray, and
       * distance = axial depth / |rayDir.z| so oblique pixels are not
       * underfogged. The fog color is the baked sky cube sampled along the
       * world ray. That cube is already in scene-luminance units, since the
       * background renders it directly, so it needs no scaling.
       */
      const reconstructRay = () => {
        const u = TSL.uv();
        const ndc = TSL.vec2(
          u.x.mul(2.0).sub(1.0),
          TSL.float(1.0).sub(u.y.mul(2.0)),
        );
        const viewFar = fogCam.invProj.mul(TSL.vec4(ndc, 1.0, 1.0));
        const rayDirView = viewFar.xyz.div(viewFar.w);
        const cosFromAxis = TSL.max(TSL.abs(rayDirView.normalize().z), 1e-6);
        const rayDirWorld = TSL.normalize(
          fogCam.camWorld.mul(TSL.vec4(rayDirView, 0.0)).xyz,
        );
        return { cosFromAxis, rayDirWorld };
      };

      const fogAlong = skyCube
        ? (distNode: unknown, rayDirWorldNode: unknown) => {
            const dist = distNode as AnyFloat;
            const rayDirWorld = rayDirWorldNode as AnyVec3;

            // Analytic optical depth through σ(h) = σ₀·e^(−h/H) along the ray:
            //   OD = σ₀ · e^(−camY/H) · dist · (1 − e^(−x)) / x,  x = dist·rayY/H
            // with the x→0 limit handled explicitly (level rays).
            const H = fogKnobs.heightFalloff;
            const sigma = fogKnobs.density.div(1000.0); // per-km to per-world-unit
            const rayY = rayDirWorld.y;
            const x = dist.mul(rayY).div(H);
            const term = TSL.abs(x)
              .lessThan(1e-4)
              .select(
                TSL.float(1.0).sub(x.mul(0.5)),
                TSL.float(1.0).sub(TSL.exp(x.negate())).div(x),
              );
            const od = sigma
              .mul(TSL.exp(fogCam.camPos.y.negate().div(H)))
              .mul(dist)
              .mul(term);
            const fogAmount = TSL.clamp(
              TSL.float(1.0).sub(TSL.exp(od.negate())),
              0.0,
              1.0,
            );

            // The baked cube is black below the horizon, so downward rays
            // must not sample it directly or ground fog fades toward black
            // and reads as no fog. Clamp the color lookup to just above the
            // horizon. Near-ground inscatter is horizon light in real aerial
            // perspective anyway, and the density math above keeps the true
            // ray. Toggleable via the uniform for A/B against the raw sample
            // (see FXOptions.skyFogHorizonClamp).
            const sampleDir = TSL.normalize(
              TSL.vec3(
                rayDirWorld.x,
                TSL.mix(
                  rayDirWorld.y,
                  TSL.max(rayDirWorld.y, 0.02),
                  fogKnobs.horizonClamp,
                ),
                rayDirWorld.z,
              ),
            );
            const skyColor = TSL.cubeTexture(skyCube, sampleDir).rgb;
            return { fogAmount, skyColor };
          }
        : null;

      if (fogAlong) {
        const input = graph;
        graph = TSL.Fn(() => {
          const viewZ = scenePass.getViewZNode();
          const ray = reconstructRay();
          const dist = TSL.abs(viewZ).div(ray.cosFromAxis);
          const fog = fogAlong(dist, ray.rayDirWorld);
          // The sky renders at "infinity" and fogging it double-counts the
          // atmosphere the bake already integrated.
          const isSky = scenePass.getLinearDepthNode().greaterThan(0.999);
          const amount = isSky.select(TSL.float(0.0), fog.fogAmount);
          return TSL.vec4(TSL.mix(input.rgb, fog.skyColor, amount), input.a);
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

      // Full-res text over the resolved frame, the seam the whole text pass
      // exists for. Fog is applied to the type analytically, with the same
      // formula and the same live knobs, using the text pass's per-pixel
      // depth in place of the scene depth buffer. That keeps the poster in
      // the same atmosphere even though it skipped the scene pass. Bloom is
      // part of `resolved`, and letters occlude it like everything else.
      // See the no-glow-through-type note on `overlayText`.
      if (overlayText && textTex) {
        const resolved = graph;
        graph = TSL.Fn(() => {
          let textRgb = textTex.rgb as unknown as AnyVec3;
          if (fogAlong) {
            const ray = reconstructRay();
            const dist = (textDepth as unknown as AnyFloat).div(
              ray.cosFromAxis,
            );
            const fog = fogAlong(dist, ray.rayDirWorld);
            // Premultiplied input, so the inscatter is weighted by
            // coverage before it replaces the letter color.
            textRgb = TSL.mix(
              textRgb,
              fog.skyColor.mul(textTex.a),
              fog.fogAmount,
            ) as unknown as AnyVec3;
          }
          return overlayText(resolved, textRgb);
        })();
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
