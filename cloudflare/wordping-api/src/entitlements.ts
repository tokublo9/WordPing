import {
  ENTITLEMENT_CACHE_TTL_SECONDS,
  ENTITLEMENT_NEGATIVE_CACHE_TTL_SECONDS,
  REVENUECAT_API_BASE,
  type Tier,
} from './config';
import type { Env, ResolvedEnv } from './env';
import { privacyHash } from './identity';
import { log, redactError } from './log';

/**
 * Server-side entitlement verification.
 *
 * WordPing has no user accounts, so the client sends its RevenueCat App User ID
 * and nothing else. A client-asserted `isPremium` flag is never read anywhere in
 * this Worker — the tier below is always the result of a RevenueCat API lookup
 * (or of a cache entry that was itself produced by one).
 */

/** RevenueCat is unreachable or erroring. Distinct from "verified as free". */
export class EntitlementServiceError extends Error {
  constructor(readonly reason: 'timeout' | 'upstream_error' | 'malformed_response') {
    super(`entitlement_service_${reason}`);
    this.name = 'EntitlementServiceError';
  }
}

interface RevenueCatEntitlement {
  expires_date?: string | null;
}

interface RevenueCatSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlement>;
  };
}

function isActive(entitlement: RevenueCatEntitlement | undefined, now: number): boolean {
  if (!entitlement) return false;
  // A null/absent expiry is a non-expiring (lifetime) entitlement.
  if (entitlement.expires_date == null) return true;
  const expiresAt = Date.parse(entitlement.expires_date);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function tierFromSubscriber(
  payload: RevenueCatSubscriberResponse,
  resolved: Pick<ResolvedEnv, 'entitlementBasic' | 'entitlementPremium'>,
  now: number = Date.now(),
): Tier {
  const entitlements = payload.subscriber?.entitlements ?? {};
  if (isActive(entitlements[resolved.entitlementPremium], now)) return 'premium';
  if (isActive(entitlements[resolved.entitlementBasic], now)) return 'basic';
  return 'free';
}

function cacheKey(hashedUser: string): string {
  return `entitlement:${hashedUser}`;
}

async function fetchTier(
  env: Env,
  resolved: ResolvedEnv,
  appUserId: string,
  requestId: string,
): Promise<Tier> {
  const url = `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`,
        Accept: 'application/json',
        'X-Platform': 'ios',
      },
      signal: AbortSignal.timeout(resolved.revenueCatTimeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    log('warn', 'entitlement_lookup_failed', requestId, {
      reason: timedOut ? 'timeout' : 'network',
      ...redactError(error),
    });
    throw new EntitlementServiceError(timedOut ? 'timeout' : 'upstream_error');
  }

  // 404 means RevenueCat has never seen this ID. That is a definitive answer:
  // the caller has no purchases, so they are free.
  if (response.status === 404) return 'free';

  if (!response.ok) {
    log('warn', 'entitlement_lookup_status', requestId, { status: response.status });
    throw new EntitlementServiceError('upstream_error');
  }

  let payload: RevenueCatSubscriberResponse;
  try {
    payload = (await response.json()) as RevenueCatSubscriberResponse;
  } catch (error) {
    log('warn', 'entitlement_response_unparsable', requestId, redactError(error));
    throw new EntitlementServiceError('malformed_response');
  }
  if (!payload.subscriber) throw new EntitlementServiceError('malformed_response');

  return tierFromSubscriber(payload, resolved);
}

export interface EntitlementResult {
  tier: Tier;
  source: 'cache' | 'revenuecat' | 'dev-bypass';
}

/**
 * Resolves the caller's tier, preferring a short-lived KV cache.
 *
 * Successful lookups are cached for 5 minutes to keep RevenueCat off the hot
 * path. A verified-free result is cached for only 30 seconds so a purchase or
 * restore takes effect almost immediately. Service failures are never cached at
 * all — they raise, and the caller turns that into a 503.
 */
export async function resolveEntitlement(
  env: Env,
  resolved: ResolvedEnv,
  appUserId: string,
  requestId: string,
): Promise<EntitlementResult> {
  if (resolved.devBypassEntitlements) {
    log('warn', 'entitlement_dev_bypass', requestId, {});
    return { tier: 'premium', source: 'dev-bypass' };
  }

  const hashedUser = await privacyHash(env, 'rcuser', appUserId);
  const key = cacheKey(hashedUser);

  const cached = await env.WORDPING_KV.get(key).catch(() => null);
  if (cached === 'free' || cached === 'basic' || cached === 'premium') {
    return { tier: cached, source: 'cache' };
  }

  const tier = await fetchTier(env, resolved, appUserId, requestId);

  const ttl = tier === 'free' ? ENTITLEMENT_NEGATIVE_CACHE_TTL_SECONDS : ENTITLEMENT_CACHE_TTL_SECONDS;
  // Cache write failures are non-fatal: the next request simply re-verifies.
  await env.WORDPING_KV.put(key, tier, { expirationTtl: ttl }).catch(error => {
    log('warn', 'entitlement_cache_write_failed', requestId, redactError(error));
  });

  return { tier, source: 'revenuecat' };
}

const TIER_RANK: Readonly<Record<Tier, number>> = { free: 0, basic: 1, premium: 2 };

export function tierSatisfies(actual: Tier, required: Tier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}
