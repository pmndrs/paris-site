"use client";

import type { ComponentProps } from "react";

import { showSection, useSectionVisible } from "@/components/site-settings";
import type { ToggleId } from "@/lib/sections";

/**
 * An in-page section link that survives the short version.
 *
 * The page ships with most sections toggled off (`SHORT_VERSION`), so a plain
 * `<a href="#two-days">` can point at a section that isn't rendered — the
 * click lands on nothing. This link checks the target's visibility: when the
 * section is already on the page it behaves exactly like the anchor it is
 * (the global `scroll-behavior: smooth` handles the ride, with its
 * reduced-motion override); when it isn't, it switches the section on, waits
 * for it to mount, and then hash-navigates — which scrolls under the same CSS
 * rules.
 *
 * Works as a `Button asChild` child: incoming props (className, etc.) are
 * spread onto the anchor.
 */
export function SectionLink({
  section,
  ...props
}: { section: ToggleId } & Omit<ComponentProps<"a">, "href">) {
  const visible = useSectionVisible(section);

  return (
    <a
      href={`#${section}`}
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (visible || e.defaultPrevented) return;

        e.preventDefault();
        showSection(section);

        // The write above mounts the section; navigate once its element
        // exists. Bounded poll rather than one rAF — the section may pull a
        // lazy scene in with it.
        const t0 = performance.now();
        const seek = () => {
          const el = document.getElementById(section);
          if (el) {
            if (window.location.hash === `#${section}`) {
              // Same-hash assignment doesn't re-scroll; go direct. No
              // behavior option, so the CSS scroll-behavior still decides.
              el.scrollIntoView();
            } else {
              window.location.hash = section;
            }
          } else if (performance.now() - t0 < 2000) {
            requestAnimationFrame(seek);
          }
        };
        requestAnimationFrame(seek);
      }}
    />
  );
}
