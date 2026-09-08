import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import PostHog from 'posthog-react-native';
import {
  configureAnalyticsConsentStorage,
  loadAnalyticsConsent,
  subscribeToAnalyticsConsent,
  type AnalyticsConsentState,
} from '../lib/analyticsConsent';
import { syncAnalyticsResearchProperties } from '../lib/analyticsResearchProperties';

/**
 * The one PostHog client. Nothing else constructs one — `App.tsx` mounts a
 * single `PostHogProvider` around this instance.
 *
 * The token and host are read from `app.config.js`, which forwards
 * EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN and EXPO_PUBLIC_POSTHOG_HOST at build time.
 * Neither value is written here and neither is ever logged.
 *
 * This module is also where the user's analytics opt-out is enforced, for the
 * same reason `api/client.ts` enforces AI consent: anything that can reach the
 * client has necessarily imported this file, so there is no path to `capture`
 * that skips the check.
 */
const projectToken = Constants.expoConfig?.extra?.posthogProjectToken as string | undefined;
const host = Constants.expoConfig?.extra?.posthogHost as string | undefined;

/**
 * Session Replay is a native capability: it screenshots the real view
 * hierarchy through `@posthog/react-native-plugin`, which ships an iOS pod and
 * an Android module and has no web implementation. Asking for it on web would
 * be asking for a module that is not there, so the flag is platform-gated and
 * the Expo web bundle keeps plain product analytics.
 */
const sessionReplaySupported = Platform.OS === 'ios' || Platform.OS === 'android';

if (__DEV__ && !projectToken) {
  throw new Error(
    'EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN is configured',
  );
}

if (__DEV__ && !host) {
  throw new Error(
    'EXPO_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_HOST is configured',
  );
}

// Loud in a release build too, for the same reason `purchases.ts` reports a
// missing RevenueCat key: EAS does not upload `.env`, so an unconfigured build
// profile produces an app with no analytics at all and nothing anywhere saying
// so. Names only — neither value is logged.
if (!__DEV__ && !(projectToken && host)) {
  console.error(
    '[analytics] PostHog is not configured. Set EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN and '
    + 'EXPO_PUBLIC_POSTHOG_HOST in the EAS build profile or as EAS environment variables.',
  );
}

export const posthog = projectToken && host
  ? new PostHog(projectToken, {
    host,
    captureAppLifecycleEvents: true,
    // Start opted out and let the stored preference decide, below.
    //
    // Without this the client begins capturing — the first Session Replay
    // frames and the app-lifecycle event — during its own async bootstrap,
    // which races our read of the opt-out. Losing that race would record a user
    // who had switched recording off, which is the one outcome this control
    // exists to prevent, so the race is removed rather than narrowed.
    //
    // THE COST, STATED PLAINLY: on a genuinely opted-in *first* launch the
    // client is opted out until `optIn()` lands a moment later, so an
    // app-lifecycle event fired before that — "Application Installed" in
    // particular — can be dropped. That is a real gap in install analytics, and
    // it is accepted because the alternative is recording people who opted out.
    //
    // It is only the first launch. `optIn()` / `optOut()` persist into PostHog's
    // own storage, which it reads during that same bootstrap on every later
    // launch, so from then on the decision is already applied before any event
    // is captured and nothing is lost.
    defaultOptIn: false,
    // Off by default in the SDK, which is why the dashboard toggle alone was
    // never going to produce a recording: the remote setting can only sample
    // what the client has already started capturing.
    enableSessionReplay: sessionReplaySupported,
    sessionReplayConfig: {
      // NOT "mask all text inputs" on React Native. In the iOS SDK
      // (PostHogReplayIntegration.swift) this flag also masks every
      // RCTTextView and RCTParagraphComponentView — which is how *all*
      // `<Text>` renders, not just inputs — so leaving it on blacked out every
      // static label, button and heading in the app. It is off, and the
      // private fields are masked one by one instead: `MaskedUserText` around
      // each stored front/back/note, `PostHogMaskView` around folder names and
      // around every TextInput that can hold the user's own words.
      //
      // Turning it off does NOT unmask password fields. `isTextFieldSensitive`
      // is `(maskAllTextInputs || isNoCapture) || isSensitiveText()`, and
      // `isSensitiveText()` is true for `isSecureTextEntry` and for a sensitive
      // `textContentType` — password, one-time code, card number, email,
      // address and so on — independently of this flag. This app has no auth
      // input at all; it is account-free.
      maskAllTextInputs: false,
      // Every image here is a bundled asset: theme previews, icons, the app's
      // own illustrations. Nothing user-supplied is ever rendered as an image —
      // there is no avatar, no photo attachment, no image picker. Custom audio
      // is a local file that is played, never drawn.
      maskAllImages: false,
      // The console carries this app's own diagnostics — cache keys, request
      // ids, TTS text lengths — and network telemetry would carry the AI proxy
      // URLs. Neither belongs in a recording.
      captureLog: false,
      captureNetworkTelemetry: false,
      // Local config wins over the project's remote sample rate, so this is
      // what decides capture on the device.
      sampleRate: 1.0,
      // EXPERIMENTAL. Moves the replay screenshot off the main thread, where it
      // otherwise competes with whatever is animating — a freshly presented
      // Modal is captured with the expensive `drawHierarchy(afterScreenUpdates:)`
      // pass, which is the suspected cause of the Add/Edit sheet dropping frames
      // as it slides up. iOS only; the SDK documents no Android behaviour for it.
      //
      // The SDK warns it trips Main Thread Checker and may briefly freeze the app
      // on the very first capture. If either shows up, set this back to false —
      // it is a performance experiment, not a correctness fix.
      screenshotModeBackgroundCapture: Platform.OS === 'ios',
    },
  })
  : undefined;

// ── The user's opt-out ────────────────────────────────────────────────────────

/**
 * Bound here, in the module that enforces it, so the consent state machine can
 * stay free of react-native imports and be tested against a fake store.
 */
configureAnalyticsConsentStorage({
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
});

/**
 * One call decides both halves.
 *
 * `optOut()` drops events *and* propagates to the native Session Replay plugin
 * (`_propagateNativeOptOut` → `setOptOut`), so a single consent change cannot
 * leave the app recording a user who turned analytics off. `optIn()` restores
 * both.
 *
 * Enabling also republishes the onboarding research Person Properties, with the
 * age recomputed from the locally stored date of birth. That is what makes this
 * the only path they can travel: they are sent when analytics is on and at no
 * other time, whether that is at launch or the moment sharing is turned back
 * on. Disabling sends nothing and republishes nothing.
 *
 * Failures are swallowed: a preference that could not be applied must not take
 * the app down, and the next launch reapplies it from the same stored value.
 */
function applyAnalyticsConsent(state: AnalyticsConsentState): void {
  if (!posthog) return;
  const client = posthog;
  const applied = state === 'enabled' ? client.optIn() : client.optOut();
  void applied.catch(() => {});
  if (state !== 'enabled') return;
  // Recomputed here rather than stored, so a birthday that passed while the app
  // was closed is reflected on the next launch with nothing to schedule. The
  // date of birth itself is read on the device and never sent.
  void syncAnalyticsResearchProperties(client).catch(() => {});
}

/**
 * Republishes the research Person Properties from the stored answers.
 *
 * Called when onboarding completes, which is the one moment those answers exist
 * for the first time and the consent state has not changed — without it a new
 * user's answers would sit on the device until the next launch, missing exactly
 * the first session the discovery-source question is asked to explain.
 *
 * Safe to call unconditionally: the sender re-checks the opt-out and returns
 * before reading anything when analytics is off.
 */
export function publishAnalyticsResearchProperties(): void {
  if (!posthog) return;
  void syncAnalyticsResearchProperties(posthog).catch(() => {});
}

/**
 * Resolved at import time rather than from a React effect.
 *
 * `App.tsx` imports this module, so this read starts before the first render —
 * as early as the decision can be made without blocking startup on a
 * synchronous disk read. Until it lands the client is opted out by
 * `defaultOptIn: false`, so the window is silent rather than recorded.
 */
if (posthog) {
  void loadAnalyticsConsent().then(applyAnalyticsConsent).catch(() => {});
  subscribeToAnalyticsConsent(applyAnalyticsConsent);
}
