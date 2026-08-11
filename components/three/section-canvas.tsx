"use client";

import { Canvas, waitForPrimary } from "@react-three/fiber/webgpu";
import { useEffect, useState, type ReactNode } from "react";

import { DepthAttachmentSync } from "./depth-attachment-sync";

import { useWebGPU } from "@/lib/use-webgpu";

/**
 * A secondary canvas (SPEC.md §4).
 *
 * v10 lets every canvas share one `WebGPURenderer`: the hero declares
 * `id="main"` and owns it, everything below points at it with
 * `renderer={{ primaryCanvas: "main" }}`. So a canvas per section costs a swap
 * chain, not a GPU context — which is why the old shared-canvas-plus-`View`
 * design is gone.
 *
 * Two gates before anything mounts:
 *  - WebGPU is available at all (else the caller shows a poster);
 *  - the primary has registered, since a secondary with no renderer to borrow
 *    is an error rather than a fallback.
 */

const PRIMARY = "main";

function usePrimaryReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    waitForPrimary(PRIMARY, 15_000)
      .then(() => {
        if (alive) setReady(true);
      })
      // Timed out — the hero never came up, so there's no renderer to share.
      // Staying unmounted leaves the poster in place, which is the right answer.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return ready;
}

export function SectionCanvas({
  children,
  /** Section canvases are decoration; they don't need the primary's framerate. */
  fps = 30,
  className,
  camera,
  orthographic,
  interactive = false,
}: {
  children: ReactNode;
  fps?: number;
  className?: string;
  camera?: Record<string, unknown>;
  orthographic?: boolean;
  /** Opt in to pointer events. Only for canvases the visitor is meant to grab. */
  interactive?: boolean;
}) {
  const support = useWebGPU();
  const ready = usePrimaryReady();

  if (support !== "yes" || !ready) return null;

  return (
    <Canvas
      className={className}
      orthographic={orthographic}
      camera={camera}
      dpr={[1, 1.75]}
      // Sections are laid out on a fractional grid, so a bare
      // getBoundingClientRect flaps between e.g. 148.4 and 148.6 as the page
      // scrolls — each flip resizes the swap chain and desyncs the depth
      // attachment. Snapping to even integers makes the measured size stable,
      // and since these canvases are pointer-events: none, re-measuring on
      // scroll buys us nothing to begin with.
      forceEven
      // Interactive canvases keep it: R3F maps pointer coordinates through
      // size.top/left, which goes stale the moment the page scrolls.
      resize={interactive ? undefined : { scroll: false }}
      renderer={{
        alpha: true,
        antialias: true,
        primaryCanvas: PRIMARY,
        // Draw after the hero each frame, at half its rate. These are
        // backdrops; nobody is looking for 60fps in them.
        scheduler: { after: PRIMARY, fps },
      }}
      // Backgrounds must never eat clicks or text selection. Where a scene
      // needs the cursor it reads it from the window instead. Interactive
      // canvases also claim the drag, so the page doesn't scroll under them.
      style={
        interactive
          ? { touchAction: "none", cursor: "grab" }
          : { pointerEvents: "none" }
      }
    >
      <DepthAttachmentSync />
      {children}
    </Canvas>
  );
}
