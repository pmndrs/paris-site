/**
 * Coarse device tier for render quality, decided once per page load.
 *
 * "Mobile" here means a touch-first device with no hover — phones and
 * tablets — where battery and thermals argue for rendering fewer pixels.
 * The hero runs well on iOS as-is; consumers of this flag trade only
 * near-imperceptible resolution (see tower-hero), not scene content.
 *
 * The answer is cached rather than reactive on purpose: the knobs derived
 * from it feed canvas creation, and flipping them mid-session forces the
 * exact pipeline rebuilds the loading screen exists to hide. Attaching a
 * mouse to an iPad mid-visit keeps the profile it loaded with.
 */

let cached: boolean | null = null;

export function isMobileDevice(): boolean {
  // Server rendering never reaches a canvas; the answer only has to be
  // consistent, and every consumer sits behind a `ssr: false` boundary.
  if (typeof window === "undefined") return false;
  cached ??= window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  return cached;
}
