import type { MonthlyQuotaInfo } from './errors';

/**
 * Turns the Worker's verified quota figures into the message the user sees.
 *
 * The only monthly allowance in the product is the Basic High-Quality AI Voice
 * one, so there is a single message. Premium has no monthly product quota and
 * therefore cannot reach this path.
 *
 * The numbers always come from the server response, never from the client's own
 * copy of the limits — so what the user is told matches what was actually
 * enforced, even if the app is a version behind.
 *
 * Pure, so the branching is unit-tested rather than inferred from a screenshot.
 */

export interface QuotaMessage {
  titleKey: 'err_voice_limit_title';
  bodyKey: 'err_voice_limit_basic';
  /** Substitutions for the body template. */
  values: { limit: string; date: string };
  /**
   * Whether to offer the Premium upgrade flow. True for Basic, which is the
   * only tier with a monthly voice allowance to exhaust.
   */
  offerUpgrade: boolean;
}

function formatLimit(limit: number, language: string): string {
  return limit.toLocaleString(language.startsWith('ja') ? 'ja-JP' : 'en-US');
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
  // Only Basic has a monthly voice allowance, so this is always the Basic
  // message and always offers the upgrade. Premium is excluded from the quota
  // in the Worker and cannot produce this error.
  return {
    titleKey: 'err_voice_limit_title',
    bodyKey: 'err_voice_limit_basic',
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
