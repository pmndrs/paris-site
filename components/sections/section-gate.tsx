"use client";

import type { ReactNode } from "react";

import { useSectionVisible } from "@/components/site-settings";

/**
 * Drops a section — or anything that only makes sense alongside it — from the
 * tree when that section is switched off.
 *
 * It returns `null` rather than hiding with CSS, and that is the point: these
 * sections own WebGPU canvases, and a `display: none` ancestor leaves them
 * mounted, measured at zero, and still holding a swap chain against the shared
 * renderer. Unmounting is the only version that actually costs nothing.
 *
 * The second job is guarding in-page links. The short version ships most
 * sections off, so an `<a href="#two-days">` can point at something that was
 * never rendered and the click lands on nothing. Wrapping the link in the same
 * gate as its target keeps the two in step: the link exists exactly when the
 * thing it points at does.
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
