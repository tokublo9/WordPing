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

/** Selects one category, or clears it when the selected category is tapped again. */
export function toggleActiveResultFilter(
  current: ActiveResultFilter,
  tapped: ResultFilter,
): ActiveResultFilter {
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
    if (isLevelFilterKey(value)) {
      result[folderId] = value;
      continue;
    }
    if (!Array.isArray(value)) continue;
    const selected = new Set(value.filter(isLevelFilterKey));
    if (selected.size === 1) result[folderId] = [...selected][0];
    else if (selected.size > 1 || value.length === 0) result[folderId] = null;
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
