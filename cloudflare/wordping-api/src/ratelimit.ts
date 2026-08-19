import type { Feature, FeatureLimits } from './config';
import type { Env } from './env';
import { log, redactError } from './log';

/**
 * KV-backed request and character budgets.
 *
 * Layered on top of entitlement verification, not instead of it: this exists to
 * bound the cost of a *legitimately entitled* caller who loops, and to slow down
 * someone replaying a stolen App User ID.
 *
 * KNOWN LIMITATION — KV is eventually consistent and offers no atomic
 * increment, so these counters are read-modify-write and a burst of truly
 * concurrent requests can overshoot a limit before the write propagates
 * (worst case roughly one extra request per colo). That is acceptable for cost
 * control at this scale; the hard ceiling is the OpenAI project budget. If exact
 * limits ever become necessary, move `consume` to a Durable Object keyed by
 * `bucketKey` — the interface below is deliberately shaped to allow that swap.
 */

const MINUTE_TTL_SECONDS = 120;
const DAY_TTL_SECONDS = 60 * 60 * 48;

/**
 * IP buckets are a coarse backstop against install-ID rotation. They are
 * deliberately loose because carrier NAT puts many unrelated users behind one
 * address, and a shared-IP false positive would break a paying customer.
 */
const IP_MULTIPLIER = 6;

export type LimitScope = 'install' | 'ip';

export type RateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: 'rate_limit_exceeded' | 'usage_limit_exceeded';
      scope: LimitScope;
      window: 'minute' | 'day';
      limit: number;
      retryAfterSeconds: number;
    };

function minuteWindow(now: number): string {
  return String(Math.floor(now / 60_000));
}

function dayWindow(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function secondsUntilNextMinute(now: number): number {
  return Math.max(1, 60 - Math.floor((now % 60_000) / 1000));
}

function secondsUntilNextDay(now: number): number {
  const startOfNextDay = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((startOfNextDay - now) / 1000));
}

function bucketKey(
  kind: 'req' | 'chars',
  window: 'minute' | 'day',
  feature: Feature,
  scope: LimitScope,
  hashedId: string,
  windowId: string,
): string {
  return `rl:${kind}:${window}:${feature}:${scope}:${hashedId}:${windowId}`;
}

async function readCounter(env: Env, key: string): Promise<number> {
  const raw = await env.WORDPING_KV.get(key).catch(() => null);
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export interface ConsumeInput {
  feature: Feature;
  /** Already-hashed identifiers. Raw install IDs and IPs never reach this module. */
  hashedInstallId: string;
  hashedIp: string;
  limits: FeatureLimits;
  /** Input size of this request, in Unicode code points. */
  characters: number;
  now?: number;
}

interface PlannedBucket {
  key: string;
  scope: LimitScope;
  window: 'minute' | 'day';
  kind: 'req' | 'chars';
  limit: number;
  increment: number;
  ttl: number;
  retryAfterSeconds: number;
}

function planBuckets(input: ConsumeInput, now: number): PlannedBucket[] {
  const { feature, hashedInstallId, hashedIp, limits, characters } = input;
  const minuteId = minuteWindow(now);
  const dayId = dayWindow(now);
  const minuteRetry = secondsUntilNextMinute(now);
  const dayRetry = secondsUntilNextDay(now);

  const scopes: readonly { scope: LimitScope; id: string; factor: number }[] = [
    { scope: 'install', id: hashedInstallId, factor: 1 },
    { scope: 'ip', id: hashedIp, factor: IP_MULTIPLIER },
  ];

  return scopes.flatMap(({ scope, id, factor }) => [
    {
      key: bucketKey('req', 'minute', feature, scope, id, minuteId),
      scope, window: 'minute' as const, kind: 'req' as const,
      limit: limits.maxRequestsPerMinute * factor,
      increment: 1, ttl: MINUTE_TTL_SECONDS, retryAfterSeconds: minuteRetry,
    },
    {
      key: bucketKey('req', 'day', feature, scope, id, dayId),
      scope, window: 'day' as const, kind: 'req' as const,
      limit: limits.maxRequestsPerDay * factor,
      increment: 1, ttl: DAY_TTL_SECONDS, retryAfterSeconds: dayRetry,
    },
    {
      key: bucketKey('chars', 'day', feature, scope, id, dayId),
      scope, window: 'day' as const, kind: 'chars' as const,
      limit: limits.maxCharsPerDay * factor,
      increment: characters, ttl: DAY_TTL_SECONDS, retryAfterSeconds: dayRetry,
    },
  ]);
}

/**
 * Checks every bucket, and only if all pass, records the usage.
 *
 * Usage is reserved up front rather than committed after a successful OpenAI
 * call. That deliberately over-counts a request that later fails upstream — the
 * conservative direction, since a failing request may still have been billed.
 */
export async function consume(
  env: Env,
  input: ConsumeInput,
  requestId: string,
): Promise<RateLimitDecision> {
  const now = input.now ?? Date.now();
  const planned = planBuckets(input, now);

  const counts = await Promise.all(planned.map(bucket => readCounter(env, bucket.key)));

  for (const [index, bucket] of planned.entries()) {
    const current = counts[index] ?? 0;
    if (current + bucket.increment > bucket.limit) {
      log('info', 'rate_limit_rejected', requestId, {
        feature: input.feature,
        scope: bucket.scope,
        window: bucket.window,
        kind: bucket.kind,
        limit: bucket.limit,
      });
      return {
        allowed: false,
        code: bucket.kind === 'chars' ? 'usage_limit_exceeded' : 'rate_limit_exceeded',
        scope: bucket.scope,
        window: bucket.window,
        limit: bucket.limit,
        retryAfterSeconds: bucket.retryAfterSeconds,
      };
    }
  }

  await Promise.all(
    planned.map((bucket, index) =>
      env.WORDPING_KV
        .put(bucket.key, String((counts[index] ?? 0) + bucket.increment), { expirationTtl: bucket.ttl })
        .catch((error: unknown) => {
          // A dropped counter write loosens the limit for one window rather than
          // failing a paid request. The OpenAI budget remains the hard ceiling.
          log('warn', 'rate_limit_write_failed', requestId, {
            feature: input.feature, scope: bucket.scope, window: bucket.window, ...redactError(error),
          });
        }),
    ),
  );

  return { allowed: true };
}
