// Client-side latch connecting the hero canvas to the loading screen.
// `app/page.tsx` is a server component, so the two client islands cannot
// share state through props; this module is the whole bridge.

let ready = false;
const listeners = new Set<() => void>();

/** True once the hero has rendered — or declared it never will. */
export function heroIsReady() {
  return ready;
}

/** Latches ready and notifies. Safe to call from any path, repeatedly. */
export function markHeroReady() {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
  listeners.clear();
}

/** Calls back on ready — immediately if it already happened. */
export function onHeroReady(listener: () => void) {
  if (ready) {
    listener();
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
