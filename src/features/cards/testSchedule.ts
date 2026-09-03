import type { WordCard } from '../../types';
import { appNow } from '../../lib/appClock';
import type { LevelFilterKey } from './levels';

/**
 * When a word is next due to be tested, and what that means for the result
 * filters.
 *
 * A grade buys the word a waiting interval — three days for "Pretty good", one
 * day for "Not really", one hour for "Don't know" — recorded on the card as
 * `testNextReview`. Until that moment the word is *resting under its result*.
 * After it, the word is *due*, and its result no longer says anything about what
 * to do with it: it needs testing again, exactly like a word that has never been
 * tested at all.
 *
 * That is the whole rule behind the chips. A coloured chip counts the words
 * resting under that result; the grey chip counts the queue — everything due
 * now, never-tested and elapsed alike. Nothing is in both, and a word crosses
 * from one to the other by the clock alone, with nothing written to it.
 *
 * Because the boundary is a timestamp compared against the current time, every
 * answer here depends on `now`. Callers that must refresh when an interval
 * elapses (the chip counts) pass a `now` they control; everything else takes the
 * app clock.
 */

export type ScheduledCard = Pick<WordCard, 'testLevel' | 'testMastered' | 'testNextReview'>;

/**
 * "Know perfectly" — finished rather than scheduled, so the word is neither due
 * nor waiting and appears under no chip at all.
 *
 * Both marks are checked. Grading writes them together, but a card can arrive
 * from a restored backup carrying only one, and a word marked perfect must not
 * come back round as something still to do because the other field was missing.
 */
function isFinished(card: ScheduledCard): boolean {
  return card.testMastered === true || card.testLevel === 'perfect';
}

/** The word needs testing now: never tested, or its waiting interval has passed. */
export function isCardDueForTest(card: ScheduledCard, now: number = appNow()): boolean {
  if (isFinished(card)) return false;
  return card.testNextReview === undefined || card.testNextReview <= now;
}

/** The word was graded and is still inside the interval that grade bought it. */
export function isCardWaitingForTest(card: ScheduledCard, now: number = appNow()): boolean {
  if (isFinished(card)) return false;
  return card.testNextReview !== undefined && card.testNextReview > now;
}

/**
 * Whether a word belongs under one result filter at a given moment.
 *
 * Grey is not a fourth result and is never stored on a card: it is the queue,
 * derived from the clock. A coloured filter is the result *plus* its unelapsed
 * interval, which is why a word leaves red an hour after being answered "Don't
 * know" without anything changing on the card itself.
 */
export function matchesResultFilter(
  card: ScheduledCard,
  filter: LevelFilterKey,
  now: number = appNow(),
): boolean {
  if (filter === 'none') return isCardDueForTest(card, now);
  return card.testLevel === filter && isCardWaitingForTest(card, now);
}

/**
 * When the soonest unelapsed waiting interval ends, or `null` when nothing is
 * waiting.
 *
 * The counts change by themselves at that instant — a word moves out of its
 * colour and into grey — with no state change to react to. Callers arm a single
 * wake-up here rather than polling the clock.
 */
export function nextTestDueAt(cards: readonly ScheduledCard[], now: number = appNow()): number | null {
  let soonest: number | null = null;
  for (const card of cards) {
    if (!isCardWaitingForTest(card, now)) continue;
    const due = card.testNextReview as number;
    if (soonest === null || due < soonest) soonest = due;
  }
  return soonest;
}
