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
export type EntitlementFailureReason =
  /** RevenueCat rejected our credentials. Our configuration is wrong, not theirs. */
  | 'unauthorized'
  | 'timeout'
  | 'upstream_error'
  | 'malformed_response';

/**
 * Authorization headers for the RevenueCat API.
 *
 * The secret is trimmed. `wrangler secret put` stores exactly what it is given,
 * and piping a value in (`echo "sk_..." | wrangler secret put`) appends a
 * newline — which would travel inside the header as `Bearer sk_...\n` and be
 * rejected with 401 even though the key itself is perfectly valid. Trimming
 * here means no call site can reintroduce that.
 */
function revenueCatHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY.trim()}`,
    Accept: 'application/json',
    // NO X-Platform HEADER.
    //
    // Sending `X-Platform: ios` tells RevenueCat the caller is an iOS *app*,
    // and it then refuses the request with
    //   403, code 7243: "Secret API keys should not be used in your app."
    // — a deliberate protection against shipping a secret key in a client.
    // This is server-to-server, so the header is both wrong and harmful. The
    // key was valid the whole time; this header was the rejection.
  };
}

/**
 * Classifies a RevenueCat response by status alone.
 *
 * ANY 2xx means our credentials were accepted. That includes 201, which
 * RevenueCat returns when the GET creates a subscriber it has not seen before —
 * the normal response for a new anonymous id, and a success.
 *
 * Only 401 and 403 mean unauthorized. Everything else is an upstream problem.
 */
export function classifyRevenueCatStatus(status: number): 'ok' | 'unauthorized' | 'unreachable' {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403) return 'unauthorized';
  // 404 is a definitive "no such subscriber", which still means the key worked.
  if (status === 404) return 'ok';
  return 'unreachable';
}

export class EntitlementServiceError extends Error {
  constructor(readonly reason: EntitlementFailureReason) {
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
      headers: revenueCatHeaders(env),
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

  const classification = classifyRevenueCatStatus(response.status);

  // 401/403 is RevenueCat rejecting *our* key, not a problem with the user or a
  // transient outage. Surfaced separately so it is not mistaken for a temporary
  // blip and retried forever — the operator has to fix the secret.
  if (classification === 'unauthorized') {
    log('error', 'entitlement_key_rejected', requestId, {
      status: response.status,
      upstream: await readUpstreamMessage(response),
    });
    throw new EntitlementServiceError('unauthorized');
  }

  if (classification === 'unreachable') {
    log('warn', 'entitlement_lookup_status', requestId, { status: response.status });
    throw new EntitlementServiceError('upstream_error');
  }

  // 404 means RevenueCat has never seen this ID. That is a definitive answer:
  // the caller has no purchases, so they are free.
  if (response.status === 404) return 'free';

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


export type EntitlementAuthStatus = 'ok' | 'unauthorized' | 'unreachable';

export interface EntitlementAuthProbe {
  status: EntitlementAuthStatus;
  /** The upstream HTTP status, so a failure is diagnosable without log access. */
  upstreamStatus: number | null;
  /**
   * RevenueCat's own explanation of a rejection, truncated.
   *
   * RevenueCat states *why* it refused — wrong key type, wrong project, missing
   * permission — and guessing at that from a bare status code wastes far more
   * time than showing it. Their error bodies describe the request, never our
   * credentials, and `sanitizeUpstreamMessage` strips anything key-shaped
   * before it is returned.
   */
  upstreamMessage?: string;
}

/** Removes anything key-shaped and caps the length. */
export function sanitizeUpstreamMessage(raw: string): string {
  return raw
    .replace(/\b(sk|appl|goog|test|pk)[-_][A-Za-z0-9]{6,}/gu, '[redacted]')
    .replace(/Bearer\s+\S+/giu, '[redacted]')
    .slice(0, 200);
}

async function readUpstreamMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown; code?: unknown };
    const parts = [
      typeof body.code === 'number' || typeof body.code === 'string' ? `code ${body.code}` : '',
      typeof body.message === 'string' ? body.message : '',
    ].filter(Boolean);
    return parts.length > 0 ? sanitizeUpstreamMessage(parts.join(': ')) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Checks whether our RevenueCat credentials are accepted, for /v1/health.
 *
 * Uses exactly the same headers as the real entitlement lookup, so the probe
 * cannot pass while live requests fail. Reports a status word and the upstream
 * HTTP code only — the key, the response body and any subscriber data stay
 * inside this function. The probe id belongs to nobody, so the check can never
 * read a real customer's record.
 */
export async function probeEntitlementAuth(
  env: Env,
  resolved: ResolvedEnv,
): Promise<EntitlementAuthProbe> {
  try {
    const response = await fetch(
      `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent('$RCAnonymousID:wordping-health-probe')}`,
      {
        method: 'GET',
        headers: revenueCatHeaders(env),
        signal: AbortSignal.timeout(resolved.revenueCatTimeoutMs),
      },
    );
    const status = classifyRevenueCatStatus(response.status);
    const upstreamMessage = status === 'ok' ? undefined : await readUpstreamMessage(response);
    return {
      status,
      upstreamStatus: response.status,
      ...(upstreamMessage !== undefined ? { upstreamMessage } : {}),
    };
  } catch {
    return { status: 'unreachable', upstreamStatus: null };
  }
}
