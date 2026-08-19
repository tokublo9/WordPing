import type { ResolvedEnv } from './env';

/**
 * Canonical error codes. The client maps these to user-facing copy in
 * src/lib/api/errors.ts — keep the two lists in sync.
 */
export const ERROR_CODES = [
  'invalid_request',
  'invalid_voice',
  'input_too_long',
  'unsupported_media_type',
  'payload_too_large',
  'method_not_allowed',
  'not_found',
  'missing_install_id',
  'subscription_required',
  'rate_limit_exceeded',
  'usage_limit_exceeded',
  'monthly_api_limit_reached',
  'quota_exceeded',
  'feature_disabled',
  'entitlement_verification_failed',
  'service_not_configured',
  'upstream_failed',
  'request_timeout',
  'internal_error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const REQUEST_ID_HEADER = 'X-WordPing-Request-Id';

/**
 * Applied to every response, success or failure. This is an API that returns
 * JSON and audio only; locking the browser down costs nothing and removes a
 * whole class of content-sniffing and framing issues.
 */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Cache-Control': 'no-store',
};

const EXPOSED_HEADERS = [
  REQUEST_ID_HEADER,
  'X-WordPing-Cache',
  'Retry-After',
  'X-RateLimit-Remaining',
].join(', ');

/**
 * CORS is configured only for the Expo dev-server origins that actually need
 * it. Native builds send no Origin at all. This is never an authentication
 * boundary — entitlement verification is what protects the endpoints.
 */
export function corsHeaders(origin: string | null, resolved: ResolvedEnv): Record<string, string> {
  if (!origin || !resolved.allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-wordping-install-id, x-wordping-app-user-id',
    'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export interface ResponseContext {
  requestId: string;
  origin: string | null;
  resolved: ResolvedEnv;
}

function baseHeaders(context: ResponseContext): Record<string, string> {
  return {
    ...SECURITY_HEADERS,
    ...corsHeaders(context.origin, context.resolved),
    [REQUEST_ID_HEADER]: context.requestId,
  };
}

export function jsonResponse(
  context: ResponseContext,
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...baseHeaders(context),
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export interface ErrorDetails {
  /** Optional machine-readable context. Must never contain user text. */
  readonly [key: string]: string | number | boolean | undefined;
}

/**
 * The only way this Worker produces an error body. Always
 * `{ error, requestId, ... }`; never a stack trace, never an upstream message.
 */
export function errorResponse(
  context: ResponseContext,
  code: ErrorCode,
  status: number,
  details: ErrorDetails = {},
  extraHeaders: Record<string, string> = {},
): Response {
  const body: Record<string, unknown> = { error: code, requestId: context.requestId };
  for (const [key, value] of Object.entries(details)) {
    if (value !== undefined) body[key] = value;
  }
  return jsonResponse(context, body, status, extraHeaders);
}

/**
 * Streams an upstream audio body through untouched. The upstream
 * `ReadableStream` is handed straight to the `Response`, so a large clip is
 * never buffered in the isolate.
 */
export function audioResponse(
  context: ResponseContext,
  body: BodyInit,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...baseHeaders(context),
      ...extraHeaders,
      'Content-Type': contentType,
    },
  });
}

export function preflightResponse(context: ResponseContext): Response {
  return new Response(null, { status: 204, headers: baseHeaders(context) });
}
