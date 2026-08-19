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
  | 'generation_failed';

/** Legacy codes the UI matches on. Also used as `Error.message`. */
export type LegacyErrorCode =
  | 'plan_required'
  | 'rate_limit_exceeded'
  | 'usage_limit_exceeded'
  | 'quota_exceeded'
  | 'input_too_long'
  | 'invalid_request'
  | 'input_empty'
  | 'service_unavailable';

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
};

export interface AIRequestErrorOptions {
  requestId?: string;
  retryAfterSeconds?: number;
  /** The raw code the Worker returned, for diagnostics. Never user-facing. */
  serverCode?: string;
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
  readonly serverCode?: string;

  constructor(kind: AIErrorKind, options: AIRequestErrorOptions = {}) {
    super(options.legacyCode ?? LEGACY_BY_KIND[kind]);
    this.name = 'AIRequestError';
    this.kind = kind;
    if (options.requestId !== undefined) this.requestId = options.requestId;
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
    if (options.serverCode !== undefined) this.serverCode = options.serverCode;
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
  quota_exceeded: 'rate_limited',
  feature_disabled: 'service_unavailable',
  entitlement_service_unavailable: 'service_unavailable',
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

export interface WorkerErrorInput {
  status: number;
  /** Parsed `error` field, when the response carried a JSON body. */
  code?: string;
  requestId?: string;
  retryAfterSeconds?: number;
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
    ...(input.code !== undefined ? { serverCode: input.code } : {}),
    // The UI turns this one into "shorten your text" rather than a generic
    // validation message, so it keeps its own legacy code.
    ...(input.code === 'input_too_long' ? { legacyCode: 'input_too_long' as const } : {}),
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
};

export function isAIRequestError(value: unknown): value is AIRequestError {
  return value instanceof AIRequestError;
}
