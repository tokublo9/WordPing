import type { AIRequestError } from './errors';

/**
 * The three ways AI Voice playback can be refused for usage reasons.
 *
 * Kept apart from `AIErrorKind` on purpose: `kind` describes what the transport
 * saw, this describes what the user is told. A daily and a short-burst rejection
 * share one server code and one `kind`, and differ only by the rate-limit window.
 *
 * Pure — no react-native or expo imports — so every boundary below is unit-tested
 * rather than eyeballed in a screenshot.
 */
export type AiVoiceLimitReason = 'daily' | 'monthly' | 'shortTerm';

export type AiVoiceLimit =
  | { reason: 'daily'; resetsAtMs: number }
  | { reason: 'monthly'; resetsAt: string }
  | { reason: 'shortTerm'; waitSeconds: number };

/** Rendered wait, already reduced to the unit the message should use. */
export interface WaitDuration {
  unit: 'minutes' | 'hours';
  value: number;
}

/**
 * Classifies a failed voice request into a user-facing limit, or null when the
 * failure is not a usage limit at all (offline, timeout, plan boundary, …).
 *
 * `usage_limited` is the daily *character* bucket and `rate_limited` the request
 * bucket; both carry the window, so both map the same way.
 */
export function resolveAiVoiceLimit(
  error: Pick<AIRequestError, 'kind' | 'limitWindow' | 'retryAfterSeconds' | 'quota'>,
  nowMs: number,
): AiVoiceLimit | null {
  if (error.kind === 'monthly_limit_reached') {
    return error.quota ? { reason: 'monthly', resetsAt: error.quota.resetsAt } : null;
  }
  if (error.kind !== 'rate_limited' && error.kind !== 'usage_limited') return null;

  const waitSeconds = error.retryAfterSeconds;
  if (error.limitWindow === 'day') {
    // The Worker's daily buckets roll over at UTC midnight. Deriving the moment
    // from Retry-After rather than assuming a clock time keeps the message right
    // in every timezone instead of only in JST.
    if (waitSeconds === undefined) return null;
    return { reason: 'daily', resetsAtMs: nowMs + waitSeconds * 1000 };
  }
  if (waitSeconds === undefined) return null;
  return { reason: 'shortTerm', waitSeconds };
}

/**
 * Reduces a wait in seconds to minutes, or to hours once it reaches a full hour.
 *
 * Always rounds up. Telling someone to come back sooner than the limit actually
 * clears would send them straight into a second refusal, so the error is taken
 * in the direction that cannot do that. Exactly 3600s is therefore "1 hour",
 * not "60 minutes".
 */
export function formatWaitDuration(seconds: number): WaitDuration {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
  const minutes = Math.max(1, Math.ceil(safeSeconds / 60));
  if (minutes < 60) return { unit: 'minutes', value: minutes };
  return { unit: 'hours', value: Math.ceil(minutes / 60) };
}

/**
 * "9月1日" for Japanese, and the locale's own month/day elsewhere.
 *
 * Falls back to the raw ISO date rather than throwing: an unsupported locale tag
 * must never be the reason a limit message fails to render.
 */
export function formatResetMonthDay(resetsAt: string, language: string): string {
  const parsed = new Date(resetsAt);
  if (Number.isNaN(parsed.getTime())) return resetsAt;
  try {
    return parsed.toLocaleDateString(language, { month: 'long', day: 'numeric' });
  } catch {
    return resetsAt.slice(0, 10);
  }
}

/**
 * The local clock time a UTC-midnight reset lands on — "9:00" in JST.
 *
 * Uses the device timezone, so this stays correct for a user outside Japan
 * instead of hardcoding the JST offset.
 */
export function formatResetClockTime(resetsAtMs: number, language: string): string {
  const parsed = new Date(resetsAtMs);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    return parsed.toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** i18n key and substitutions for a resolved limit. */
export interface AiVoiceLimitMessage {
  key:
    | 'voice_limit_daily'
    | 'voice_limit_monthly'
    | 'voice_limit_short_minutes'
    | 'voice_limit_short_hours';
  values: Record<string, string>;
}

export function buildAiVoiceLimitMessage(
  limit: AiVoiceLimit,
  language: string,
): AiVoiceLimitMessage {
  switch (limit.reason) {
    case 'daily':
      return {
        key: 'voice_limit_daily',
        values: { time: formatResetClockTime(limit.resetsAtMs, language) },
      };
    case 'monthly':
      return {
        key: 'voice_limit_monthly',
        values: { date: formatResetMonthDay(limit.resetsAt, language) },
      };
    case 'shortTerm': {
      const wait = formatWaitDuration(limit.waitSeconds);
      return {
        key: wait.unit === 'hours' ? 'voice_limit_short_hours' : 'voice_limit_short_minutes',
        values: { n: String(wait.value) },
      };
    }
  }
}

// Re-exported so the existing call sites and tests keep one import, while the
// plan-switch notice shares the same substitution.
export { fillTemplate } from '../fillTemplate';
