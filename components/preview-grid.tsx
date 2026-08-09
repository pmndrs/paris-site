"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Development harness: frames the live site at fixed sizes so responsive
 * behaviour can be eyeballed side by side.
 *
 * Iframes mount lazily. Each one is a full app instance with its own WebGL
 * context, and browsers cap those (~16) — mounting nine at once would blow the
 * budget and start killing contexts.
 */

const SCROLL_FRAMES = [
  {
    n: "01",
    label: "Poster",
    target: null,
    note: "Hero fills the viewport, header hidden",
  },
  {
    n: "02",
    label: "Header + overview",
    target: "overview",
    note: "Band and marker rail appear past the hero",
  },
  {
    n: "03",
    label: "Outcomes",
    target: "outcomes",
    note: "Cards stack to one column",
  },
  {
    n: "04",
    label: "Two days",
    target: "two-days",
    note: "Half-day blocks, stacked",
  },
  {
    n: "05",
    label: "FAQ + close",
    target: "faq",
    note: "Accordion and final CTA",
  },
] as const;

const BREAKPOINTS = [
  {
    label: "Mobile",
    width: 390,
    height: 844,
    note: "sm and below · one column",
  },
  { label: "Tablet", width: 768, height: 900, note: "md · two-up grids" },
  {
    label: "Desktop",
    width: 1280,
    height: 900,
    note: "lg · full layout, nav fits",
  },
] as const;

function useNearViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setNear(true),
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  return { ref, near };
}

function Frame({
  width,
  height,
  target,
  scale = 1,
  rounded = true,
}: {
  width: number;
  height: number;
  target?: string | null;
  scale?: number;
  rounded?: boolean;
}) {
  const { ref, near } = useNearViewport<HTMLDivElement>();
  const [blocked, setBlocked] = useState(false);

  const place = (iframe: HTMLIFrameElement) => {
    try {
      const doc = iframe.contentDocument;
      if (!doc) throw new Error("no document");

      // Hide the desktop scrollbar inside the frame — it reads as a rendering
      // artefact on a phone. Injected into the frame only.
      if (!doc.getElementById("preview-scrollbar-reset")) {
        const style = doc.createElement("style");
        style.id = "preview-scrollbar-reset";
        style.textContent =
          "html{scrollbar-width:none;-ms-overflow-style:none}html::-webkit-scrollbar{display:none}";
        doc.head.appendChild(style);
      }

      const el = target ? doc.getElementById(target) : null;
      const top = el
        ? el.getBoundingClientRect().top + (iframe.contentWindow?.scrollY ?? 0)
        : 0;
      iframe.contentWindow?.scrollTo({ top, behavior: "instant" });
    } catch {
      setBlocked(true);
    }
  };

  return (
    <div
      ref={ref}
      style={{
        width: width * scale,
        height: height * scale,
      }}
    >
      <div
        className={`overflow-hidden border border-input bg-black shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] ${
          rounded ? "rounded-[36px]" : "rounded-xl"
        }`}
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {near ? (
          <iframe
            src="/"
            title={`Preview at ${width}×${height}`}
            width={width}
            height={height}
            className="block border-0"
            onLoad={(e) => {
              const iframe = e.currentTarget;
              // Let the app settle (fonts, hero measurement) before reading offsets.
              window.setTimeout(() => place(iframe), 450);
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[11px] text-ghost">
            scroll to load
          </div>
        )}
        {blocked ? (
          <div className="p-4 font-mono text-[11px] text-amber-300">
            Could not reach into the frame to scroll it.
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PreviewGrid() {
  return (
    <div className="flex flex-col gap-14 px-5 py-14 lg:px-14">
      <header className="flex flex-wrap items-baseline gap-4">
        <div className="font-mono text-[13px] font-medium tracking-[0.08em] text-dim uppercase">
          Preview
        </div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          The live site, framed
        </h1>
        <p className="text-sm text-muted-foreground">
          Real instances of the app — they scroll, tap, and run the 3D hero.
        </p>
      </header>

      <section className="flex flex-col gap-5">
        <h2 className="font-mono text-[11px] font-medium tracking-[0.11em] text-dim uppercase">
          Scroll positions · 390 × 844
        </h2>
        <div className="flex flex-wrap items-start gap-11">
          {SCROLL_FRAMES.map((f) => (
            <div key={f.n} className="flex w-[390px] flex-col gap-3.5">
              <div className="flex items-center gap-2.5">
                <span className="rounded bg-foreground px-1.5 py-0.5 font-mono text-[11px] font-medium text-background">
                  {f.n}
                </span>
                <span className="text-sm font-medium">{f.label}</span>
              </div>
              <Frame width={390} height={844} target={f.target} />
              <div className="font-mono text-xs text-faint">{f.note}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="font-mono text-[11px] font-medium tracking-[0.11em] text-dim uppercase">
          Breakpoints · scaled to fit
        </h2>
        <div className="flex flex-wrap items-start gap-11">
          {BREAKPOINTS.map((b) => {
            const scale = b.width > 800 ? 0.42 : b.width > 500 ? 0.62 : 0.82;
            return (
              <div key={b.label} className="flex flex-col gap-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-medium">{b.label}</span>
                  <span className="font-mono text-xs text-faint">
                    {b.width} × {b.height}
                  </span>
                </div>
                <Frame
                  width={b.width}
                  height={b.height}
                  scale={scale}
                  rounded={false}
                />
                <div className="font-mono text-xs text-faint">{b.note}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
