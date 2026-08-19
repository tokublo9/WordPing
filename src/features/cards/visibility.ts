import type { WordCard } from '../../types';

/**
 * Temporary hiding, set by a "Pretty good" or "Not really" grade when
 * "Sync with test results" is on.
 *
 * The card is not deleted and not archived — it simply drops out of every
 * learning view until `hiddenUntil` passes, then reappears on its own. There is
 * no timer holding the state: visibility is derived from the stored timestamp
 * every time the list is built, so relaunching, backgrounding or changing
 * timezone cannot reset or extend the period. `nextHideExpiry` exists only to
 * wake an idle screen at the moment a hide runs out; it never decides anything.
 *
 * `hiddenUntil` is Unix milliseconds UTC, matching `testNextReview`.
 *
 * Deliberately NOT applied to backup export, import, migrations or repository
 * reads — a hidden card is still the user's data and must survive a transfer.
 */

/**
 * How long each grade hides a card for.
 *
 * The better the recall, the longer the card stays away: "Pretty good" is
 * remembered, so it waits three days; "Not really" is shaky and comes back the
 * next day. "Perfect!" is deleted instead of hidden, and "Don't know" is never
 * hidden at all — a word the user could not recall has to stay in front of them.
 */
export const PRETTY_GOOD_HIDE_MS = 72 * 60 * 60 * 1000;
export const NOT_REALLY_HIDE_MS = 24 * 60 * 60 * 1000;

export function isCardHidden(card: Pick<WordCard, 'hiddenUntil'>, now: number = Date.now()): boolean {
  return card.hiddenUntil !== undefined && card.hiddenUntil > now;
}

/**
 * The cards a learning view should show.
 *
 * Returns the original array when nothing is hidden, so the common case adds no
 * allocation and downstream memoisation is not invalidated on every render.
 */
export function visibleCards<T extends Pick<WordCard, 'hiddenUntil'>>(
  cards: readonly T[],
  now: number = Date.now(),
): readonly T[] {
  return cards.some(card => isCardHidden(card, now))
    ? cards.filter(card => !isCardHidden(card, now))
    : cards;
}

/**
 * The timestamp a grade should hide a card until.
 *
 * `durationMs` is always one of the two constants above — the caller picks
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
  cards: readonly Pick<WordCard, 'hiddenUntil'>[],
  now: number = Date.now(),
): number | null {
  let soonest: number | null = null;
  for (const card of cards) {
    if (!isCardHidden(card, now)) continue;
    const until = card.hiddenUntil as number;
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
export const CLEAR_HIDE: { hiddenUntil: undefined } = { hiddenUntil: undefined };
