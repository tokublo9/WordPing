import type { WordCard } from '../../types';
import { appNow } from '../../lib/appClock';
import type { ActiveResultFilter } from './levels';

/**
 * Temporary hiding, set by a "Pretty good", "Not really" or "Don't know" grade
 * when "Sync with test results" is on.
 *
 * The card is not deleted and not archived — it simply drops out of every
 * ordinary learning view until `hiddenUntil` passes, then reappears on its own.
 * There is no timer holding the state: visibility is derived from the stored timestamp
 * every time the list is built, so relaunching, backgrounding or changing
 * timezone cannot reset or extend the period. `nextHideExpiry` exists only to
 * wake an idle screen at the moment a hide runs out; it never decides anything.
 *
 * `hiddenUntil` is Unix milliseconds UTC, matching `testNextReview`.
 *
 * Hidden cards remain normal stored vocabulary and survive backup transfers.
 */

/**
 * How long each grade hides a card for.
 *
 * The better the recall, the longer the card stays away: "Pretty good" is
 * remembered, so it waits three days; "Not really" is shaky and comes back the
 * next day; "Don't know" comes back within the hour, which is short enough to
 * be the same study session but long enough that the answer is recalled rather
 * than still on screen. Perfect cards are deleted by the canonical app path and
 * have no hide at all.
 */
export const PRETTY_GOOD_HIDE_MS = 72 * 60 * 60 * 1000;
export const NOT_REALLY_HIDE_MS = 24 * 60 * 60 * 1000;
export const DONT_KNOW_HIDE_MS = 60 * 60 * 1000;

export interface CardVisibilityContext {
  now: number;
  /** Null is the ordinary view; one matching category overrides temporary hiding. */
  activeResultFilter: ActiveResultFilter;
}

type VisibilityCard = Pick<WordCard, 'hiddenUntil' | 'testLevel'>;

export function isCardHidden(card: VisibilityCard, now: number = appNow()): boolean {
  return card.hiddenUntil !== undefined && card.hiddenUntil > now;
}

/** One visibility decision used by both Word List and Flip Mode. */
export function shouldShowCard(card: VisibilityCard, context: CardVisibilityContext): boolean {
  if (context.activeResultFilter !== null) {
    return (card.testLevel ?? 'none') === context.activeResultFilter;
  }
  return !isCardHidden(card, context.now);
}

export function cardsForVisibility<T extends VisibilityCard>(
  cards: readonly T[],
  context: CardVisibilityContext,
): readonly T[] {
  return cards.some(card => !shouldShowCard(card, context))
    ? cards.filter(card => shouldShowCard(card, context))
    : cards;
}

/**
 * The cards a learning view should show.
 *
 * Returns the original array when nothing is hidden, so the common case adds no
 * allocation and downstream memoisation is not invalidated on every render.
 */
export function visibleCards<T extends VisibilityCard>(
  cards: readonly T[],
  now: number = appNow(),
): readonly T[] {
  return cardsForVisibility(cards, { now, activeResultFilter: null });
}

/**
 * The timestamp a grade should hide a card until.
 *
 * `durationMs` is always one of the three constants above — the caller picks
 * which, so the grade-to-duration mapping lives in one place (grading.ts) and
 * this module stays a pure clock helper.
 */
export function hiddenUntilFor(gradedAt: number, durationMs: number): number {
  return gradedAt + durationMs;
}

/**
 * When the soonest still-running hide ends, or `null` when nothing is hidden.
 *
 * A hide expires by wall-clock time, not by anything the user does, so a screen
 * left open has no state change to recompute from. Callers schedule a single
 * wake-up at this instant instead of polling.
 */
export function nextHideExpiry(
  cards: readonly VisibilityCard[],
  now: number = appNow(),
): number | null {
  let soonest: number | null = null;
  for (const card of cards) {
    const until = card.hiddenUntil;
    if (until === undefined || until <= now) continue;
    if (soonest === null || until < soonest) soonest = until;
  }
  return soonest;
}

/**
 * Patch that lifts a hide.
 *
 * Clearing test results has to clear the hide with them: the hide is a
 * consequence of a grade, so a card whose grade was wiped must come back
 * immediately rather than sit invisible with nothing explaining why.
 */
export const CLEAR_HIDE: Pick<WordCard, 'hiddenUntil'> = { hiddenUntil: undefined };
