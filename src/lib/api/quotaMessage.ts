import type { MonthlyQuotaInfo } from './errors';

/**
 * Turns the Worker's verified quota figures into the message the user sees.
 *
 * Premium's monthly generation budget renews at the next UTC month.
 *
 * The numbers always come from the server response, never from the client's own
 * copy of the limits — so what the user is told matches what was actually
 * enforced, even if the app is a version behind.
 *
 * Pure, so the branching is unit-tested rather than inferred from a screenshot.
 */

export interface QuotaMessage {
  titleKey: 'err_voice_limit_title';
  bodyKey: 'err_voice_limit_basic' | 'basic_voice_deferred_duration'
    | 'premium_voice_deferred_month' | 'premium_voice_deferred_duration';
  /** Substitutions for the body template. */
  values: { limit: string; date: string };
  /**
   * Whether to offer the Premium upgrade flow.
   */
  offerUpgrade: boolean;
}

function formatLimit(limit: number, language: string): string {
  try {
    // Grouping separators differ well beyond Japanese and English, so the
    // active language decides rather than a two-way test.
    return limit.toLocaleString(language);
  } catch {
    // An unsupported locale tag must not break the alert.
    return limit.toLocaleString('en-US');
  }
}

function formatResetDate(resetsAt: string, language: string): string {
  const parsed = new Date(resetsAt);
  if (Number.isNaN(parsed.getTime())) return resetsAt;
  try {
    return parsed.toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    // An unsupported locale tag must not break the alert.
    return resetsAt.slice(0, 10);
  }
}

export function buildQuotaMessage(quota: MonthlyQuotaInfo, language: string): QuotaMessage {
  return {
    titleKey: 'err_voice_limit_title',
    bodyKey: quota.tier === 'basic' && quota.reason === 'duration' ? 'basic_voice_deferred_duration'
      : quota.tier !== 'premium' ? 'err_voice_limit_basic'
        : quota.reason === 'duration' ? 'premium_voice_deferred_duration' : 'premium_voice_deferred_month',
    values: {
      limit: formatLimit(quota.limit, language),
      date: formatResetDate(quota.resetsAt, language),
    },
    offerUpgrade: quota.tier !== 'premium',
  };
}

/** Fills `{limit}` / `{date}` in a translated template. */
export function fillQuotaTemplate(template: string, values: QuotaMessage['values']): string {
  return template.replace(/\{(limit|date)\}/gu, (match, key: 'limit' | 'date') => values[key] ?? match);
}
