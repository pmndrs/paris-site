"use client";

import { useEffect } from "react";
import { useFrame, useRenderPipeline } from "@react-three/fiber/webgpu";
import { useSky } from "@pmndrs/sky/react";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
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
  /**
   * Include `velocity` in the MRT and run TRAA on it.
   *
   * Exposed as a toggle because velocity is the attachment most likely to be
   * behind a per-object vertex-stage binding error: it needs previous-frame
   * model matrices in an object-scoped uniform group, which not every object
   * (instanced batches, background/env meshes) necessarily populates. Turning it
   * off is a one-click test that isolates it from the rest of the graph.
   */
  velocity?: boolean;
  ao?: boolean;
  bloom?: boolean;
  /** Composite `@pmndrs/sky`'s aerial-perspective haze into this graph. */
  haze?: boolean;
  hazeStrength?: number;
  hazePolicy?: string;
}

export function FX({
  enabled = true,
  velocity = true,
  ao = true,
  bloom: withBloom = true,
  haze = false,
  hazeStrength = 1,
  hazePolicy = "auto",
}: FXOptions) {
  // Null outside a `<Sky>` provider, which is exactly the sky-disabled case.
  const sky = useSky();

  useEffect(() => {
    if (!sky) return;
    sky.setHazeStrength(hazeStrength);
    sky.setHazePolicy(hazePolicy);
  }, [sky, hazeStrength, hazePolicy]);

  /**
   * The aerial-perspective LUT depends on camera position and orientation, so it
   * has to be re-rendered every frame — and **nothing in the React bindings does
   * it**. `<Sky>`'s own `useFrame` calls `sky.update(camera)`, whose
   * `baker.update()` refreshes the transmittance / multi-scatter / sky-view LUTs
   * but explicitly not AP (SkyAtmosphereBaker.ts:460). `<AutoHaze>` doesn't call
   * it either. The vanilla README does, in its animation loop. So on the React
   * path the haze is computed against a stale LUT and won't track the camera.
   *
   * Driving it here, and flagged as an upstream fix in HERO-DEMO-SPEC.md.
   * `<Sky>` is our parent, so its `useFrame` is registered first and
   * `sky.update(camera)` has already run for this frame.
   */
  useFrame(() => {
    if (sky && haze) sky.updateAerialPerspective();
  });

  useRenderPipeline(
    // Main: build the effect graph and hand back an output node.
    ({ renderPipeline, passes, camera }) => {
      if (!renderPipeline || !passes?.scenePass) return;
      const scenePass = passes.scenePass;

      if (!enabled) {
        renderPipeline.outputNode = scenePass.getTextureNode("output");
        return;
      }

      const color = scenePass.getTextureNode("output");
      const depth = scenePass.getTextureNode("depth");

      let graph = color;

      if (withBloom) {
        const emissive = scenePass.getTextureNode("emissive");
        graph = graph.add(bloom(emissive, 0.5, 0.5));
      }

      if (ao) {
        const normal = scenePass.getTextureNode("normal");

        // Normals are packed into a byte texture, so they come back as colour
        // and have to be unpacked per sample rather than read directly.
        // (`colorToDirection` is the deprecated spelling of `unpackRGBToNormal`.)
        const sceneNormal = TSL.sample((uv: unknown) =>
          TSL.unpackRGBToNormal(normal.sample(uv)),
        );

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

      if (velocity) {
        // TRAA is the temporal resolver for now. Stage 2 replaces it with FSR3 —
        // stacking two temporal resolvers ghosts, so this comes out, it does not
        // get layered. It is also the only consumer of the velocity attachment,
        // which is why the two share one switch.
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
    },
    // Setup: one MRT, every attachment the graph above needs.
    ({ passes }) => {
      const scenePass = passes?.scenePass;
      if (!scenePass) return;

      scenePass.setMRT(
        TSL.mrt({
          output: TSL.output,
          ...(withBloom ? { emissive: TSL.emissive } : {}),
          ...(ao ? { normal: TSL.packNormalToRGB(TSL.normalView) } : {}),
          ...(velocity ? { velocity: TSL.velocity } : {}),
        }),
      );

      // Normals don't need float precision; a byte texture halves the
      // bandwidth on an attachment that is read every SSAO sample. Only exists
      // when AO is on.
      if (ao) {
        scenePass.getTexture("normal").type = THREE.UnsignedByteType;
      }
    },
  );

  return null;
}
