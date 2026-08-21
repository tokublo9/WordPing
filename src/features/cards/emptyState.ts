import type { TranslationKey } from '../../i18n';
import type { ActiveResultFilter, LevelFilterKey } from './levels';

export type WordListEmptyState = 'none' | 'generic' | 'result-filter';

export interface ResultFilterEmptyCopyKeys {
  title: TranslationKey;
  description: TranslationKey;
}

/** Copy follows the same four authoritative result keys used by filtering and grading. */
export const RESULT_FILTER_EMPTY_COPY_KEYS: Record<LevelFilterKey, ResultFilterEmptyCopyKeys> = {
  good: {
    title: 'empty_filter_good_title',
    description: 'empty_filter_good_description',
  },
  slightly: {
    title: 'empty_filter_slightly_title',
    description: 'empty_filter_slightly_description',
  },
  unknown: {
    title: 'empty_filter_unknown_title',
    description: 'empty_filter_unknown_description',
  },
  none: {
    title: 'empty_filter_none_title',
    description: 'empty_filter_none_description',
  },
};

export function resultFilterEmptyCopyKeys(
  activeResultFilter: ActiveResultFilter,
): ResultFilterEmptyCopyKeys | null {
  return activeResultFilter === null
    ? null
    : RESULT_FILTER_EMPTY_COPY_KEYS[activeResultFilter];
}

interface ResolveWordListEmptyStateOptions {
  allCardCount: number;
  visibleCardCount: number;
  activeResultFilter: ActiveResultFilter;
}

/**
 * Distinguishes a filter with no matches from the existing generic empty state.
 * This is presentation-only: it never changes card visibility or stored card data.
 */
export function resolveWordListEmptyState({
  allCardCount,
  visibleCardCount,
  activeResultFilter,
}: ResolveWordListEmptyStateOptions): WordListEmptyState {
  if (visibleCardCount > 0) return 'none';
  if (allCardCount > 0 && activeResultFilter !== null) return 'result-filter';
  return 'generic';
}
