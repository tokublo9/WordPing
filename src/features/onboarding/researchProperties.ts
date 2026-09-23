import type { OnboardingChoices } from '../../types';
import { isSupportedOnboardingLanguage } from '../../i18n';

/**
 * The stored onboarding answers.
 *
 * This used to also derive the PostHog Person Properties. PostHog has been
 * removed — see `src/config/posthog.ts` — so nothing is derived and nothing is
 * sent. What is left is the parser: `useAppBootstrap` reads the stored record
 * at launch to restore the purpose and the two languages, all of which stay on
 * the device.
 *
 * Pure — no react-native, expo or storage import — so it can be asserted
 * directly in tests/unit/researchProperties.test.ts.
 */

// ── The retired analytics payload ────────────────────────────────────────────
// export type ResearchProperties = Record<string, string | number>;
//
// /** Built the Person Properties from the stored answers. */
// export function buildResearchProperties(choices: OnboardingChoices): ResearchProperties {
//   const properties: ResearchProperties = {
//     native_language: choices.nativeLang,
//     learning_purpose: choices.purpose,
//   };
//   if (choices.purpose === 'language' && choices.learningLang) {
//     properties.learning_language = choices.learningLang;
//   }
//   return properties;
// }

/**
 * Parses the stored onboarding payload.
 *
 * Every field is validated against its own allowlist, so a hand-edited or
 * partially written record degrades to the documented default rather than
 * being trusted as written. A record from a build that still asked for a date
 * of birth, gender or discovery source parses fine: those fields are simply
 * not read.
 */
export function parseOnboardingChoices(raw: string): OnboardingChoices | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.purpose !== 'language' && value.purpose !== 'words') return null;
    if (!isSupportedOnboardingLanguage(value.nativeLang)) return null;
    const learningLang = isSupportedOnboardingLanguage(value.learningLang)
      ? value.learningLang
      : undefined;
    if (value.purpose === 'language' && learningLang === undefined) return null;
    return {
      purpose: value.purpose,
      ...(value.purpose === 'language' ? { learningLang } : {}),
      nativeLang: value.nativeLang,
      wordCategory: typeof value.wordCategory === 'string' ? value.wordCategory : undefined,
    };
  } catch {
    return null;
  }
}
