/**
 * Shared state machine for the two client islands involved in first paint:
 * the DOM loading overlay and the WebGPU hero.
 *
 * Normal path:
 * warming -> priming-intro -> revealing-intro -> armed -> playing -> settled
 *
 * The bypass path (scroll, timeout, reduced motion, or no WebGPU) always
 * resolves to the final pose. It never rewinds an already-visible scene.
 */
export type HeroGateState =
  | "warming"
  | "priming-intro"
  | "priming-final"
  | "revealing-intro"
  | "revealing-final"
  | "armed"
  | "playing"
  | "settled";

export type HeroGateEvent =
  | { type: "WARMUP_FINISHED"; replayIntro: boolean }
  | { type: "POSE_RENDERED" }
  | { type: "OVERLAY_EXITED" }
  | { type: "BEAT_ELAPSED" }
  | { type: "INTRO_FINISHED" }
  | { type: "BYPASS" };

/** Pure transition function, kept separate from notification side effects. */
export function transitionHeroGate(
  state: HeroGateState,
  event: HeroGateEvent,
): HeroGateState {
  switch (event.type) {
    case "WARMUP_FINISHED":
      if (state !== "warming") return state;
      return event.replayIntro ? "priming-intro" : "revealing-final";

    case "POSE_RENDERED":
      if (state === "priming-intro") return "revealing-intro";
      if (state === "priming-final") return "revealing-final";
      return state;

    case "OVERLAY_EXITED":
      if (state === "revealing-intro") return "armed";
      if (state === "revealing-final") return "settled";
      return state;

    case "BEAT_ELAPSED":
      return state === "armed" ? "playing" : state;

    case "INTRO_FINISHED":
      return state === "playing" ? "settled" : state;

    case "BYPASS":
      // During warmup the scene is already held at its final rehearsal pose.
      if (state === "warming") return "revealing-final";
      // If the start pose is being primed, render final once before revealing.
      if (state === "priming-intro") return "priming-final";
      // Once the overlay is fading, a bypass may show the final pose but must
      // never restart or rewind the lettering.
      if (state === "revealing-intro") return "revealing-final";
      if (state === "armed" || state === "playing") return "settled";
      return state;
  }
}

export function heroGateCanRevealOverlay(state: HeroGateState) {
  return state === "revealing-intro" || state === "revealing-final";
}

export function heroGateOverlayHasExited(state: HeroGateState) {
  return state === "armed" || state === "playing" || state === "settled";
}

type Listener = (state: HeroGateState) => void;

export interface HeroGateController {
  getState: () => HeroGateState;
  subscribe: (listener: Listener) => () => void;
  warmupFinished: (replayIntro: boolean) => void;
  poseRendered: () => void;
  overlayExited: () => void;
  beatElapsed: () => void;
  introFinished: () => void;
  bypass: () => void;
}

let state: HeroGateState = "warming";
const listeners = new Set<Listener>();

function send(event: HeroGateEvent) {
  const next = transitionHeroGate(state, event);
  if (next === state) return;

  state = next;
  for (const listener of listeners) listener(state);
}

export const heroGate: HeroGateController = {
  getState: () => state,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  warmupFinished: (replayIntro) =>
    send({ type: "WARMUP_FINISHED", replayIntro }),
  poseRendered: () => send({ type: "POSE_RENDERED" }),
  overlayExited: () => send({ type: "OVERLAY_EXITED" }),
  beatElapsed: () => send({ type: "BEAT_ELAPSED" }),
  introFinished: () => send({ type: "INTRO_FINISHED" }),
  bypass: () => send({ type: "BYPASS" }),
};
