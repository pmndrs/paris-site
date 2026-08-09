"use client";

import { Canvas } from "@react-three/fiber/webgpu";
import type { RefObject } from "react";

import { DepthAttachmentSync } from "@/components/three/depth-attachment-sync";
import { FlipGrid } from "@/components/three/flip-grid/flip-grid";
import type { FlipGridConfig } from "@/components/three/flip-grid/config";

/**
 * The demo's own canvas.
 *
 * On the site this scene will mount inside a `SectionCanvas`, which refuses to
 * come up until the hero has registered as the primary and then borrows its
 * renderer. There is no hero here, so the demo declares a plain independent
 * canvas instead — same scene, its own renderer.
 */
export function FlipGridScene({
  config,
  bounds,
}: {
  config: FlipGridConfig;
  bounds: RefObject<HTMLElement | null>;
}) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], zoom: 1 }}
      dpr={[1, 2]}
      // Odd/fractional drawing buffers desync the depth attachment from the
      // swap chain — see DepthAttachmentSync.
      forceEven
      renderer={{ alpha: true, antialias: true }}
      style={{ pointerEvents: "none" }}
    >
      <DepthAttachmentSync />
      {/* Remounting on a resolution change is deliberate: the storage buffer is
          sized to cols × rows, and tearing it down is far simpler to reason
          about than resizing it in place. */}
      <FlipGrid
        key={`${config.cols}x${config.rows}`}
        config={config}
        bounds={bounds}
      />
    </Canvas>
  );
}
