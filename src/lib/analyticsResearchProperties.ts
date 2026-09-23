// ── Retired: the PostHog research-property sender ────────────────────────────
//
// PostHog has been removed — see src/config/posthog.ts. Nothing in the app
// reads the stored onboarding answers in order to send them, so this module
// exports nothing and is imported by nothing. It is kept, commented out, so
// restoring analytics means restoring a reviewed implementation rather than
// writing a new one.
//
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { ONBOARDING_KEY } from '../constants';
// import {
//   buildResearchProperties,
//   parseOnboardingChoices,
//   type ResearchProperties,
// } from '../features/onboarding/researchProperties';
// import { isAnalyticsEnabled } from './analyticsConsent';
//
// /**
//  * Sends the onboarding research answers to PostHog as Person Properties.
//  *
//  * WHAT LEAVES THE DEVICE: `native_language`, `learning_language` and
//  * `learning_purpose`. Onboarding asks for nothing else about the person — no
//  * date of birth, no gender, no discovery source — so there is nothing else
//  * `buildResearchProperties` could return.
//  *
//  * WHY PERSON PROPERTIES rather than event properties: these describe the person
//  * and change rarely, so attaching them to every event would repeat the same
//  * three values across every row and make them impossible to correct.
//  * `setPersonProperties` writes them once against the current anonymous
//  * `distinct_id`; it does not call `identify`, does not mint or alias a user, and
//  * does not create an account — WordCore has none.
//  *
//  * WHEN IT RUNS: from `config/posthog.ts`, on the one path that turns analytics
//  * on — at launch once the stored preference resolves to enabled, and again the
//  * moment the user switches it back on.
//  *
//  * WHEN IT DOES NOT RUN: while analytics is off. The guard below is checked
//  * again here rather than trusted from the caller, so no future call site can
//  * reach the network with these values behind the user's opt-out.
//  */
//
// /**
//  * The narrow surface this needs, so the module does not import the client and
//  * `config/posthog.ts` can pass its own instance without a circular import.
//  *
//  * The property type is scalars rather than `unknown`: PostHog's own parameter is
//  * a JSON value bag, and a wider one here would make the real client fail to
//  * satisfy this interface.
//  */
// export interface PersonPropertyClient {
//   setPersonProperties(
//     properties: Record<string, string | number>,
//     setOnce?: Record<string, string | number>,
//     reloadFeatureFlags?: boolean,
//   ): void;
// }
//
// /**
//  * Reads the locally stored answers and returns what should be sent, or `null`.
//  *
//  * Separated from the send so the decision is testable and so there is one
//  * obvious place to see that a disabled opt-out returns before any read.
//  */
// export async function resolveResearchProperties(): Promise<ResearchProperties | null> {
//   if (!isAnalyticsEnabled()) return null;
//   let raw: string | null;
//   try {
//     raw = await AsyncStorage.getItem(ONBOARDING_KEY);
//   } catch {
//     // Unreadable preferences are not worth reporting a failure over; the next
//     // launch tries again from the same stored value.
//     return null;
//   }
//   if (raw === null) return null;
//   const choices = parseOnboardingChoices(raw);
//   if (choices === null) return null;
//   return buildResearchProperties(choices);
// }
//
// /**
//  * Recomputes and publishes the research properties.
//  *
//  * `reloadFeatureFlags` is false: WordCore evaluates no feature flags, so the
//  * default would spend a network round trip for nothing on every launch.
//  */
// export async function syncAnalyticsResearchProperties(
//   client: PersonPropertyClient,
// ): Promise<void> {
//   const properties = await resolveResearchProperties();
//   if (properties === null) return;
//   // Re-checked after the await: the user can switch analytics off while the
//   // stored answers are being read, and that decision must win.
//   if (!isAnalyticsEnabled()) return;
//   client.setPersonProperties(properties, undefined, false);
// }
