/**
 * Failure classification for AI requests.
 *
 * Two things are carried at once, deliberately:
 *
 *  - `kind` is the new, precise classification the spec calls for, and is what
 *    new code should branch on.
 *  - `message` keeps the legacy string codes that the existing screens already
 *    match against (`plan_required`, `quota_exceeded`, and so on), so migrating
 *    the transport did not require rewriting every error branch in the UI.
 *
 * This module is free of react-native and expo imports so it can be tested
 * directly.
 */

export type AIErrorKind =
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'subscription_required'
  | 'rate_limited'
  | 'usage_limited'
  | 'invalid_input'
  | 'service_unavailable'
  | 'generation_failed'
  | 'monthly_limit_reached'
  /** Purchase status could not be verified. Offer Retry + Restore Purchases. */
  | 'entitlement_unverified'
  /** The speech service itself is misconfigured. Not the user's problem. */
  | 'not_configured';

/** Legacy codes the UI matches on. Also used as `Error.message`. */
export type LegacyErrorCode =
  | 'plan_required'
  | 'rate_limit_exceeded'
  | 'usage_limit_exceeded'
  | 'quota_exceeded'
  | 'input_too_long'
  | 'invalid_request'
  | 'input_empty'
  | 'service_unavailable'
  | 'monthly_api_limit_reached'
  | 'entitlement_unverified'
  | 'not_configured';

const LEGACY_BY_KIND: Readonly<Record<AIErrorKind, LegacyErrorCode>> = {
  offline: 'service_unavailable',
  timeout: 'service_unavailable',
  cancelled: 'service_unavailable',
  subscription_required: 'plan_required',
  rate_limited: 'rate_limit_exceeded',
  usage_limited: 'usage_limit_exceeded',
  invalid_input: 'invalid_request',
  service_unavailable: 'service_unavailable',
  generation_failed: 'service_unavailable',
  monthly_limit_reached: 'monthly_api_limit_reached',
  entitlement_unverified: 'entitlement_unverified',
  not_configured: 'not_configured',
};

/**
 * Which rate-limit bucket rejected the request.
 *
 * The Worker distinguishes a short burst from an exhausted daily allowance
 * (`ratelimit.ts` plans a `minute` and a `day` bucket) and already reports it in
 * the error body, but both arrive under the same `rate_limit_exceeded` code. The
 * UI needs them apart to say "wait a few minutes" versus "come back tomorrow".
 */
export type RateLimitWindow = 'minute' | 'day';

export function parseRateLimitWindow(value: unknown): RateLimitWindow | undefined {
  return value === 'minute' || value === 'day' ? value : undefined;
}

export interface AIRequestErrorOptions {
  requestId?: string;
  retryAfterSeconds?: number;
  /** Present on rate_limit_exceeded / usage_limit_exceeded. */
  limitWindow?: RateLimitWindow;
  /** The raw code the Worker returned, for diagnostics. Never user-facing. */
  serverCode?: string;
  /** Monthly quota figures, present only on monthly_api_limit_reached. */
  quota?: MonthlyQuotaInfo;
  /**
   * Overrides the legacy `message`. Used for the few server codes the UI
   * already handles specially, such as `input_too_long`.
   */
  legacyCode?: LegacyErrorCode;
}

export class AIRequestError extends Error {
  readonly kind: AIErrorKind;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly limitWindow?: RateLimitWindow;
  readonly serverCode?: string;
  readonly quota?: MonthlyQuotaInfo;

  constructor(kind: AIErrorKind, options: AIRequestErrorOptions = {}) {
    super(options.legacyCode ?? LEGACY_BY_KIND[kind]);
    this.name = 'AIRequestError';
    this.kind = kind;
    if (options.requestId !== undefined) this.requestId = options.requestId;
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
    if (options.limitWindow !== undefined) this.limitWindow = options.limitWindow;
    if (options.serverCode !== undefined) this.serverCode = options.serverCode;
    if (options.quota !== undefined) this.quota = options.quota;
  }
}

/** Every error code the Worker can return, mapped to a client classification. */
const KIND_BY_SERVER_CODE: Readonly<Record<string, AIErrorKind>> = {
  invalid_request: 'invalid_input',
  invalid_voice: 'invalid_input',
  input_too_long: 'invalid_input',
  unsupported_media_type: 'invalid_input',
  payload_too_large: 'invalid_input',
  missing_install_id: 'invalid_input',
  subscription_required: 'subscription_required',
  rate_limit_exceeded: 'rate_limited',
  usage_limit_exceeded: 'usage_limited',
  monthly_api_limit_reached: 'monthly_limit_reached',
  quota_exceeded: 'rate_limited',
  feature_disabled: 'service_unavailable',
  // These two used to collapse into a generic outage message, which is what
  // made a rejected RevenueCat key look like a speech service failure.
  entitlement_verification_failed: 'entitlement_unverified',
  entitlement_service_unavailable: 'entitlement_unverified',
  service_not_configured: 'not_configured',
  method_not_allowed: 'service_unavailable',
  not_found: 'service_unavailable',
  internal_error: 'service_unavailable',
  upstream_failed: 'generation_failed',
  request_timeout: 'timeout',
};

function kindForStatus(status: number): AIErrorKind {
  if (status === 403) return 'subscription_required';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 413 || status === 415) return 'invalid_input';
  if (status === 504) return 'timeout';
  if (status === 502) return 'generation_failed';
  return 'service_unavailable';
}

/** Verified usage figures returned by the Worker when a quota is exhausted. */
export interface MonthlyQuotaInfo {
  limit: number;
  used: number;
  /** ISO-8601 start of the next UTC month. */
  resetsAt: string;
  /** The tier the Worker verified, so the UI can offer the right next step. */
  tier: 'free' | 'basic' | 'premium';
}

export function parseQuotaInfo(body: Record<string, unknown>): MonthlyQuotaInfo | undefined {
  const { limit, used, resetsAt, tier } = body;
  if (typeof limit !== 'number' || typeof used !== 'number') return undefined;
  if (typeof resetsAt !== 'string' || Number.isNaN(Date.parse(resetsAt))) return undefined;
  if (tier !== 'free' && tier !== 'basic' && tier !== 'premium') return undefined;
  return { limit, used, resetsAt, tier };
}

export interface WorkerErrorInput {
  status: number;
  /** Parsed `error` field, when the response carried a JSON body. */
  code?: string;
  requestId?: string;
  retryAfterSeconds?: number;
  limitWindow?: RateLimitWindow;
  quota?: MonthlyQuotaInfo;
}

/**
 * Builds an error from a non-2xx Worker response.
 *
 * The declared code wins when it is one we know; otherwise the status is used,
 * so an unrecognised future code still classifies sensibly instead of
 * collapsing to a generic failure.
 */
export function errorFromWorkerResponse(input: WorkerErrorInput): AIRequestError {
  const kind = (input.code !== undefined ? KIND_BY_SERVER_CODE[input.code] : undefined)
    ?? kindForStatus(input.status);

  return new AIRequestError(kind, {
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    ...(input.retryAfterSeconds !== undefined ? { retryAfterSeconds: input.retryAfterSeconds } : {}),
    ...(input.limitWindow !== undefined ? { limitWindow: input.limitWindow } : {}),
    ...(input.code !== undefined ? { serverCode: input.code } : {}),
    // The UI turns this one into "shorten your text" rather than a generic
    // validation message, so it keeps its own legacy code.
    ...(input.code === 'input_too_long' ? { legacyCode: 'input_too_long' as const } : {}),
    ...(input.quota !== undefined ? { quota: input.quota } : {}),
  });
}

/**
 * Classifies a thrown fetch failure.
 *
 * React Native surfaces every transport problem as `TypeError: Network request
 * failed`, so "offline" here means "could not reach the server" and covers DNS,
 * captive portals and a dead API alike.
 */
export function errorFromNetworkFailure(cause: unknown): AIRequestError {
  if (cause instanceof Error) {
    if (cause.name === 'AbortError') return new AIRequestError('cancelled');
    if (cause.name === 'TimeoutError') return new AIRequestError('timeout');
    if (cause instanceof TypeError) return new AIRequestError('offline');
  }
  return new AIRequestError('service_unavailable');
}

/** i18n keys for each classification. Used by screens that show an alert. */
export const MESSAGE_KEY_BY_KIND: Readonly<Record<AIErrorKind, string>> = {
  offline: 'err_offline',
  timeout: 'err_timeout',
  cancelled: 'err_cancelled',
  subscription_required: 'err_plan_required_speech',
  rate_limited: 'err_rate_limited',
  usage_limited: 'err_usage_limited',
  invalid_input: 'err_input_too_long',
  service_unavailable: 'ai_service_unavailable_msg',
  generation_failed: 'err_generation_failed',
  monthly_limit_reached: 'err_voice_limit_basic',
  entitlement_unverified: 'err_entitlement_unverified',
  not_configured: 'err_service_not_configured',
};

export function isAIRequestError(value: unknown): value is AIRequestError {
  return value instanceof AIRequestError;
}
