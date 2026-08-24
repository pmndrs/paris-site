"use client";

import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/brand/logo";
import {
  heroGate,
  heroGateCanRevealOverlay,
  heroGateOverlayHasExited,
} from "@/lib/hero-gate";

/** One flip beat — dismissing mid-flip on a warm load reads as a glitch. */
const MIN_SHOW_MS = 800;
/** Backstop: a wedged canvas must never strand the page behind the gate. */
const MAX_WAIT_MS = 15_000;
/** Keep the counter responsive without re-rendering on every animation frame. */
const PROGRESS_TICK_MS = 100;
/** Hold the completed loading screen for one beat before its exit begins. */
const EXIT_BEAT_MS = 300;
/** Transition-end backstop for browsers that drop the event. */
const FADE_FALLBACK_MS = 750;

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
 * The document remains scroll-locked until the overlay has fully exited, so
 * the hero cannot be paused or bypassed halfway through this handshake.
 */
export function LoadingScreen() {
  // A client-side return skips the gate: the module-level machine has already
  // reached playing/settled and the pipelines it waited on remain warm.
  const [gone, setGone] = useState(() =>
    heroGateOverlayHasExited(heroGate.getState()),
  );
  const [progress, setProgress] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const shownAt = performance.now();
    let fadeTimer: number | undefined;
    let exitBeatTimer: number | undefined;
    let fadeFallback: number | undefined;
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
          // Hold at full opacity, then restore the scrollbar at the exact
          // moment the loading screen begins fading.
          exitBeatTimer = window.setTimeout(() => {
            root.dataset.state = "done";
            fadeFallback = window.setTimeout(() => {
              heroGate.overlayExited();
              setGone(true);
            }, FADE_FALLBACK_MS);
          }, EXIT_BEAT_MS);
        },
        Math.max(0, MIN_SHOW_MS - (performance.now() - shownAt)),
      );
    };

    const syncGate = () => {
      const state = heroGate.getState();
      if (heroGateOverlayHasExited(state)) setGone(true);
      else if (heroGateCanRevealOverlay(state)) dismiss();
    };
    const stopWaiting = heroGate.subscribe(syncGate);
    syncGate();

    const backstop = window.setTimeout(() => heroGate.bypass(), MAX_WAIT_MS);

    return () => {
      stopWaiting();
      window.clearTimeout(backstop);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(exitBeatTimer);
      window.clearTimeout(fadeFallback);
      window.clearInterval(progressTimer);
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
        if (
          event.target === event.currentTarget &&
          event.propertyName === "opacity"
        ) {
          // Playback is hard-gated on the overlay reaching zero opacity.
          heroGate.overlayExited();
          setGone(true);
        }
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
