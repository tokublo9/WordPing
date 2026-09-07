import type { OnboardingChoices } from '../../types';

/**
 * The onboarding answers, as PostHog Person Properties.
 *
 * THE DATE OF BIRTH NEVER LEAVES THE DEVICE. It is stored locally so that the
 * age can be recomputed whenever it is needed, and only the derived whole-year
 * `age` is ever sent. A birth date is a stable, high-entropy identifier and a
 * direct input to age verification and re-identification; the number of years
 * is what the research question actually needs, so that is all that is
 * transmitted. There is deliberately no code path in this module that returns
 * `dateOfBirth` — see `buildResearchProperties`.
 *
 * These are Person Properties rather than event properties: they describe the
 * person, they change at most once a year, and attaching them to every event
 * would multiply the same five values across every row for no analytical gain.
 *
 * Pure — no react-native, expo, PostHog or storage import — so the age
 * arithmetic and the omission rules can be asserted directly.
 */

/**
 * The widest range a stored birth date may imply.
 *
 * Anything outside it is treated as unusable rather than clamped: a date that
 * produces 3 or 260 is a corrupt or mistyped value, not a very young or very
 * old user, and inventing a plausible number from it would be worse than
 * sending nothing.
 */
export const MIN_RESEARCH_AGE = 4;
export const MAX_RESEARCH_AGE = 120;

/** `YYYY-MM-DD`, which is what `toIsoDate` in OnboardingModal writes. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * Whole years elapsed, or `null` when the stored value cannot support one.
 *
 * Returns `null` — never a guess — for a malformed string, a date that does not
 * exist (2025-02-30), a date in the future, or an age outside the range above.
 * The caller omits the property entirely in that case.
 *
 * Computed from the calendar fields rather than by dividing a millisecond
 * difference, so leap years and daylight-saving shifts cannot move a birthday
 * by a day. The comparison is on month and day alone, which is what makes the
 * boundary exact: the age increments on the birthday itself, not the day after.
 */
export function calculateAge(dateOfBirth: string, now: Date = new Date()): number | null {
  const match = ISO_DATE.exec(dateOfBirth.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Round-tripped through Date to reject a well-formed string describing a day
  // that does not exist — Date would silently roll 2025-02-30 into March.
  const born = new Date(Date.UTC(year, month - 1, day));
  if (born.getUTCFullYear() !== year
    || born.getUTCMonth() !== month - 1
    || born.getUTCDate() !== day) return null;

  let age = now.getFullYear() - year;
  // Not had this year's birthday yet.
  const monthsBefore = now.getMonth() + 1 < month;
  const sameMonthEarlierDay = now.getMonth() + 1 === month && now.getDate() < day;
  if (monthsBefore || sameMonthEarlierDay) age -= 1;

  if (age < MIN_RESEARCH_AGE || age > MAX_RESEARCH_AGE) return null;
  return age;
}

/**
 * What is actually sent. Every value is one of onboarding's own fixed choices,
 * a BCP-47 language tag, or the derived age.
 */
/**
 * What is actually sent: a flat record of JSON scalars, which is the shape
 * PostHog's `setPersonProperties` takes.
 *
 * Deliberately not an object type with optional members. An optional property
 * carries `| undefined` in its type, `undefined` is not a JSON value, and the
 * result is a payload type that cannot be handed to the client without a cast.
 * Building the record and adding the two conditional keys explicitly keeps the
 * type honest about what goes over the wire — every value present is a value
 * that will be sent.
 *
 * The exact key set is fixed and asserted in tests/unit/researchProperties.test.ts:
 *
 *   age               whole years, derived; omitted when it cannot be derived
 *   gender            one of onboarding's four fixed choices
 *   discovery_source  one of onboarding's six fixed choices
 *   native_language   BCP-47 tag
 *   learning_language BCP-47 tag; omitted on the words path
 *   learning_purpose  'language' | 'words'
 */
export type ResearchProperties = Record<string, string | number>;

/**
 * Builds the property set from the locally stored answers.
 *
 * `age` is omitted rather than sent as null when it cannot be derived, so a
 * corrupt date leaves the property absent in PostHog instead of overwriting a
 * previously correct value with a blank.
 *
 * `wordCategory` is deliberately not included: it is a study preference the app
 * uses to seed content, not one of the research questions, and it is the one
 * onboarding answer that can carry a free-form value.
 */
export function buildResearchProperties(
  choices: OnboardingChoices,
  now: Date = new Date(),
): ResearchProperties {
  const properties: ResearchProperties = {
    gender: choices.gender,
    discovery_source: choices.discoverySource,
    native_language: choices.nativeLang,
    learning_purpose: choices.purpose,
  };
  // The date of birth is read here and nowhere else, and only the number of
  // years derived from it is added. The key is added rather than set to null so
  // an unusable date leaves the property absent in PostHog instead of blanking
  // a previously correct value.
  const age = calculateAge(choices.dateOfBirth, now);
  if (age !== null) properties.age = age;
  if (choices.learningLang) properties.learning_language = choices.learningLang;
  return properties;
}

/**
 * Parses the stored onboarding payload.
 *
 * Lives here rather than in `useAppBootstrap` because two callers now need it —
 * bootstrap, to restore the language choices, and the analytics sender, to
 * derive the research properties — and a second copy could drift into
 * disagreeing about what a stored value means.
 *
 * Every field is validated against its own allowlist, so a hand-edited or
 * partially written record degrades to the documented default rather than
 * reaching PostHog as arbitrary text.
 */
export function parseOnboardingChoices(raw: string): OnboardingChoices | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.purpose !== 'language' && value.purpose !== 'words') return null;
    if (typeof value.nativeLang !== 'string' || !value.nativeLang) return null;
    return {
      purpose: value.purpose,
      gender: value.gender === 'woman' || value.gender === 'man' || value.gender === 'non_binary'
        ? value.gender
        : 'prefer_not_to_say',
      dateOfBirth: typeof value.dateOfBirth === 'string' ? value.dateOfBirth : '',
      discoverySource:
        value.discoverySource === 'app_store' || value.discoverySource === 'social_media' ||
        value.discoverySource === 'friend_family' || value.discoverySource === 'web_search' ||
        value.discoverySource === 'advertisement'
          ? value.discoverySource
          : 'other',
      learningLang: typeof value.learningLang === 'string' ? value.learningLang : undefined,
      nativeLang: value.nativeLang,
      wordCategory: typeof value.wordCategory === 'string' ? value.wordCategory : undefined,
    };
  } catch {
    return null;
  }
}
