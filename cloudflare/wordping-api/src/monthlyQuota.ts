import type { FeatureLimits, Tier } from './config';
import type { Env } from './env';
import { DEFAULT_LIMITS } from './config';
import { BASIC_MONTHLY_AUDIO_MS, PREMIUM_MONTHLY_AUDIO_MS, VOICE_MONTHLY_LIMITS, monthKey, monthResetsAt } from './planLimits';

/** Premium card generations share one atomic budget across all devices. */
export interface VoiceQuotaState {
  minute: string;
  day: string;
  month: string;
  minuteUsed: number;
  dayUsed: number;
  monthUsed: number;
  dayCharacters: number;
  /** Premium audio; existing ledgers already store this field. */
  monthAudioMs?: number;
  monthBasicAudioMs?: number;
  monthAudioExhausted?: boolean;
  monthBasicAudioExhausted?: boolean;
}

export interface QuotaDecision {
  allowed: boolean;
  window: 'minute' | 'day' | 'month' | null;
  reason: 'requests' | 'characters' | 'duration' | null;
  limit: number;
  used: number;
  resetsAt: string;
  retryAfterSeconds: number;
}

export interface PremiumVoiceUsage {
  day: { used: number; limit: number; resetsAt: string };
  month: { used: number; limit: number; resetsAt: string };
}

/** Read the same UTC request counters that reserve Premium card generations. */
export function describePremiumVoiceUsage(
  before: VoiceQuotaState | undefined,
  now: number,
  maxRequestsPerDay = DEFAULT_LIMITS.voice_card.premium.maxRequestsPerDay,
): PremiumVoiceUsage {
  const current = applyVoiceQuota(before, now, 0, false).next;
  const dayLimit = Math.min(DEFAULT_LIMITS.voice_card.premium.maxRequestsPerDay, maxRequestsPerDay);
  return {
    day: {
      used: current.dayUsed,
      limit: dayLimit,
      resetsAt: new Date(Date.parse(`${current.day}T00:00:00.000Z`) + 86_400_000).toISOString(),
    },
    month: {
      used: current.monthUsed,
      limit: VOICE_MONTHLY_LIMITS.premium ?? 400,
      resetsAt: monthResetsAt(now),
    },
  };
}

export function applyVoiceQuota(
  before: VoiceQuotaState | undefined,
  now: number,
  characters: number,
  reserve: boolean,
  override?: Pick<FeatureLimits, 'maxRequestsPerMinute' | 'maxRequestsPerDay' | 'maxCharsPerDay'>,
): { next: VoiceQuotaState; decision: QuotaDecision } {
  const minute = String(Math.floor(now / 60_000));
  const day = new Date(now).toISOString().slice(0, 10);
  const month = monthKey(now);
  const defaults = DEFAULT_LIMITS.voice_card.premium;
  const limits = {
    maxRequestsPerMinute: Math.min(defaults.maxRequestsPerMinute, override?.maxRequestsPerMinute ?? defaults.maxRequestsPerMinute),
    maxRequestsPerDay: Math.min(defaults.maxRequestsPerDay, override?.maxRequestsPerDay ?? defaults.maxRequestsPerDay),
    maxCharsPerDay: Math.min(defaults.maxCharsPerDay, override?.maxCharsPerDay ?? defaults.maxCharsPerDay),
  };
  const monthlyLimit = VOICE_MONTHLY_LIMITS.premium ?? 400;
  const next: VoiceQuotaState = {
    minute, day, month,
    minuteUsed: before?.minute === minute ? before.minuteUsed : 0,
    dayUsed: before?.day === day ? before.dayUsed : 0,
    monthUsed: before?.month === month ? before.monthUsed : 0,
    dayCharacters: before?.day === day ? before.dayCharacters : 0,
    monthAudioMs: before?.month === month ? before.monthAudioMs ?? 0 : 0,
    monthBasicAudioMs: before?.month === month ? before.monthBasicAudioMs ?? 0 : 0,
    monthAudioExhausted: before?.month === month ? before.monthAudioExhausted ?? false : false,
    monthBasicAudioExhausted: before?.month === month ? before.monthBasicAudioExhausted ?? false : false,
  };
  const nextMinute = (Math.floor(now / 60_000) + 1) * 60_000;
  const nextDay = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
  const nextMonth = Date.parse(monthResetsAt(now));
  const blocked = (window: QuotaDecision['window'], reason: QuotaDecision['reason'], limit: number, used: number, reset: number): QuotaDecision => ({
    allowed: false, window, reason, limit, used,
    resetsAt: new Date(reset).toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1_000)),
  });
  // The longest exhausted window wins, so a monthly limit never looks like a
  // minute-only delay at the end of a large import.
  if (next.monthUsed >= monthlyLimit) return { next, decision: blocked('month', 'requests', monthlyLimit, next.monthUsed, nextMonth) };
  if (next.monthAudioExhausted || (next.monthAudioMs ?? 0) >= PREMIUM_MONTHLY_AUDIO_MS) {
    return { next, decision: blocked('month', 'duration', PREMIUM_MONTHLY_AUDIO_MS, next.monthAudioMs ?? 0, nextMonth) };
  }
  if (next.dayUsed >= limits.maxRequestsPerDay) return { next, decision: blocked('day', 'requests', limits.maxRequestsPerDay, next.dayUsed, nextDay) };
  if (next.dayCharacters + characters > limits.maxCharsPerDay) {
    return { next, decision: blocked('day', 'characters', limits.maxCharsPerDay, next.dayCharacters, nextDay) };
  }
  if (next.minuteUsed >= limits.maxRequestsPerMinute) return { next, decision: blocked('minute', 'requests', limits.maxRequestsPerMinute, next.minuteUsed, nextMinute) };
  if (reserve) {
    next.minuteUsed += 1;
    next.dayUsed += 1;
    next.monthUsed += 1;
    next.dayCharacters += characters;
  }
  return { next, decision: {
    allowed: true, window: null, reason: null, limit: monthlyLimit, used: next.monthUsed,
    resetsAt: new Date(nextMonth).toISOString(), retryAfterSeconds: 0,
  } };
}

/** Commit the duration of an actual generated clip, serialized by the ledger. */
export function applyAudioDuration(
  before: VoiceQuotaState | undefined,
  now: number,
  durationMs: number,
  tier: 'basic' | 'premium' = 'premium',
): { next: VoiceQuotaState; decision: QuotaDecision } {
  const next = applyVoiceQuota(before, now, 0, false).next;
  const used = tier === 'basic' ? next.monthBasicAudioMs ?? 0 : next.monthAudioMs ?? 0;
  const limit = tier === 'basic' ? BASIC_MONTHLY_AUDIO_MS : PREMIUM_MONTHLY_AUDIO_MS;
  const resetsAt = monthResetsAt(now);
  const blocked = (): QuotaDecision => ({
    allowed: false, window: 'month', reason: 'duration',
    limit, used,
    resetsAt, retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(resetsAt) - now) / 1_000)),
  });
  const exhausted = tier === 'basic' ? next.monthBasicAudioExhausted : next.monthAudioExhausted;
  if (exhausted || used >= limit || used + durationMs > limit) {
    if (tier === 'basic') next.monthBasicAudioExhausted = true;
    else next.monthAudioExhausted = true;
    return { next, decision: blocked() };
  }
  if (tier === 'basic') next.monthBasicAudioMs = used + durationMs;
  else next.monthAudioMs = used + durationMs;
  return { next, decision: { allowed: true, window: null, reason: null,
    limit, used: used + durationMs, resetsAt, retryAfterSeconds: 0 } };
}

export interface ReserveInput {
  tier: Tier;
  hashedAppUserId: string;
  characters?: number;
  limits?: Pick<FeatureLimits, 'maxRequestsPerMinute' | 'maxRequestsPerDay' | 'maxCharsPerDay'>;
}

async function callQuota(env: Env, input: ReserveInput, op: 'quotaReserve' | 'quotaPeek'): Promise<QuotaDecision | null> {
  if (input.tier !== 'premium') return {
    allowed: true, window: null, reason: null, limit: 0, used: 0,
    resetsAt: monthResetsAt(Date.now()), retryAfterSeconds: 0,
  };
  try {
    const id = env.VOICE_CREDITS.idFromName(input.hashedAppUserId);
    const response = await env.VOICE_CREDITS.get(id).fetch(
      `https://ledger/${op}?characters=${Math.max(0, input.characters ?? 0)}`
        + `&minute=${input.limits?.maxRequestsPerMinute ?? DEFAULT_LIMITS.voice_card.premium.maxRequestsPerMinute}`
        + `&day=${input.limits?.maxRequestsPerDay ?? DEFAULT_LIMITS.voice_card.premium.maxRequestsPerDay}`
        + `&chars=${input.limits?.maxCharsPerDay ?? DEFAULT_LIMITS.voice_card.premium.maxCharsPerDay}`,
      { method: 'POST' },
    );
    return response.ok ? await response.json() as QuotaDecision : null;
  } catch { return null; }
}

export function reserveMonthlyQuota(env: Env, input: ReserveInput): Promise<QuotaDecision | null> {
  return callQuota(env, input, 'quotaReserve');
}

export function readMonthlyQuota(env: Env, input: ReserveInput): Promise<QuotaDecision | null> {
  return callQuota(env, input, 'quotaPeek');
}

/** A non-consuming snapshot for the Premium App Info usage display. */
export async function readPremiumVoiceUsage(
  env: Env,
  hashedAppUserId: string,
  maxRequestsPerDay: number,
): Promise<PremiumVoiceUsage | null> {
  try {
    const id = env.VOICE_CREDITS.idFromName(hashedAppUserId);
    const response = await env.VOICE_CREDITS.get(id).fetch(
      `https://ledger/quotaStatus?day=${maxRequestsPerDay}`,
      { method: 'POST' },
    );
    return response.ok ? await response.json() as PremiumVoiceUsage : null;
  } catch { return null; }
}

export async function commitAudioDuration(env: Env, hashedAppUserId: string, durationMs: number, tier: 'basic' | 'premium' = 'premium'): Promise<QuotaDecision | null> {
  try {
    const id = env.VOICE_CREDITS.idFromName(hashedAppUserId);
    const response = await env.VOICE_CREDITS.get(id).fetch(`https://ledger/quotaAudioCommit?durationMs=${durationMs}&tier=${tier}`, { method: 'POST' });
    return response.ok ? await response.json() as QuotaDecision : null;
  } catch { return null; }
}

export async function readAudioDuration(env: Env, hashedAppUserId: string, tier: 'basic' | 'premium' = 'premium'): Promise<QuotaDecision | null> {
  try {
    const id = env.VOICE_CREDITS.idFromName(hashedAppUserId);
    const response = await env.VOICE_CREDITS.get(id).fetch(`https://ledger/quotaAudioPeek?tier=${tier}`, { method: 'POST' });
    return response.ok ? await response.json() as QuotaDecision : null;
  } catch { return null; }
}
