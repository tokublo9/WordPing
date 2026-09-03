import type { TranslationKey } from '../../i18n';

export type WordListEmptyState = 'none' | 'generic' | 'session-complete';

interface ResolveWordListEmptyStateOptions {
  allCardCount: number;
  visibleCardCount: number;
}

/**
 * Distinguishes a finished review from an empty folder.
 *
 * Nothing narrows the Word List any more, so a folder that holds words but shows
 * none of them can only be in that state because every word is inside the hide a
 * grade set — which is to say the review is done. "No words yet" would be plainly
 * wrong there: the words exist and are coming back on their own.
 *
 * This is presentation-only: it never changes card visibility or stored data.
 */
export function resolveWordListEmptyState({
  allCardCount,
  visibleCardCount,
}: ResolveWordListEmptyStateOptions): WordListEmptyState {
  if (visibleCardCount > 0) return 'none';
  return allCardCount > 0 ? 'session-complete' : 'generic';
}

/** The finished-review copy, shown when every word is resting under a result. */
export const SESSION_COMPLETE_COPY_KEYS: { title: TranslationKey; hint: TranslationKey } = {
  title: 'test_complete_title',
  hint: 'test_complete_hint',
};
