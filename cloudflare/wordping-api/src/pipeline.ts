import type { ZodType } from 'zod';
import {
  FEATURE_TIER,
  MAX_REQUEST_BODY_BYTES,
  type Feature,
  type FeatureLimits,
  type Tier,
} from './config';
import { EntitlementServiceError, resolveEntitlement, tierSatisfies } from './entitlements';
import type { Env, ResolvedEnv } from './env';
import { errorResponse, type ErrorCode, type ResponseContext } from './http';
import { clientIp, privacyHash, readIdentity, type CallerIdentity } from './identity';
import { log } from './log';
import { consume } from './ratelimit';
import { reserveMonthlyQuota } from './monthlyQuota';
import { isVoiceQuotaFeature } from './planLimits';
import {
  BASIC_MONTHLY_LIMIT_SCENARIO,
  seedLocalBasicMonthlyLimit,
  type LocalAiVoiceTestScenario,
} from './localDevelopment';
import { characterCount } from './schemas';
import type { RuntimeConfig } from './runtimeConfig';

/**
 * The gate every billable endpoint passes through.
 *
 * Ordered cheapest-and-most-protective first, so an abusive or malformed
 * request is rejected before it costs anything: shape checks need no I/O, the
 * kill switch is a cached KV read, and only then do we spend a RevenueCat
 * lookup. The OpenAI call happens strictly after all of it.
 */

export interface FeatureRequestSpec<T> {
  feature: Feature;
  schema: ZodType<T>;
  /**
   * Extra validation that must run before any quota is consumed — currently the
   * voice allowlist, so an unsupported voice does not burn a request budget.
   */
  validate?(body: T): ErrorCode | null;
  /** Text charged against the caller's character budget. */
  billableText(body: T): string;
  /**
   * Defer the monthly quota reservation to the route.
   *
   * Set for voice previews, which may be answered from the shared KV cache
   * without reaching OpenAI. Those cost nothing and must not consume a unit, so
   * the route reserves only after it knows it has a cache miss.
   */
  deferQuota?: boolean;
}

export interface ApprovedRequest<T> {
  body: T;
  tier: Tier;
  identity: CallerIdentity;
  limits: FeatureLimits;
  characters: number;
  /**
   * Reserves one High-Quality AI Voice generation against the caller's monthly
   * allowance. A no-op for routes outside VOICE_QUOTA_FEATURES and for tiers
   * with no monthly quota. Already called for you unless the spec set
   * `deferQuota`. Returns an error Response when the allowance is exhausted, or
   * null when the request may proceed. Calling it twice charges twice.
   */
  reserveQuota(): Promise<Response | null>;
}

export type GuardResult<T> =
  | { ok: true; value: ApprovedRequest<T> }
  | { ok: false; response: Response };

export interface GuardContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  resolved: ResolvedEnv;
  runtime: RuntimeConfig;
  response: ResponseContext;
  localAiVoiceTestScenario: LocalAiVoiceTestScenario | null;
}

function contentLengthExceeded(request: Request): boolean {
  const raw = request.headers.get('Content-Length');
  if (raw === null) return false;
  const length = Number(raw);
  return Number.isFinite(length) && length > MAX_REQUEST_BODY_BYTES;
}

export async function guard<T>(
  context: GuardContext,
  spec: FeatureRequestSpec<T>,
): Promise<GuardResult<T>> {
  const { request, env, resolved, runtime, response } = context;
  const reject = (code: ErrorCode, status: number, details = {}, headers = {}): GuardResult<T> => ({
    ok: false,
    response: errorResponse(response, code, status, details, headers),
  });

  if (request.method !== 'POST') {
    return reject('method_not_allowed', 405, {}, { Allow: 'POST, OPTIONS' });
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return reject('unsupported_media_type', 415);
  }

  // Checked from the header first so an oversized upload is refused without
  // being read into memory.
  if (contentLengthExceeded(request)) {
    return reject('payload_too_large', 413, { maxBytes: MAX_REQUEST_BODY_BYTES });
  }

  const identity = readIdentity(request);
  if (!identity) return reject('missing_install_id', 400);

  if (runtime.disabledFeatures.has(spec.feature)) {
    log('warn', 'feature_disabled', response.requestId, { feature: spec.feature });
    return reject('feature_disabled', 503, { feature: spec.feature }, { 'Retry-After': '300' });
  }

  const raw = await request.text();
  // Second size check: Content-Length is client-supplied and may be absent or
  // wrong, so the real body is measured too.
  if (new Blob([raw]).size > MAX_REQUEST_BODY_BYTES) {
    return reject('payload_too_large', 413, { maxBytes: MAX_REQUEST_BODY_BYTES });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return reject('invalid_request', 400, { reason: 'malformed_json' });
  }

  const parsed = spec.schema.safeParse(parsedJson);
  if (!parsed.success) {
    // Field names only. Zod echoes offending values in `message`, which would
    // put user text into the response and the logs.
    const fields = parsed.error.issues
      .map(issue => issue.path.join('.') || '(root)')
      .slice(0, 5)
      .join(',');
    log('info', 'request_validation_failed', response.requestId, {
      feature: spec.feature, fields,
    });
    return reject('invalid_request', 400, { fields });
  }

  const extraError = spec.validate?.(parsed.data);
  if (extraError) return reject(extraError, 400);

  const requiredTier = FEATURE_TIER[spec.feature];

  // A feature declared 'free' in FEATURE_TIER needs no entitlement, so the
  // RevenueCat lookup is skipped rather than performed and ignored. This is a
  // server-side constant keyed on the route — there is no request field that
  // can reach it, and no route sets it except the two fixed promo clips.
  // Skipping also means a RevenueCat outage cannot take the promo previews
  // down, which is the point of having them.
  if (requiredTier === 'free') {
    return approve(context, spec, parsed.data, 'free', identity);
  }

  let tier: Tier;
  if (context.localAiVoiceTestScenario === BASIC_MONTHLY_LIMIT_SCENARIO) {
    tier = 'basic';
    log('info', 'local_entitlement_mocked', response.requestId, {
      feature: spec.feature, tier,
    });
  } else {
    try {
      const entitlement = await resolveEntitlement(env, resolved, identity.appUserId, response.requestId);
      tier = entitlement.tier;
      log('info', 'entitlement_resolved', response.requestId, {
        feature: spec.feature, tier, source: entitlement.source,
      });
    } catch (error) {
      if (!(error instanceof EntitlementServiceError)) throw error;
      // Fail closed either way — granting access on a verification failure would
      // make that failure the cheapest route to free AI — but say which it is.
      // A rejected key is our misconfiguration and retrying will never fix it;
      // a timeout or upstream error genuinely is worth retrying.
      if (error.reason === 'unauthorized') {
        return reject('service_not_configured', 503, { reason: 'entitlement_credentials' });
      }
      return reject(
        'entitlement_verification_failed',
        503,
        { reason: error.reason },
        { 'Retry-After': '30' },
      );
    }
  }

  if (!tierSatisfies(tier, requiredTier)) {
    return reject('subscription_required', 403, { requiredTier });
  }

  return approve(context, spec, parsed.data, tier, identity);
}

/**
 * Everything after the tier is known: input cap, rate limits, monthly quota.
 *
 * Shared by the entitlement-checked routes and the free promo route so the
 * protective half of the pipeline cannot be bypassed by skipping RevenueCat —
 * only the entitlement step itself is skipped, never the limits.
 */
async function approve<T>(
  context: GuardContext,
  spec: FeatureRequestSpec<T>,
  body: T,
  tier: Tier,
  identity: CallerIdentity,
): Promise<GuardResult<T>> {
  const { request, env, runtime, response } = context;
  const reject = (code: ErrorCode, status: number, details = {}, headers = {}): GuardResult<T> => ({
    ok: false,
    response: errorResponse(response, code, status, details, headers),
  });

  const limits = runtime.limitsFor(spec.feature, tier);
  const characters = characterCount(spec.billableText(body));
  if (characters > limits.maxCharsPerRequest) {
    return reject('input_too_long', 400, { maxCharacters: limits.maxCharsPerRequest });
  }

  const [hashedInstallId, hashedIp] = await Promise.all([
    privacyHash(env, 'install', identity.installId),
    privacyHash(env, 'ip', clientIp(request)),
  ]);

  const decision = await consume(
    env,
    { feature: spec.feature, hashedInstallId, hashedIp, limits, characters },
    response.requestId,
  );
  if (!decision.allowed) {
    return reject(
      decision.code,
      429,
      { scope: decision.scope, window: decision.window, limit: decision.limit },
      { 'Retry-After': String(decision.retryAfterSeconds) },
    );
  }

  // Monthly allowance last: a request rejected by validation, entitlement or
  // the per-minute limiter must not consume a generation.
  //
  // Only word-card High-Quality AI Voice generation is metered. Voice-picker
  // previews and promotional previews are deliberately absent from
  // VOICE_QUOTA_FEATURES, so neither spends the Basic monthly allowance.
  const meteredForVoice = isVoiceQuotaFeature(spec.feature);
  const hashedAppUserId = meteredForVoice
    ? await privacyHash(env, 'rcuser', identity.appUserId)
    : '';
  const reserveQuota = async (): Promise<Response | null> => {
    if (!meteredForVoice) return null;
    if (context.localAiVoiceTestScenario === BASIC_MONTHLY_LIMIT_SCENARIO) {
      await seedLocalBasicMonthlyLimit(env, hashedAppUserId);
    }
    const quota = await reserveMonthlyQuota(
      env,
      { tier, hashedAppUserId },
      response.requestId,
    );
    if (quota.allowed) return null;
    return errorResponse(response, 'monthly_api_limit_reached', 429, {
      // limit is never null on this path: a tier with no monthly quota is
      // always allowed, so it cannot reach the rejection branch.
      limit: quota.limit ?? 0,
      used: quota.used,
      resetsAt: quota.resetsAt,
      tier,
    });
  };

  if (spec.deferQuota !== true) {
    const exhausted = await reserveQuota();
    if (exhausted) return { ok: false, response: exhausted };
  }

  return {
    ok: true,
    value: { body, tier, identity, limits, characters, reserveQuota },
  };
}
