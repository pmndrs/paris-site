"use client";

import { useEffect, useState } from "react";

import { SECTIONS, type SectionId } from "./content";

export interface ScrollSpy {
  /** Header is revealed once the hero poster is mostly scrolled past. */
  shown: boolean;
  /** Document scroll progress, 0..1. */
  progress: number;
  active: SectionId | "";
  /** Each section's position along the rail, 0..100. */
  marks: { id: SectionId; pct: number }[];
}

const INITIAL: ScrollSpy = { shown: false, progress: 0, active: "", marks: [] };

export function useScrollSpy(): ScrollSpy {
  const [state, setState] = useState<ScrollSpy>(INITIAL);

  useEffect(() => {
    let queued = false;

    const measure = () => {
      queued = false;

      const doc = document.documentElement;
      const vh = window.innerHeight;
      const y = window.scrollY || doc.scrollTop || 0;
      const total = Math.max(1, doc.scrollHeight - vh);

      // The last section whose top has crossed 40% of the viewport wins.
      let active: SectionId | "" = "";
      const marks = SECTIONS.map(({ id }) => {
        const el = document.getElementById(id);
        const top = el ? el.getBoundingClientRect().top + y : 0;
        if (el && el.getBoundingClientRect().top <= vh * 0.4) active = id;
        return { id, pct: Math.min(100, (top / total) * 100) };
      });

      setState({
        shown: y > Math.max(400, vh) * 0.55,
        progress: Math.min(1, y / total),
        active,
        marks,
      });
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    measure();

    // Sections shift as webfonts land; re-measure once things settle.
    const settle = window.setTimeout(measure, 400);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearTimeout(settle);
    };
  }, []);

  return state;
}
