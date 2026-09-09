import { resolvePromoLang, type PromoSampleLang } from '../../lib/promoVoiceSamples';

/**
 * Which language the voice picker's Marin and Cedar samples are spoken in.
 *
 * The samples exist to answer "what does this voice sound like *to me*", so
 * they follow the language the app is speaking to the user in — never the
 * language being studied. Reading `learningLang` here is what would put an
 * English sample in front of a Korean user who is learning English, which is
 * the opposite of what the row is for. There is deliberately no field for it on
 * the input.
 *
 * Two eras, one rule:
 *
 *  - **During the tutorial** the app language has not been chosen yet — it is
 *    set from the Explanation Language when onboarding completes — so the
 *    Explanation Language the user just picked is the only authoritative
 *    answer.
 *  - **Afterwards** Settings → Language is the authority, and it is the one the
 *    user can change. A stored onboarding answer must not outrank it.
 *
 * Pure — no react-native and no expo import — and called at the moment of the
 * tap rather than memoized when a screen mounts, so a language changed in
 * Settings applies to the very next sample without a relaunch.
 */

export interface VoiceSampleLanguageInput {
  /** The tutorial is still on screen: nothing has been committed yet. */
  onboardingActive: boolean;
  /** BCP-47 Explanation Language chosen in the tutorial. */
  nativeLang?: string | null;
  /** The app's current UI language — Settings → Language. */
  appLanguage?: string | null;
}

export function resolveVoiceSampleLanguage(input: VoiceSampleLanguageInput): PromoSampleLang {
  // `??` rather than `||` on the onboarding branch would keep an empty string,
  // and an empty tag resolves to English — which is the bug this replaced.
  const source = input.onboardingActive
    ? (input.nativeLang || input.appLanguage)
    : (input.appLanguage || input.nativeLang);
  return resolvePromoLang(source);
}
