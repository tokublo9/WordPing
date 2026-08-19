import type { ReviewEntry, WordCard } from '../../types';
import { NOT_REALLY_HIDE_MS, PRETTY_GOOD_HIDE_MS, hiddenUntilFor } from './visibility';

/**
 * What a Test Mode answer does to a card.
 *
 * Kept out of the screen so the rule can be tested directly: the previous
 * version lived inside a `useCallback` in `TestModeScreen`, where the only way
 * to check "Pretty good hides the card" was to run the app.
 */

export type AnswerKind = 'perfect' | 'good' | 'slightly' | 'unknown';

export type GradeOutcome =
  | { action: 'delete' }
  | { action: 'update'; patch: Partial<WordCard> };

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long each grade postpones the card's next appearance in Test Mode. */
const NEXT_REVIEW_DELAY_MS: Record<AnswerKind, number | null> = {
  perfect:  null,          // mastered — removed from the queue entirely
  good:     3 * DAY_MS,
  slightly: DAY_MS,
  unknown:  null,          // stays in the queue
};

/**
 * How long each grade hides the card from the learning views, with "Sync with
 * test results" on. `null` means the grade never hides.
 *
 * The single mapping from grade to hide duration. `perfect` is null because it
 * deletes rather than hides; `unknown` is null because a word the user could
 * not recall has to stay in front of them.
 */
const HIDE_MS: Record<AnswerKind, number | null> = {
  perfect:  null,
  good:     PRETTY_GOOD_HIDE_MS,
  slightly: NOT_REALLY_HIDE_MS,
  unknown:  null,
};

/**
 * The hide half of a patch, or nothing.
 *
 * Returns an empty object when the toggle is off, so no `hiddenUntil` is ever
 * created or changed and the existing scoring behaviour is untouched.
 */
function hidePatch(kind: AnswerKind, now: number, syncTestResults: boolean): { hiddenUntil?: number } {
  const duration = HIDE_MS[kind];
  if (!syncTestResults || duration === null) return {};
  return { hiddenUntil: hiddenUntilFor(now, duration) };
}

export interface GradeOptions {
  now: number;
  /**
   * "Sync with test results". On: Perfect deletes, Pretty good hides for 72 h,
   * Not really hides for 24 h, Don't know is unchanged. Off: nothing is deleted
   * and no hiddenUntil is written.
   */
  syncTestResults: boolean;
  /** Whether the caller supplied the app's canonical delete path. */
  canDelete: boolean;
}

export function gradeCard(
  card: Pick<WordCard, 'reviewHistory'>,
  kind: AnswerKind,
  { now, syncTestResults, canDelete }: GradeOptions,
): GradeOutcome {
  const entry: ReviewEntry = { ts: now, rating: kind };
  const reviewHistory: ReviewEntry[] = [...(card.reviewHistory ?? []), entry];

  if (kind === 'perfect') {
    // Deleted through the app's canonical path, so folder links, notes, labels,
    // review history, cached audio and notification rescheduling are all
    // cleaned up by the existing rules. No update follows: the row is gone, and
    // writing to it would resurrect a partial record.
    if (syncTestResults && canDelete) return { action: 'delete' };
    return { action: 'update', patch: { testMastered: true, testLevel: 'perfect', reviewHistory } };
  }

  if (kind === 'good') {
    return {
      action: 'update',
      patch: {
        testNextReview: now + (NEXT_REVIEW_DELAY_MS.good as number),
        testLevel: 'good',
        reviewHistory,
        // Absolute UTC timestamp, persisted in SQLite. 72 hours.
        ...hidePatch(kind, now, syncTestResults),
      },
    };
  }

  if (kind === 'slightly') {
    return {
      action: 'update',
      patch: {
        testNextReview: now + (NEXT_REVIEW_DELAY_MS.slightly as number),
        testLevel: 'slightly',
        reviewHistory,
        // 24 hours — back the next day, because recall was shaky.
        ...hidePatch(kind, now, syncTestResults),
      },
    };
  }

  // "Don't know" never hides and never deletes: the card stays visible.
  return { action: 'update', patch: { testLevel: 'unknown', reviewHistory } };
}
