import type { TestLevel } from '../../types';
import { appNow } from '../../lib/appClock';
import { matchesResultFilter, type ScheduledCard } from './testSchedule';

/**
 * The result categories a word can be counted under. Perfect is deliberately
 * absent because synced Perfect cards are deleted.
 *
 * Three of them are drawn as chips. `none` — the words due to be tested — is
 * counted but not drawn: nothing in the result row reports it, and the number
 * feeds the Test button's badge instead. Nothing here filters the Word List;
 * what the list shows is decided by `visibility.ts` alone.
 */
export const ALL_LEVEL_KEYS = ['good', 'slightly', 'unknown', 'none'] as const;

export type LevelFilterKey = typeof ALL_LEVEL_KEYS[number];

/**
 * How many words sit under each reading **right now**.
 *
 * Counted with the same predicate the colour sheets list by, so a chip's number
 * is always the number of words its sheet would show. It moves with the clock:
 * an answered word is counted under its colour only until its waiting interval
 * elapses, and lands in grey the moment it does. Pass the `now` you want the
 * reading taken at — the default is the app clock.
 */
export function countCardsByResult(
  cards: readonly ScheduledCard[],
  now: number = appNow(),
): Record<LevelFilterKey, number> {
  const counts: Record<LevelFilterKey, number> = {
    good: 0,
    slightly: 0,
    unknown: 0,
    none: 0,
  };
  for (const card of cards) {
    // The categories are mutually exclusive — a word is either resting under one
    // result or due — so the first match is the only one.
    for (const key of ALL_LEVEL_KEYS) {
      if (matchesResultFilter(card, key, now)) {
        counts[key] += 1;
        break;
      }
    }
  }
  return counts;
}

export const LEVEL_ORDER: Record<string, number> = { perfect: 0, good: 1, slightly: 2, unknown: 3 };

/** Existing localized result names, shared by visual and non-visual card UI. */
export const TEST_LEVEL_LABEL_KEYS = {
  perfect: 'test_know_perfectly',
  good: 'test_know_good',
  slightly: 'test_know_slightly',
  unknown: 'test_dont_know',
} as const satisfies Record<TestLevel, string>;

export interface LevelFilterOption {
  level: LevelFilterKey;
  icon: string | null;
  color: string;
}

/**
 * The chips, in the order they are drawn: the three results, longest interval
 * first.
 *
 * Only results are drawn. The due count has no chip — it is not a result, and
 * the row reports what answers have been given rather than what is left to do.
 *
 * This is display order only. `ALL_LEVEL_KEYS` is the set of categories and is
 * deliberately left alone: nothing counted depends on the sequence.
 */
export const LEVEL_FILTER_OPTIONS: LevelFilterOption[] = [
  { level: 'good',     icon: 'ellipse-outline',  color: '#6BA4F0' },
  { level: 'slightly', icon: 'triangle-outline', color: '#F2B445' },
  { level: 'unknown',  icon: 'close-outline',    color: '#ED7373' },
];

/**
 * What each chip means, for the tutorial that introduces them.
 *
 * Derived from LEVEL_FILTER_OPTIONS rather than restated, so the explanation
 * cannot describe a colour the chips no longer use — or a chip that is no longer
 * there. These are three of the four Test Mode answers, each held for as long as
 * the interval that answer bought. "Perfect" has no chip at all — with "Sync with
 * test results" on it removes the card, which is what `test_result_perfect_note`
 * explains rather than pretending there is a fourth colour.
 */
export interface ResultFilterLegendEntry extends LevelFilterOption {
  /** The result's existing localized name. */
  labelKey: string;
}

export const RESULT_FILTER_LEGEND: readonly ResultFilterLegendEntry[] = LEVEL_FILTER_OPTIONS.map(
  option => ({
    ...option,
    labelKey: TEST_LEVEL_LABEL_KEYS[option.level as keyof typeof TEST_LEVEL_LABEL_KEYS],
  }),
);
