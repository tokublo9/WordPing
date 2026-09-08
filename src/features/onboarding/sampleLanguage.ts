import type { OnboardingChoices } from '../../types';
import { resolvePromoLang, type PromoSampleLang } from '../../lib/promoVoiceSamples';

/**
 * Which language the Upgrade Plan sheet's four samples are shown and spoken in.
 *
 * One function, because every text, playback, preload, asset and cache consumer
 * must make the same choice. A sample whose text and audio disagree is worse
 * than no sample at all, so they all receive this resolved key.
 *
 * The choice follows what the user said they were here for:
 *
 *  - `language` — they are learning a language, so the samples demonstrate the
 *    voice in *that* language. Hearing your native language read back tells you
 *    nothing about how the voice will read the words you are actually studying.
 *  - `words` — they are building vocabulary in the language they already speak,
 *    so the Explanation Language is the only language in play.
 *
 * The purpose is read from the stored onboarding answer, never inferred from
 * whether `learningLang` happens to be set.
 *
 * Pure — no react-native and no expo import — so every branch is unit-testable.
 */

export type OnboardingPurpose = OnboardingChoices['purpose'];

export interface SampleLanguageInput {
  /** The stored onboarding purpose, or null when there is no usable record. */
  purpose: OnboardingPurpose | null;
  /** BCP-47 tag of the language being learned. Only the `language` path has one. */
  learningLang?: string | null;
  /** BCP-47 tag of the Explanation Language. */
  nativeLang?: string | null;
}

/**
 * The sample language for a set of onboarding answers.
 *
 * Falls back to English only when the source language is genuinely unusable —
 * absent, `other`, or a tag the sample tables have no copy for. Every one of the
 * twenty codes the onboarding picker offers normalizes onto its own row.
 *
 * The returned value is the sample-table key itself. Passing this one value all
 * the way through the UI and audio pipeline prevents a regional tag from being
 * normalized differently by separate consumers.
 */
export function resolveAIVoiceSampleLanguage(input: SampleLanguageInput): PromoSampleLang {
  const source = input.purpose === 'language'
    ? input.learningLang
    : input.purpose === 'words'
      ? input.nativeLang
      : null;
  return resolvePromoLang(source);
}
