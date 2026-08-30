import { AIRequestError } from './api/errors';
import type { KeyValueStore } from './sqlite/types';

/**
 * AI data-sharing consent.
 *
 * WordPing sends user text to a third party (OpenAI, through the WordPing
 * Worker) for its AI features. Nothing may go out before the user has said yes,
 * so this module is the single source of truth for whether that is allowed.
 *
 * Three rules shape everything here:
 *
 *  - An absent, unreadable or unrecognised stored value is `unknown`, never
 *    `granted`. A corrupted preferences file must not become consent.
 *  - Consent is never enabled by default, and an app update cannot grant it:
 *    existing users have no stored value, which reads as `unknown`.
 *  - `requireAIConsent()` is awaited by the one function in the app that makes
 *    a network request (`api/client.ts`), so a screen, a retry, a background
 *    preload or a direct function call all pass through the same check.
 *
 * Pure — no react-native or expo import — so the state machine is tested
 * directly against a fake store. The real binding is installed once by
 * `api/client.ts`, the module that enforces it.
 */

export type AIConsentState = 'unknown' | 'granted' | 'declined';

/** AsyncStorage key. Deliberately outside the backup allowlist. */
export const AI_CONSENT_KEY = 'ai_data_sharing_consent';

/**
 * Anything other than the two exact stored words is `unknown`.
 *
 * Written as an allowlist rather than `value !== 'declined'` so that a
 * truncated write, a legacy boolean or arbitrary garbage can only ever fail
 * closed.
 */
export function parseAIConsentState(raw: string | null | undefined): AIConsentState {
  if (raw === 'granted') return 'granted';
  if (raw === 'declined') return 'declined';
  return 'unknown';
}

type Listener = (state: AIConsentState) => void;

let store: KeyValueStore | null = null;
let cached: AIConsentState = 'unknown';
let loaded = false;
let loading: Promise<AIConsentState> | null = null;
const listeners = new Set<Listener>();

/** Installs the persistent store. Idempotent; the first binding wins. */
export function configureAIConsentStorage(next: KeyValueStore): void {
  store ??= next;
}

/** Test seam — clears the binding, the cache and every subscriber. */
export function resetAIConsentForTests(): void {
  store = null;
  cached = 'unknown';
  loaded = false;
  loading = null;
  listeners.clear();
}

function publish(state: AIConsentState): void {
  cached = state;
  loaded = true;
  for (const listener of [...listeners]) listener(state);
}

/**
 * Reads the stored decision, once per launch.
 *
 * A storage failure resolves to `unknown` rather than throwing: the caller's
 * next step is either "ask the user" or "refuse the request", and both are the
 * correct response to not knowing.
 */
export function loadAIConsent(): Promise<AIConsentState> {
  if (loaded) return Promise.resolve(cached);
  // Nothing to read from yet. Answer `unknown` — which refuses the request and
  // asks the user — without recording it as loaded, so the real stored value is
  // still read once the binding is installed.
  if (store === null) return Promise.resolve('unknown');
  const source = store;
  loading ??= (async () => {
    try {
      return parseAIConsentState(await source.getItem(AI_CONSENT_KEY));
    } catch {
      // Unreadable preferences are not consent.
      return 'unknown';
    }
  })().then(state => {
    loading = null;
    // A decision made while the read was in flight wins over what was on disk
    // when it started. Without this, tapping "Not Now" during the very first
    // load could be overwritten a moment later by the stale stored value.
    if (!loaded) publish(state);
    return cached;
  });
  return loading;
}

/**
 * The last known decision, without waiting.
 *
 * `unknown` until the load completes, which is why this is only ever used to
 * skip work (a background preload, a Settings row's initial paint) and never to
 * authorise a request. Authorisation goes through `requireAIConsent`.
 */
export function getAIConsent(): AIConsentState {
  return cached;
}

export function isAIConsentGranted(): boolean {
  return cached === 'granted';
}

/** True once the stored value has been read, so the UI can avoid a flicker. */
export function isAIConsentLoaded(): boolean {
  return loaded;
}

/**
 * Drops a stored decision, returning to `unknown`.
 *
 * Used when a verified transition to the Free plan ends the subscription period
 * the permission was given for. A later subscription is a new period and must
 * ask again, so the old answer is not left lying around to be reused.
 *
 * Idempotent and silent when there is nothing stored, which is what keeps it
 * from writing on every launch: once cleared, the caller's condition is false.
 */
export async function invalidateAIConsent(): Promise<void> {
  if (!loaded) await loadAIConsent();
  if (cached === 'unknown') return;
  await setAIConsent('unknown');
}

/** Records an explicit decision and notifies every subscriber. */
export async function setAIConsent(state: AIConsentState): Promise<void> {
  publish(state);
  if (store === null) return;
  try {
    await store.setItem(AI_CONSENT_KEY, state);
  } catch {
    // The in-memory decision still applies for this session. Failing the user's
    // tap because a preference could not be written would be worse, and the
    // next launch simply asks again rather than assuming consent.
  }
}

export function subscribeToAIConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The guard. Throws unless consent has been explicitly granted.
 *
 * Awaits the stored value when it has not been read yet, so a request that
 * arrives before bootstrap finishes is judged on what is actually on disk
 * rather than on the not-yet-loaded default.
 */
export async function requireAIConsent(): Promise<void> {
  const state = loaded ? cached : await loadAIConsent();
  if (state === 'granted') return;
  throw new AIRequestError('consent_required', { serverCode: `consent_${state}` });
}
