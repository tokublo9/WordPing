import type { TestLevel, WordCard } from '../../types';

/** User-facing colorful filters. Perfect is deliberately absent because synced Perfect cards are deleted. */
export const ALL_LEVEL_KEYS = ['good', 'slightly', 'unknown', 'none'] as const;

export type LevelFilterKey = typeof ALL_LEVEL_KEYS[number];
export type ResultFilter = LevelFilterKey;
export type ActiveResultFilter = ResultFilter | null;
export type ActiveResultFiltersByFolder = Record<string, ActiveResultFilter>;

const LEVEL_FILTER_KEY_SET = new Set<string>(ALL_LEVEL_KEYS);

export function isLevelFilterKey(value: unknown): value is LevelFilterKey {
  return typeof value === 'string' && LEVEL_FILTER_KEY_SET.has(value);
}

/**
 * The categories that can actually be selected as a filter.
 *
 * Gray is deliberately absent. It stays in `ALL_LEVEL_KEYS`, which is what
 * keeps it counted and drawn beside the others, but it selects nothing: it
 * reports how many words are still untested and that is all it does. Being
 * outside this list is what makes it inert, so no caller can filter by it even
 * if one tried.
 */
export const SELECTABLE_RESULT_FILTERS = ['good', 'slightly', 'unknown'] as const;

export type SelectableResultFilter = typeof SELECTABLE_RESULT_FILTERS[number];

const SELECTABLE_RESULT_FILTER_SET = new Set<string>(SELECTABLE_RESULT_FILTERS);

export function isSelectableResultFilter(value: unknown): value is SelectableResultFilter {
  return typeof value === 'string' && SELECTABLE_RESULT_FILTER_SET.has(value);
}

/** Selects one category, or clears it when the selected category is tapped again. */
export function toggleActiveResultFilter(
  current: ActiveResultFilter,
  tapped: ResultFilter,
): ActiveResultFilter {
  // A category that cannot be selected cannot change the selection either. The
  // gray chip is not a button in the UI, and the rule is repeated here so the
  // state cannot be reached by any other route.
  if (!isSelectableResultFilter(tapped)) return current;
  return current === tapped ? null : tapped;
}

/** Counts result categories before ordinary visibility is applied. */
export function countCardsByResult(
  cards: readonly Pick<WordCard, 'testLevel'>[],
): Record<LevelFilterKey, number> {
  const counts: Record<LevelFilterKey, number> = {
    good: 0,
    slightly: 0,
    unknown: 0,
    none: 0,
  };
  for (const card of cards) {
    if (card.testLevel === undefined) counts.none += 1;
    else if (isLevelFilterKey(card.testLevel)) counts[card.testLevel] += 1;
  }
  return counts;
}

/**
 * Loads the exclusive per-folder filter. Older builds stored arrays for the
 * former multi-select UI: one selected category remains selected, while zero
 * or multiple selected categories safely become the unfiltered `null` state.
 *
 * A gray selection written by an older build comes back as no filter at all.
 * Gray no longer filters and its chip is no longer a button, so restoring it
 * would leave the list narrowed to untested words with nothing on screen able
 * to clear it.
 */
export function parseActiveResultFiltersByFolder(raw: string | null): ActiveResultFiltersByFolder {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const result: ActiveResultFiltersByFolder = {};
  for (const [folderId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!folderId) continue;
    if (value === null) {
      result[folderId] = null;
      continue;
    }
    if (isSelectableResultFilter(value)) {
      result[folderId] = value;
      continue;
    }
    if (isLevelFilterKey(value)) {
      // Gray, stored while it was still a filter.
      result[folderId] = null;
      continue;
    }
    if (!Array.isArray(value)) continue;
    // Ambiguity is still judged over every category, gray included: an array
    // that selected two things cannot be narrowed to one just because one of
    // them no longer filters. Only the surviving single choice is then checked
    // for whether it is still selectable.
    const selected = new Set(value.filter(isLevelFilterKey));
    if (selected.size === 1) {
      const only = [...selected][0];
      result[folderId] = isSelectableResultFilter(only) ? only : null;
    } else if (selected.size > 1 || value.length === 0) {
      result[folderId] = null;
    }
  }
  return result;
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

export const LEVEL_FILTER_OPTIONS: LevelFilterOption[] = [
  { level: 'good',     icon: 'ellipse-outline',  color: '#6BA4F0' },
  { level: 'slightly', icon: 'triangle-outline', color: '#F2B445' },
  { level: 'unknown',  icon: 'close-outline',    color: '#ED7373' },
  { level: 'none',     icon: null,               color: '#6B7280' },
];

/**
 * What each filter chip means, for the tutorial that introduces them.
 *
 * Derived from LEVEL_FILTER_OPTIONS rather than restated, so the explanation
 * cannot describe a colour the chips no longer use. Note that these are not the
 * four Test Mode answers: three of them are results, and the grey one is the
 * absence of a result. "Perfect" has no chip at all — with "Sync with test
 * results" on it removes the card, which is what `test_result_perfect_note`
 * explains rather than pretending there is a fourth colour.
 */
export interface ResultFilterLegendEntry extends LevelFilterOption {
  /** Existing localized result name, or the untested label for the grey chip. */
  labelKey: string;
}

export const RESULT_FILTER_LEGEND: readonly ResultFilterLegendEntry[] = LEVEL_FILTER_OPTIONS.map(
  option => ({
    ...option,
    labelKey: option.level === 'none'
      ? 'result_filter_untested'
      : TEST_LEVEL_LABEL_KEYS[option.level],
  }),
);
