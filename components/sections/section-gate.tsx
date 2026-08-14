"use client";

import type { ReactNode } from "react";

import { useSectionVisible } from "@/components/site-settings";

/**
 * Drops a section from the tree when it is switched off.
 *
 * It returns `null` rather than hiding with CSS, and that is the point: these
 * sections own WebGPU canvases, and a `display: none` ancestor leaves them
 * mounted, measured at zero, and still holding a swap chain against the shared
 * renderer. Unmounting is the only version that actually costs nothing.
 *
 * Its children are still server-rendered and still cross the wire — React just
 * never mounts them. Fine for a dev switch; worth knowing before reaching for
 * this to trim what the page ships.
 */
export function SectionGate({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return useSectionVisible(id) ? <>{children}</> : null;
}
