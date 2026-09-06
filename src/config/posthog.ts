import Constants from 'expo-constants';
import { Platform } from 'react-native';
import PostHog from 'posthog-react-native';

/**
 * The one PostHog client. Nothing else constructs one — `App.tsx` mounts a
 * single `PostHogProvider` around this instance.
 *
 * The token and host are read from `app.config.js`, which forwards
 * EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN and EXPO_PUBLIC_POSTHOG_HOST at build time.
 * Neither value is written here and neither is ever logged.
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

export const posthog = projectToken && host
  ? new PostHog(projectToken, {
    host,
    captureAppLifecycleEvents: true,
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
