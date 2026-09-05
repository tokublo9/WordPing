import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import { getInstallId } from '../installId';
import { configureRevenueCat } from '../purchases';
import { configureAIConsentStorage, requireAIConsent } from '../aiConsent';
import { requireAIEntitlement } from '../aiEntitlement';
import { isPromoSampleId } from '../promoVoiceSamples';
import {
  AIRequestError,
  errorFromNetworkFailure,
  errorFromWorkerResponse,
  parseQuotaInfo,
  parseRateLimitWindow,
  type MonthlyQuotaInfo,
  type RateLimitWindow,
} from './errors';
import {
  LOCAL_AI_VOICE_SCENARIO,
  getLocalAiVoiceTestScenario,
  LOCAL_AI_VOICE_APP_USER_ID,
} from '../../dev/localAiVoiceScenario';
import {
  parseVoiceCreditBalance,
  publishVoiceCreditBalance,
  publishVoiceCreditHeaders,
  type VoiceCreditBalance,
} from '../voiceCreditBalance';

/**
 * The single network boundary for AI features.
 *
 * This is the single production AI network boundary. The only other direct
 * fetch is the loopback-only development scenario health probe; it carries no
 * user text and cannot target a non-local host.
 *
 * The base URL is public by design — it is the address of a proxy, not a
 * credential. No key of any kind is present in this file or anywhere else in
 * the client bundle.
 *
 * Because every AI request in the app passes through `post` below, the AI
 * data-sharing consent check lives there rather than in any screen. Hiding or
 * disabling a button is a courtesy; this is the enforcement. A newly mounted
 * screen, a retry action, a background preload and a direct call to any gateway
 * function all reach the same guard, and it runs before identity is resolved
 * and before anything is put on the wire.
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

/**
 * Binds consent storage here, in the module that enforces it.
 *
 * Anything able to reach `post` has necessarily imported this file, so the
 * guard can never run against an unconfigured store and mistake a stored
 * "granted" for "unknown". `configureAIConsentStorage` is idempotent.
 */
configureAIConsentStorage({
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
});

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
  const [installId, localScenario] = await Promise.all([
    getInstallId(),
    getLocalAiVoiceTestScenario(),
  ]);
  if (localScenario === LOCAL_AI_VOICE_SCENARIO) {
    return { installId, appUserId: LOCAL_AI_VOICE_APP_USER_ID };
  }

  const configured = await configureRevenueCat();
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
  publishVoiceCreditBalance(null);
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
): Promise<{
  code?: string;
  requestId?: string;
  quota?: MonthlyQuotaInfo;
  limitWindow?: RateLimitWindow;
  voiceCredits?: VoiceCreditBalance;
}> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return {};
  try {
    const body = (await response.json()) as ErrorBody & Record<string, unknown>;
    // Verified usage figures, when the Worker reports an exhausted quota. Only
    // a well-formed set is accepted; the UI never invents these numbers.
    const quota = body.error === 'monthly_api_limit_reached' ? parseQuotaInfo(body) : undefined;
    // The Worker has always sent this alongside a 429; it was simply dropped here,
    // which is why an exhausted daily allowance was indistinguishable from a burst.
    const limitWindow = parseRateLimitWindow(body.window);
    const voiceCredits = body.error === 'voice_credits_exhausted'
      ? parseVoiceCreditBalance({
        tier: 'basic',
        grant: body.grant,
        remaining: body.remaining,
        available: 0,
      }) ?? undefined
      : undefined;
    return {
      ...(typeof body.error === 'string' ? { code: body.error } : {}),
      ...(typeof body.requestId === 'string' ? { requestId: body.requestId } : {}),
      ...(quota !== undefined ? { quota } : {}),
      ...(limitWindow !== undefined ? { limitWindow } : {}),
      ...(voiceCredits !== undefined ? { voiceCredits } : {}),
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

/**
 * What a request carries, which decides how it is treated.
 *
 * `user-content` is everything that submits something the user wrote or chose:
 * card voice, custom voice, meanings, breakdowns, translations, examples, their
 * retries and their background preloads. Every one needs an eligible
 * entitlement, an explicit consent, and the two identity headers.
 *
 * `account-metadata` is the fresh server-side entitlement/credit check. It
 * carries identity but no user text. It deliberately does not trust or require
 * the client entitlement snapshot, because resolving that snapshot is its job.
 *
 * `fixed-promo` is the promotional clips and nothing else. The request has no
 * text field, no voice field, an allowlisted sample id and a language code the
 * Worker resolves against a fixed table, so there is nothing in it belonging to
 * the user — and it therefore carries no identifiers either.
 *
 * Not exported. The only way to make a `fixed-promo` request is
 * `postPromoSpeech` below, which builds the body itself; no caller can label
 * its own payload.
 */
type AIRequestKind = 'user-content' | 'account-metadata' | 'fixed-promo';

async function post(
  path: string,
  body: Record<string, unknown>,
  options: ApiRequestOptions,
  defaultTimeoutMs: number,
  kind: AIRequestKind = 'user-content',
): Promise<Response> {
  // Both gates, before the base URL is even considered. Entitlement first: a
  // plan that cannot use AI never reaches the consent check, so an ineligible
  // device is never asked for a permission it has no use for. Throwing here
  // means nothing is read, resolved or transmitted.
  //
  // Account metadata skips the local gates because the Worker is the authority
  // it is asking. A fixed promo skips them because no user content is sent and
  // no entitlement is required to hear WordPing's own sample.
  if (kind === 'user-content') {
    requireAIEntitlement();
    await requireAIConsent();
  }

  if (!isApiConfigured()) {
    throw new AIRequestError('service_unavailable', { serverCode: 'api_not_configured' });
  }

  // Resolved for user content and the account-metadata verification request.
  // `getInstallId` *creates* an id when none exists, so the fixed public sample
  // stays outside this branch and never mints an identifier merely to play.
  const identity = kind !== 'fixed-promo' ? await getIdentity() : null;
  const timeout = withTimeout(options.timeoutMs ?? defaultTimeoutMs, options.signal);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(identity === null ? null : {
          [INSTALL_ID_HEADER]: identity.installId,
          [APP_USER_ID_HEADER]: identity.appUserId,
        }),
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
    const { code, requestId, quota, limitWindow, voiceCredits } = await readErrorCode(response);
    if (voiceCredits !== undefined) publishVoiceCreditBalance(voiceCredits);
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
      ...(limitWindow !== undefined ? { limitWindow } : {}),
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

/** The user-content voice routes. The promo route is deliberately not here. */
export type VoiceEndpoint = 'card' | 'sample' | 'custom';

const VOICE_PATHS: Readonly<Record<VoiceEndpoint, string>> = {
  card: '/v1/voice/card',
  sample: '/v1/voice/sample',
  custom: '/v1/voice/custom',
};

const PROMO_PATH = '/v1/voice/promo';

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
  publishVoiceCreditHeaders(response.headers);

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

/**
 * Freshly verifies the paid tier with the Worker and reads/initializes Basic's
 * authoritative one-time balance. It carries identity but no user text, so it
 * does not require data-sharing consent and never reserves a generation.
 */
export async function fetchVoiceCreditBalance(): Promise<VoiceCreditBalance> {
  const response = await post(
    '/v1/voice/credits',
    {},
    {},
    DEFAULT_TEXT_TIMEOUT_MS,
    'account-metadata',
  );
  const parsed = parseVoiceCreditBalance(await response.json());
  if (parsed === null) {
    throw new AIRequestError('generation_failed', { serverCode: 'invalid_credit_balance' });
  }
  publishVoiceCreditBalance(parsed);
  return parsed;
}

/**
 * The fixed promotional clips — the one request that carries nothing of the
 * user's, and therefore the one exempt from entitlement and consent.
 *
 * It is a separate function rather than a flag on `postSpeech` so the exemption
 * cannot be reached with a caller-supplied payload. Everything transmitted is
 * built here from arguments this function validates:
 *
 *  - `sample` is checked against the same fixed allowlist the Worker uses,
 *    so a bad id fails on the device instead of becoming a request.
 *  - `langCode` selects which fixed WordPing translation is spoken. The Worker
 *    resolves it against its own table and falls back to English, so it can
 *    only choose a row, never supply content.
 *  - `sampleVersion` is a build constant used to invalidate the shared cache.
 *
 * There is no `text` and no `voice` field: the sentence and the voice are both
 * fixed server-side. No identity headers are sent, and none is created —
 * see the `fixed-promo` branch in `post`.
 */
export async function postPromoSpeech(
  sample: string,
  langCode: string | undefined,
  sampleVersion: string | undefined,
  options: ApiRequestOptions = {},
): Promise<SpeechResult> {
  if (!isPromoSampleId(sample)) {
    throw new AIRequestError('invalid_input', { serverCode: 'unknown_promo_sample' });
  }

  const response = await post(
    PROMO_PATH,
    {
      sample,
      ...(langCode !== undefined ? { langCode } : {}),
      ...(sampleVersion !== undefined ? { sampleVersion } : {}),
    },
    options,
    DEFAULT_SPEECH_TIMEOUT_MS,
    'fixed-promo',
  );

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
