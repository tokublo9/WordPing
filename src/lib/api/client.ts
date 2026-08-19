import Purchases from 'react-native-purchases';
import { getInstallId } from '../installId';
import { configureRevenueCat } from '../purchases';
import {
  AIRequestError,
  errorFromNetworkFailure,
  errorFromWorkerResponse,
  parseQuotaInfo,
  type MonthlyQuotaInfo,
} from './errors';

/**
 * The single network boundary for AI features.
 *
 * Nothing else in the app calls `fetch`. That is what makes the timeout
 * behaviour, the error classification, the identity headers and the "never log
 * user text" rule enforceable in one place rather than per call site.
 *
 * The base URL is public by design — it is the address of a proxy, not a
 * credential. No key of any kind is present in this file or anywhere else in
 * the client bundle.
 */

const BASE_URL = (process.env.EXPO_PUBLIC_WORDPING_API_BASE_URL ?? '').replace(/\/+$/u, '');

export const INSTALL_ID_HEADER = 'X-WordPing-Install-Id';
export const APP_USER_ID_HEADER = 'X-WordPing-App-User-Id';
export const REQUEST_ID_HEADER = 'X-WordPing-Request-Id';

const DEFAULT_TEXT_TIMEOUT_MS = 30_000;
const DEFAULT_SPEECH_TIMEOUT_MS = 60_000;

export function isApiConfigured(): boolean {
  return BASE_URL.length > 0;
}

if (__DEV__ && !isApiConfigured()) {
  console.error(
    'EXPO_PUBLIC_WORDPING_API_BASE_URL is not set — AI features will be unavailable. ' +
    'See cloudflare/wordping-api/README.md.',
  );
}

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * Resolved lazily, on the first AI request rather than at startup.
 *
 * Local vocabulary must never wait on RevenueCat, so nothing here runs during
 * bootstrap. Once resolved it is reused for the life of the process.
 */
let identityRequest: Promise<{ installId: string; appUserId: string }> | null = null;

async function resolveIdentity(): Promise<{ installId: string; appUserId: string }> {
  const [installId, configured] = await Promise.all([getInstallId(), configureRevenueCat()]);
  if (!configured) {
    // Without RevenueCat there is no identity to verify an entitlement against,
    // so the request would be refused server-side anyway. Failing here keeps
    // the round trip off the wire and gives the user the right message.
    throw new AIRequestError('subscription_required', { serverCode: 'revenuecat_unavailable' });
  }
  const appUserId = await Purchases.getAppUserID();
  return { installId, appUserId };
}

function getIdentity(): Promise<{ installId: string; appUserId: string }> {
  identityRequest ??= resolveIdentity().catch(error => {
    // Not cached on failure: a user who subscribes later must not be stuck
    // behind a permanently rejected promise.
    identityRequest = null;
    throw error;
  });
  return identityRequest;
}

/** Test hook, and used after a RevenueCat identity change. */
export function resetApiIdentity(): void {
  identityRequest = null;
}

// ── Request plumbing ─────────────────────────────────────────────────────────

/**
 * Combines the caller's cancellation signal with a timeout.
 *
 * `AbortSignal.any` is not available in every React Native runtime this app
 * targets, so the two are bridged manually.
 */
function withTimeout(timeoutMs: number, external?: AbortSignal): {
  signal: AbortSignal;
  cleanup(): void;
  timedOut(): boolean;
} {
  const controller = new AbortController();
  let expired = false;

  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);

  const forward = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forward);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', forward);
    },
    timedOut: () => expired,
  };
}

interface ErrorBody {
  error?: unknown;
  requestId?: unknown;
}

async function readErrorCode(
  response: Response,
): Promise<{ code?: string; requestId?: string; quota?: MonthlyQuotaInfo }> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return {};
  try {
    const body = (await response.json()) as ErrorBody & Record<string, unknown>;
    // Verified usage figures, when the Worker reports an exhausted quota. Only
    // a well-formed set is accepted; the UI never invents these numbers.
    const quota = body.error === 'monthly_api_limit_reached' ? parseQuotaInfo(body) : undefined;
    return {
      ...(typeof body.error === 'string' ? { code: body.error } : {}),
      ...(typeof body.requestId === 'string' ? { requestId: body.requestId } : {}),
      ...(quota !== undefined ? { quota } : {}),
    };
  } catch {
    return {};
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get('Retry-After');
  if (raw === null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function post(
  path: string,
  body: Record<string, unknown>,
  options: ApiRequestOptions,
  defaultTimeoutMs: number,
): Promise<Response> {
  if (!isApiConfigured()) {
    throw new AIRequestError('service_unavailable', { serverCode: 'api_not_configured' });
  }

  const identity = await getIdentity();
  const timeout = withTimeout(options.timeoutMs ?? defaultTimeoutMs, options.signal);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [INSTALL_ID_HEADER]: identity.installId,
        [APP_USER_ID_HEADER]: identity.appUserId,
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
  } catch (cause) {
    // An abort is ambiguous: distinguish our timeout from the caller's cancel.
    if (timeout.timedOut()) throw new AIRequestError('timeout');
    throw errorFromNetworkFailure(cause);
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    const { code, requestId, quota } = await readErrorCode(response);
    const retryAfter = retryAfterSeconds(response);
    if (__DEV__) {
      // Codes and identifiers only — never the request body or the user's text.
      console.warn('[api] request failed', {
        path,
        status: response.status,
        code,
        requestId: requestId ?? response.headers.get(REQUEST_ID_HEADER),
      });
    }
    throw errorFromWorkerResponse({
      status: response.status,
      ...(code !== undefined ? { code } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
      ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
      ...(quota !== undefined ? { quota } : {}),
    });
  }

  return response;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export type TextEndpoint = 'meaning' | 'breakdown' | 'translate' | 'examples';

/** Maps the app's action names onto the Worker's routes. */
const TEXT_PATHS: Readonly<Record<TextEndpoint, string>> = {
  meaning: '/v1/meaning',
  breakdown: '/v1/breakdown',
  translate: '/v1/translate',
  examples: '/v1/examples',
};

export async function postText(
  endpoint: TextEndpoint,
  text: string,
  langCode: string | undefined,
  options: ApiRequestOptions = {},
): Promise<string> {
  const response = await post(
    TEXT_PATHS[endpoint],
    { text, ...(langCode !== undefined ? { langCode } : {}) },
    options,
    DEFAULT_TEXT_TIMEOUT_MS,
  );

  const payload = (await response.json()) as { text?: unknown };
  if (typeof payload.text !== 'string' || payload.text.trim() === '') {
    throw new AIRequestError('generation_failed', { serverCode: 'invalid_response' });
  }
  return payload.text.trim();
}

export type VoiceEndpoint = 'card' | 'sample' | 'promo' | 'custom';

const VOICE_PATHS: Readonly<Record<VoiceEndpoint, string>> = {
  card: '/v1/voice/card',
  sample: '/v1/voice/sample',
  // Free promotional previews. Carries no user text — see promoVoiceSamples.ts.
  promo: '/v1/voice/promo',
  custom: '/v1/voice/custom',
};

export interface SpeechResult {
  audio: ArrayBuffer;
  requestId: string | null;
  cache: 'hit' | 'miss';
}

export async function postSpeech(
  endpoint: VoiceEndpoint,
  body: Record<string, unknown>,
  options: ApiRequestOptions = {},
): Promise<SpeechResult> {
  const response = await post(VOICE_PATHS[endpoint], body, options, DEFAULT_SPEECH_TIMEOUT_MS);

  const audio = await response.arrayBuffer();
  if (audio.byteLength === 0) {
    throw new AIRequestError('generation_failed', { serverCode: 'empty_audio' });
  }
  return {
    audio,
    requestId: response.headers.get(REQUEST_ID_HEADER),
    cache: response.headers.get('X-WordPing-Cache') === 'hit' ? 'hit' : 'miss',
  };
}
