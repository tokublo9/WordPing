import type { KeyValueStore } from './sqlite/types';

/**
 * Product-analytics consent — PostHog events and Session Replay together.
 *
 * WordCore ships analytics on. This is an opt-*out*, and it is deliberately a
 * different shape from `aiConsent.ts`, which is an opt-*in*: AI sends the user's
 * own words to a third party and must never happen without a yes, while
 * analytics sends interaction and screen data and is disclosed in the privacy
 * policy as on by default. The two are kept apart on purpose — turning one off
 * says nothing about the other, and neither can be inferred from the plan.
 *
 * ONE CONSENT, THREE SURFACES. `posthog.optOut()` stops event capture and also
 * calls the native Session Replay plugin's `setOptOut`, so there is no second
 * control to keep in step and no way to end up recording a user who opted out
 * of events. The same consent gates the onboarding research Person Properties —
 * age, gender, discovery source and the three language/purpose answers — which
 * are published only on the enable path and never while this reads `disabled`.
 * `config/posthog.ts` is the only module that reads this one and drives all
 * three from it.
 *
 * WHY THE DEFAULT IS "ENABLED" ON A MISSING VALUE. Absent means the user has
 * never answered, and the answer we ship with is on. A corrupt or truncated
 * stored value also reads as enabled, which is the one direction this can be
 * wrong in: the alternative — treating anything unrecognised as disabled —
 * would silently switch analytics off for everyone on a storage hiccup, which
 * is a worse failure for a product that is meant to be measuring its launch.
 * Only the exact string `disabled` turns it off, so a real decision is never
 * lost to a partial match.
 *
 * Pure — no react-native or expo import — so the state machine is testable
 * against a fake store, exactly like `aiConsent.ts`. The real binding is
 * installed once by `config/posthog.ts`, the module that enforces it.
 */

export type AnalyticsConsentState = 'enabled' | 'disabled';

/** AsyncStorage key. Deliberately outside the backup allowlist. */
export const ANALYTICS_CONSENT_KEY = 'analytics_consent';

/** What a fresh install gets, and what the privacy policy describes. */
export const DEFAULT_ANALYTICS_CONSENT: AnalyticsConsentState = 'enabled';

export function parseAnalyticsConsent(raw: string | null | undefined): AnalyticsConsentState {
  return raw === 'disabled' ? 'disabled' : 'enabled';
}

type Listener = (state: AnalyticsConsentState) => void;

let store: KeyValueStore | null = null;
let cached: AnalyticsConsentState = DEFAULT_ANALYTICS_CONSENT;
let loaded = false;
let loading: Promise<AnalyticsConsentState> | null = null;
const listeners = new Set<Listener>();

/** Installs the persistent store. Idempotent; the first binding wins. */
export function configureAnalyticsConsentStorage(next: KeyValueStore): void {
  store ??= next;
}

/** Test seam — clears the binding, the cache and every subscriber. */
export function resetAnalyticsConsentForTests(): void {
  store = null;
  cached = DEFAULT_ANALYTICS_CONSENT;
  loaded = false;
  loading = null;
  listeners.clear();
}

function publish(state: AnalyticsConsentState): void {
  cached = state;
  loaded = true;
  for (const listener of [...listeners]) listener(state);
}

/**
 * Reads the stored decision, once per launch.
 *
 * A storage failure resolves to the default rather than throwing: analytics is
 * on unless the user said otherwise, and an unreadable preferences file is not
 * the user saying otherwise.
 */
export function loadAnalyticsConsent(): Promise<AnalyticsConsentState> {
  if (loaded) return Promise.resolve(cached);
  // Nothing to read from yet. Answer the default without recording it as
  // loaded, so the real stored value is still read once the binding arrives.
  if (store === null) return Promise.resolve(DEFAULT_ANALYTICS_CONSENT);
  const source = store;
  loading ??= (async () => {
    try {
      return parseAnalyticsConsent(await source.getItem(ANALYTICS_CONSENT_KEY));
    } catch {
      return DEFAULT_ANALYTICS_CONSENT;
    }
  })().then(state => {
    loading = null;
    // A decision made while the read was in flight wins over what was on disk
    // when it started, so toggling the switch during the very first load is
    // not overwritten a moment later by the stale stored value.
    if (!loaded) publish(state);
    return cached;
  });
  return loading;
}

/** The last known decision, without waiting. */
export function getAnalyticsConsent(): AnalyticsConsentState {
  return cached;
}

export function isAnalyticsEnabled(): boolean {
  return cached === 'enabled';
}

/** True once the stored value has been read, so the UI can avoid a flicker. */
export function isAnalyticsConsentLoaded(): boolean {
  return loaded;
}

/** Records an explicit decision and notifies every subscriber. */
export async function setAnalyticsConsent(state: AnalyticsConsentState): Promise<void> {
  publish(state);
  if (store === null) return;
  try {
    await store.setItem(ANALYTICS_CONSENT_KEY, state);
  } catch {
    // The in-memory decision still applies for this session. Failing the user's
    // tap because a preference could not be written would be worse; the next
    // launch simply falls back to the default and they can set it again.
  }
}

export function subscribeToAnalyticsConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
