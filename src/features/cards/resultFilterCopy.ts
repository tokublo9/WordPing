import type { TranslationKey } from '../../i18n';
import type { LevelFilterKey } from './levels';

/**
 * The three coloured chips, and the explanation each one shows when tapped.
 *
 * Grey is deliberately absent: it is the queue of words due to be tested, it
 * still filters the Word List directly, and it has nothing to hold or explain.
 * Only a colour opens a dialog, so only a colour appears here.
 *
 * Each explanation names the result that put a word in that holding area and the
 * interval before it comes back. Those intervals are the ones in `grading.ts`
 * (three days, one day, one hour) — written out in the copy rather than
 * formatted from the constants, because they are read as a sentence and each
 * language phrases a duration its own way. A change to a constant is therefore a
 * change to this copy too; the source tests pin the pairing so the two cannot
 * drift silently apart.
 */
export type ResultColorFilter = Exclude<LevelFilterKey, 'none'>;

export const RESULT_COLOR_FILTERS = ['good', 'slightly', 'unknown'] as const;

export function isResultColorFilter(value: unknown): value is ResultColorFilter {
  return value === 'good' || value === 'slightly' || value === 'unknown';
}

export const RESULT_FILTER_EXPLANATION_KEYS = {
  good: 'result_sheet_good_body',
  slightly: 'result_sheet_slightly_body',
  unknown: 'result_sheet_unknown_body',
} as const satisfies Record<ResultColorFilter, TranslationKey>;

/**
 * The interval phrase inside each explanation, to be emphasised where it sits in
 * the sentence.
 *
 * Held as its own string rather than as markup in the body: the phrase is the
 * part of the sentence a translator has to move, and every language puts it
 * somewhere different. Each one appears verbatim in its body — a source test
 * checks that, because a phrase that no longer matches would silently stop being
 * emphasised rather than break anything.
 */
export const RESULT_FILTER_INTERVAL_KEYS = {
  good: 'result_sheet_good_interval',
  slightly: 'result_sheet_slightly_interval',
  unknown: 'result_sheet_unknown_interval',
} as const satisfies Record<ResultColorFilter, TranslationKey>;

/** An explanation split around the interval phrase, ready to be drawn. */
export interface EmphasisedExplanation {
  before: string;
  /** The interval, or '' when the body does not contain it. */
  emphasis: string;
  after: string;
}

/**
 * Splits an explanation around its interval, so only that phrase is bold.
 *
 * A body that does not contain the phrase — a translation that reworded it, or a
 * locale that supplies one string and falls back for the other — comes back
 * whole and unemphasised. The sentence is never cut in a way that could drop
 * text or leave a fragment bold.
 */
export function emphasiseInterval(body: string, interval: string): EmphasisedExplanation {
  const at = interval === '' ? -1 : body.indexOf(interval);
  if (at === -1) return { before: body, emphasis: '', after: '' };
  return {
    before: body.slice(0, at),
    emphasis: interval,
    after: body.slice(at + interval.length),
  };
}
