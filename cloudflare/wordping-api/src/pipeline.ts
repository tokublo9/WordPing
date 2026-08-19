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
}

export interface ApprovedRequest<T> {
  body: T;
  tier: Tier;
  identity: CallerIdentity;
  limits: FeatureLimits;
  characters: number;
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
  let tier: Tier;
  try {
    const entitlement = await resolveEntitlement(env, resolved, identity.appUserId, response.requestId);
    tier = entitlement.tier;
    log('info', 'entitlement_resolved', response.requestId, {
      feature: spec.feature, tier, source: entitlement.source,
    });
  } catch (error) {
    if (error instanceof EntitlementServiceError) {
      // Fail closed. Granting access on a verification outage would make the
      // outage the cheapest way to get free AI.
      return reject('entitlement_service_unavailable', 503, { reason: error.reason }, { 'Retry-After': '30' });
    }
    throw error;
  }

  if (!tierSatisfies(tier, requiredTier)) {
    return reject('subscription_required', 403, { requiredTier });
  }

  const limits = runtime.limitsFor(spec.feature, tier);
  const characters = characterCount(spec.billableText(parsed.data));
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

  return { ok: true, value: { body: parsed.data, tier, identity, limits, characters } };
}
