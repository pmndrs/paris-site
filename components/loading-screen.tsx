"use client";

import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { heroIsReady, onHeroReady } from "@/lib/hero-ready";

/** One flip beat — dismissing mid-flip on a warm load reads as a glitch. */
const MIN_SHOW_MS = 800;
/** Backstop: a wedged canvas must never strand the page behind the gate. */
const MAX_WAIT_MS = 15_000;
/** Keep the counter responsive without re-rendering on every animation frame. */
const PROGRESS_TICK_MS = 100;

/**
 * First-load gate over the whole page.
 *
 * Server-rendered visible — the `globals.css` rules only display it when
 * scripting is enabled — so it is in place before hydration and nothing
 * flashes. It stays up until the hero canvas reports it is warmed up:
 * assets fetched, WebGPU pipelines compiled against a hidden rehearsal of
 * the scene's final pose, and frame pacing settled — the cold-load jank
 * spent behind the gate. Then it fades out, unmounts, and the entrance
 * plays from the top.
 *
 * Scrolling dismisses it early: like the hero's own UI cue, a scroll is an
 * explicit signal to move on — and it covers restored scroll positions,
 * where the hero render job is paused off-screen and the ready cue would
 * never come.
 */
export function LoadingScreen() {
  // A client-side return to the page skips the gate entirely: the ready
  // latch is module-level and the pipelines it waited on stay warm.
  const [gone, setGone] = useState(() => heroIsReady());
  const [progress, setProgress] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const shownAt = performance.now();
    let fadeTimer: number | undefined;
    const progressTimer = window.setInterval(() => {
      const elapsed = performance.now() - shownAt;
      setProgress(Math.min(99, Math.floor((elapsed / MAX_WAIT_MS) * 100)));
    }, PROGRESS_TICK_MS);

    const dismiss = () => {
      if (fadeTimer !== undefined) return;
      window.clearInterval(progressTimer);
      setProgress(100);
      fadeTimer = window.setTimeout(
        () => {
          root.dataset.state = "done";
        },
        Math.max(0, MIN_SHOW_MS - (performance.now() - shownAt)),
      );
    };

    const stopWaiting = onHeroReady(dismiss);
    const backstop = window.setTimeout(dismiss, MAX_WAIT_MS);
    window.addEventListener("scroll", dismiss, { passive: true });
    if (window.scrollY > 0) dismiss();

    return () => {
      stopWaiting();
      window.clearTimeout(backstop);
      window.clearTimeout(fadeTimer);
      window.clearInterval(progressTimer);
      window.removeEventListener("scroll", dismiss);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      ref={rootRef}
      data-loading-screen
      data-state="loading"
      role="progressbar"
      aria-label="Loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      onTransitionEnd={(event) => {
        // Invisible once its own opacity transition lands; removing it from
        // the tree afterwards is just cleanup.
        if (event.target === event.currentTarget) setGone(true);
      }}
    >
      <div className="flex flex-col items-center gap-7 text-foreground">
        <div className="loading-logo-stage">
          <Logo color="currentColor" className="loading-logo size-12" />
        </div>
        <div className="eyebrow min-w-[4ch] select-none text-center tabular-nums">
          {progress}%
        </div>
      </div>
    </div>
  );
}
