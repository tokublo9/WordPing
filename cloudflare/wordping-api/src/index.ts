import { resolveEnv, type Env } from './env';
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
  type ErrorCode,
  type ResponseContext,
} from './http';
import { log, redactError } from './log';
import { OpenAIError } from './openai';
import type { GuardContext } from './pipeline';
import { loadRuntimeConfig } from './runtimeConfig';
import { handleTextAction } from './routes/text';
import { handleVoiceCard, handleVoiceCustom, handleVoiceSample } from './routes/voice';

/**
 * WordPing AI proxy.
 *
 * Exists for exactly one reason: the OpenAI key must never ship inside the Expo
 * bundle. Everything else here — entitlement verification, allowlists, rate
 * limits, kill switches — protects that key from being turned into someone
 * else's free API.
 */

type RouteHandler = (context: GuardContext) => Promise<Response>;

const ROUTES: Readonly<Record<string, RouteHandler>> = {
  '/v1/voice/card': handleVoiceCard,
  '/v1/voice/sample': handleVoiceSample,
  '/v1/voice/custom': handleVoiceCustom,
  '/v1/meaning': context => handleTextAction(context, 'meaning'),
  '/v1/breakdown': context => handleTextAction(context, 'breakdown'),
  '/v1/translate': context => handleTextAction(context, 'translation'),
  '/v1/examples': context => handleTextAction(context, 'example'),
};

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

/** Maps an upstream OpenAI failure onto the client-facing contract. */
function openAIErrorResponse(response: ResponseContext, error: OpenAIError): Response {
  const { failure } = error;
  if (failure.kind === 'timeout') {
    return errorResponse(response, 'request_timeout', 504);
  }
  if (failure.kind === 'rate_limited') {
    // OpenAI's own throttle, not ours. Surfaced separately so the app can tell
    // the user this is temporary rather than a plan problem.
    return errorResponse(response, 'quota_exceeded', 429, {}, { 'Retry-After': '30' });
  }
  return errorResponse(response, 'upstream_failed', 502);
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const requestId = crypto.randomUUID();
  const origin = request.headers.get('Origin');
  const resolvedBase = resolveEnv(env);

  // The dev bypass is honoured only when the Worker is actually being reached
  // over localhost. Left switched on by accident in a deployed environment it
  // would hand out free premium, so it is neutralised rather than trusted.
  const isLocal = LOCAL_HOSTS.has(url.hostname);
  if (resolvedBase.devBypassEntitlements && !isLocal) {
    log('error', 'dev_bypass_ignored_in_deployment', requestId, { hostname: url.hostname });
  }
  const resolved = { ...resolvedBase, devBypassEntitlements: resolvedBase.devBypassEntitlements && isLocal };

  const response: ResponseContext = { requestId, origin, resolved };

  if (request.method === 'OPTIONS') return preflightResponse(response);

  if (url.pathname === '/v1/health') {
    if (request.method !== 'GET') {
      return errorResponse(response, 'method_not_allowed', 405, {}, { Allow: 'GET' });
    }
    // Reports readiness, never the values themselves.
    return jsonResponse(response, {
      ok: true,
      requestId,
      openAIKeyConfigured: Boolean(env.OPENAI_API_KEY),
      revenueCatKeyConfigured: Boolean(env.REVENUECAT_SECRET_API_KEY),
      rateLimitSaltConfigured: Boolean(env.RATE_LIMIT_SALT),
    });
  }

  const handler = ROUTES[url.pathname];
  if (!handler) return errorResponse(response, 'not_found', 404);

  if (!env.OPENAI_API_KEY || !env.REVENUECAT_SECRET_API_KEY) {
    // Which one is missing is an operator detail; the client learns only that
    // the service is not usable.
    log('error', 'missing_required_secret', requestId, {
      openAIKeyConfigured: Boolean(env.OPENAI_API_KEY),
      revenueCatKeyConfigured: Boolean(env.REVENUECAT_SECRET_API_KEY),
    });
    return errorResponse(response, 'internal_error', 500);
  }

  const startedAtMs = Date.now();
  try {
    const runtime = await loadRuntimeConfig(env, requestId);
    const result = await handler({ request, env, ctx, resolved, runtime, response });
    log('info', 'request_complete', requestId, {
      path: url.pathname, status: result.status, durationMs: Date.now() - startedAtMs,
    });
    return result;
  } catch (error) {
    if (error instanceof OpenAIError) return openAIErrorResponse(response, error);
    // Anything unhandled becomes a bare 500. The stack stays in the Worker log
    // and never reaches the client.
    log('error', 'unhandled_exception', requestId, {
      path: url.pathname, ...redactError(error),
    });
    return errorResponse(response, 'internal_error', 500);
  }
}

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>;

export type { ErrorCode };
