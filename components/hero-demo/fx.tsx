"use client";

import { useRenderPipeline } from "@react-three/fiber/webgpu";
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
export function FX({ enabled = true }: { enabled?: boolean }) {
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
      const emissive = scenePass.getTextureNode("emissive");
      const depth = scenePass.getTextureNode("depth");
      const velocity = scenePass.getTextureNode("velocity");
      const normal = scenePass.getTextureNode("normal");

      // Normals are packed into a byte texture, so they come back as colour and
      // have to be unpacked per sample rather than read directly.
      const sceneNormal = TSL.sample((uv: unknown) =>
        TSL.colorToDirection(normal.sample(uv)),
      );

      const bloomed = color.add(bloom(emissive, 0.5, 0.5));

      const aoPass = ssao(
        depth,
        sceneNormal,
        camera as THREE.PerspectiveCamera,
        // Alpha off the same pass — this is what the second scene pass existed
        // to provide.
        color.a,
      ) as unknown as SSAOPass;
      aoPass.radius.value = 4;
      aoPass.sliceCount.value = 2;
      aoPass.stepCount.value = 4;
      aoPass.aoIntensity.value = 2;
      aoPass.useScreenSpaceSampling.value = true;
      aoPass.useTemporalFiltering = true;
      aoPass.useLinearThickness.value = true;

      const ao = aoPass.getAONode().r;
      const composite = TSL.vec4(bloomed.rgb.mul(ao), bloomed.a);

      // TRAA is the temporal resolver for now. Stage 2 replaces it with FSR3 —
      // stacking two temporal resolvers ghosts, so this comes out, it does not
      // get layered.
      const traaPass = traa(composite, depth, velocity, camera);
      traaPass.useSubpixelCorrection = true;

      renderPipeline.outputNode = traaPass;
    },
    // Setup: one MRT, every attachment the graph above needs.
    ({ passes }) => {
      const scenePass = passes?.scenePass;
      if (!scenePass) return;

      scenePass.setMRT(
        TSL.mrt({
          output: TSL.output,
          emissive: TSL.emissive,
          normal: TSL.directionToColor(TSL.normalView),
          velocity: TSL.velocity,
        }),
      );

      // Normals don't need float precision; a byte texture halves the
      // bandwidth on an attachment that is read every SSAO sample.
      const normalTexture = scenePass.getTexture("normal");
      normalTexture.type = THREE.UnsignedByteType;
    },
  );

  return null;
}
