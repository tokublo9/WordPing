/**
 * The undimmed area an introduction step points at, and where its card sits.
 *
 * A step that says "tap the card" has to be able to show which card, so the
 * backdrop leaves that one rectangle bright and the popup sits directly under
 * it. The rectangle is always *measured* — `measureInWindow` on the real view —
 * never a constant that happens to look right on one phone.
 *
 * Pure: no react-native import, so the placement arithmetic is testable on its
 * own. The drawing lives in `components/TestIntroDialog.tsx`.
 */

/** A measured rectangle in window coordinates. */
export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The target's own corner radius, so the hole matches its shape. */
  radius: number;
}

/** Which measured target a step wants lit. Resolved by App, measured by screens. */
export type SpotlightTarget = 'card' | 'resultFilters';

/** Breathing room between the lit target and the popup. */
export const SPOTLIGHT_GAP = 16;

export interface AnchorInput {
  rect: SpotlightRect;
  windowHeight: number;
  /** Home-indicator strip; the popup must clear it when it sits below. */
  bottomInset: number;
}

/**
 * Pins the popup below its target and tells it how far it may grow.
 *
 * This intentionally never returns a centred or above-target fallback. Both
 * Test targets leave useful space underneath, and the message body scrolls in
 * the available height on an unusually short screen. That keeps the first
 * popup below the word card and the third clear of the top-left filters on
 * every device while still respecting the bottom safe area.
 */
export interface BelowPlacement {
  top: number;
  maxHeight: number;
}

export function anchorBelowRect(input: AnchorInput): BelowPlacement {
  const { rect, windowHeight, bottomInset } = input;
  const top = rect.y + rect.height + SPOTLIGHT_GAP;
  const bottomLimit = windowHeight - bottomInset - SPOTLIGHT_GAP;
  return { top, maxHeight: Math.max(0, bottomLimit - top) };
}

/**
 * Has this rectangle actually been laid out?
 *
 * A zero-sized measurement means the view exists but has not been positioned
 * yet. Lighting that would punch a hole of nothing and leave the popup pointing
 * at the top-left corner, so it is treated as "not measured".
 */
export function isMeasuredRect(rect: SpotlightRect | null | undefined): rect is SpotlightRect {
  return rect != null
    && Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && Number.isFinite(rect.radius)
    && rect.width > 0
    && rect.height > 0
    && rect.radius >= 0;
}
