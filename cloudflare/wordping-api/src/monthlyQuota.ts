import type { Tier } from './config';
import type { Env } from './env';
import { log, redactError } from './log';
import {
  VOICE_MONTHLY_LIMITS,
  monthKey,
  monthlyCounterTtlSeconds,
  monthResetsAt,
} from './planLimits';

/**
 * Monthly High-Quality AI Voice allowance.
 *
 * Applies to word-card voice generation only (see VOICE_QUOTA_FEATURES). Basic
 * gets 200 generations per UTC month; Premium has no monthly product quota;
 * Free cannot reach the metered route at all.
 *
 * Counted per RevenueCat App User ID, not per install: the allowance belongs to
 * the subscription, so reinstalling or adding a second device must not hand out
 * a fresh one.
 *
 * WHAT COUNTS: exactly one unit per generation accepted for upstream
 * processing — a request that has passed validation, entitlement verification,
 * the per-minute/day rate limits. Everything else is free:
 *
 *   - health checks and unknown routes            never reach this module
 *   - malformed or unauthorised requests          rejected before reserving
 *   - entitlement-verification failures (503)     rejected before reserving
 *   - voice-picker previews, including cache miss outside monthly allowance
 *   - audio replayed from the client's file cache never reaches the Worker
 *   - free-plan device TTS (expo-speech)          never reaches the Worker
 *   - every non-voice route                       not a voice generation
 *
 * WHAT ABOUT UPSTREAM FAILURES: a request that reaches OpenAI and then fails
 * still counts. That is deliberate. OpenAI may well have processed and billed
 * it, and refunding the unit on failure would make a deliberately-failing
 * request an unlimited free retry loop. The cost of this choice is that a genuine
 * OpenAI outage consumes a few units; the cost of the alternative is an
 * unbounded bill.
 */

export interface QuotaDecision {
  allowed: boolean;
  /** null when the tier has no monthly product quota (Premium). */
  limit: number | null;
  used: number;
  /** ISO-8601 start of the next UTC month. */
  resetsAt: string;
}

function counterKey(monthlyKey: string, hashedAppUserId: string): string {
  return `quota:${monthlyKey}:${hashedAppUserId}`;
}

async function readUsed(env: Env, key: string): Promise<number> {
  const raw = await env.WORDPING_KV.get(key).catch(() => null);
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export interface ReserveInput {
  /** Verified tier. Never a client-supplied value. */
  tier: Tier;
  /** Salted hash of the RevenueCat App User ID. */
  hashedAppUserId: string;
  now?: number;
}

/**
 * Reserves one unit of monthly quota, or refuses.
 *
 * Reserved *before* the OpenAI call rather than committed after it, so two
 * requests in flight cannot both see the same "used" value and both proceed on
 * the assumption there was room for one.
 *
 * CONCURRENCY: KV offers no atomic increment, so this is read-modify-write and
 * simultaneous requests in different colos can lose an update. The practical
 * bound is small, because the per-minute limiter in ratelimit.ts has already
 * run and caps how many requests can be in flight at once (10-20/min per
 * feature). Overshoot is therefore on the order of the in-flight count, not
 * unbounded. If exact monthly accounting is ever required, move this module to
 * a Durable Object keyed by `counterKey` — the interface is shaped for that
 * swap and no caller would change.
 */
export async function reserveMonthlyQuota(
  env: Env,
  input: ReserveInput,
  requestId: string,
): Promise<QuotaDecision> {
  const now = input.now ?? Date.now();
  const limit = VOICE_MONTHLY_LIMITS[input.tier];
  const resetsAt = monthResetsAt(now);

  // Premium is sold as included, so there is no monthly counter to keep — and
  // nothing to reject on. The per-minute limits and the kill switches still
  // apply; this only means no *monthly product* ceiling.
  if (limit === null) return { allowed: true, limit: null, used: 0, resetsAt };

  const key = counterKey(monthKey(now), input.hashedAppUserId);
  const used = await readUsed(env, key);

  if (used + 1 > limit) {
    log('info', 'monthly_quota_exhausted', requestId, { tier: input.tier, limit, used });
    return { allowed: false, limit, used, resetsAt };
  }

  const next = used + 1;
  await env.WORDPING_KV
    .put(key, String(next), { expirationTtl: monthlyCounterTtlSeconds(now) })
    .catch((error: unknown) => {
      // A dropped write loosens the quota by one unit rather than failing a
      // paid request. The OpenAI project budget remains the hard ceiling.
      log('warn', 'monthly_quota_write_failed', requestId, {
        tier: input.tier, ...redactError(error),
      });
    });

  return { allowed: true, limit, used: next, resetsAt };
}

/** Read-only view, for diagnostics or a future usage display. */
export async function readMonthlyQuota(
  env: Env,
  input: ReserveInput,
): Promise<QuotaDecision> {
  const now = input.now ?? Date.now();
  const limit = VOICE_MONTHLY_LIMITS[input.tier];
  const resetsAt = monthResetsAt(now);
  if (limit === null) return { allowed: true, limit: null, used: 0, resetsAt };
  const used = await readUsed(env, counterKey(monthKey(now), input.hashedAppUserId));
  return { allowed: used < limit, limit, used, resetsAt };
}
