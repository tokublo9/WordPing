/**
 * The app's non-blocking notice channel.
 *
 * A module singleton rather than context, for the same reason `audioFocus.ts` is
 * one: the callers are deep inside card components that already receive a long
 * prop list, and a limit notice is not state any of them own. Anything can ask
 * for a banner; exactly one component renders it.
 *
 * Pure — no react-native import — so the queueing is testable.
 */

export interface TopBannerRequest {
  /** Body text, already localized and filled. */
  message: string;
  /** Distinguishes notices so a repeat of the same one does not re-queue. */
  id: string;
}

type Listener = (request: TopBannerRequest) => void;

let listener: Listener | null = null;
let lastRequest: { id: string; atMs: number } | null = null;

/** Repeats of one notice inside this window are dropped. */
export const TOP_BANNER_DEDUPE_MS = 3_000;

export function subscribeToTopBanner(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

/**
 * Shows a banner, unless the same notice was just shown.
 *
 * Tapping a voice button repeatedly while rate-limited would otherwise restart
 * the animation on every press.
 */
export function showTopBanner(request: TopBannerRequest, nowMs: number = Date.now()): boolean {
  if (lastRequest && lastRequest.id === request.id && nowMs - lastRequest.atMs < TOP_BANNER_DEDUPE_MS) {
    return false;
  }
  lastRequest = { id: request.id, atMs: nowMs };
  listener?.(request);
  return true;
}

/** Test seam — clears the dedupe memory. */
export function resetTopBannerState(): void {
  lastRequest = null;
}
