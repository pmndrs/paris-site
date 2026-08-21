"use client";

import { useCallback, useSyncExternalStore } from "react";

import { ALL_VISIBLE, DEFAULT_VISIBLE, type ToggleId } from "@/lib/sections";

/**
 * Which sections are showing.
 *
 * A module-level store read through `useSyncExternalStore` rather than a
 * context and a provider, for two reasons. It gives a `getServerSnapshot`,
 * which is the honest way to say "the server cannot see localStorage, so it
 * renders the defaults" — and because the defaults *are* the shipped short
 * version, a visitor with no stored preference never sees a correction. Only
 * someone who has opted extra sections in does, and that is a dev looking at
 * their own dev affordance.
 *
 * It also means nothing has to wrap the tree, and the `storage` event keeps two
 * tabs in step for free.
 */

const STORAGE_KEY = "paris-site:sections";

export type Visible = Record<ToggleId, boolean>;

let snapshot: Visible = DEFAULT_VISIBLE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function same(a: Visible, b: Visible) {
  return (Object.keys(a) as ToggleId[]).every((k) => a[k] === b[k]);
}

function read(): Visible {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    // Merged rather than replaced, so a section added after someone stored
    // their preferences takes its default instead of coming back undefined.
    return { ...DEFAULT_VISIBLE, ...(JSON.parse(raw) as Partial<Visible>) };
  } catch {
    // Malformed JSON, private mode, storage disabled — none of it is worth
    // breaking the page over, and the defaults are already the right answer.
    return DEFAULT_VISIBLE;
  }
}

function onStorage(e: StorageEvent) {
  if (e.key !== STORAGE_KEY) return;
  const next = read();
  if (same(next, snapshot)) return;
  snapshot = next;
  emit();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  // The first subscriber pulls the stored value in. React re-reads the snapshot
  // after subscribing, so a change made here is picked up rather than lost.
  if (!hydrated) {
    hydrated = true;
    const next = read();
    if (!same(next, snapshot)) {
      snapshot = next;
      emit();
    }
  }

  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Stable between changes, which is what `useSyncExternalStore` requires. */
const getSnapshot = () => snapshot;
const getServerSnapshot = () => DEFAULT_VISIBLE;

function write(next: Visible) {
  if (same(next, snapshot)) return;
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Still updated in memory: the switch should work even where it can't persist.
  }
  emit();
}

export function useVisible(): Visible {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Imperative "make sure this section is on" — for `SectionLink`, whose click
 * handler runs outside render. Safe against clobbering stored preferences:
 * any component calling this also subscribes via `useSectionVisible`, and the
 * first subscriber hydrates the snapshot from storage.
 */
export function showSection(id: ToggleId) {
  write({ ...snapshot, [id]: true });
}

export function useSiteSettings() {
  const visible = useVisible();

  const toggle = useCallback(
    (id: ToggleId) => write({ ...snapshot, [id]: !snapshot[id] }),
    [],
  );
  const showAll = useCallback(() => write(ALL_VISIBLE), []);
  const showShort = useCallback(() => write(DEFAULT_VISIBLE), []);

  return { visible, toggle, showAll, showShort };
}

/**
 * A predicate, for callers testing several ids — a hook cannot be called inside
 * a `filter`. Unregistered ids read as visible, so adding a section without
 * registering it shows it rather than silently swallowing it.
 */
export function useVisibleSections(): (id: string) => boolean {
  const visible = useVisible();
  return useCallback(
    (id: string) => visible[id as ToggleId] ?? true,
    [visible],
  );
}

/** Visibility for one section id. */
export function useSectionVisible(id: string): boolean {
  return useVisible()[id as ToggleId] ?? true;
}
