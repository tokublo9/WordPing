import assert from 'node:assert/strict';
import test from 'node:test';
import type { OnboardingChoices } from '../../src/types';
import {
  MAX_RESEARCH_AGE,
  MIN_RESEARCH_AGE,
  buildResearchProperties,
  calculateAge,
  parseOnboardingChoices,
} from '../../src/features/onboarding/researchProperties';

/**
 * The date of birth is the one onboarding answer that must never be transmitted.
 * These cover the arithmetic that replaces it and, more importantly, the cases
 * where no age may be sent at all.
 */

/** Fixed "now" so the expectations do not drift with the wall clock. */
const NOW = new Date(2026, 8, 7); // 7 September 2026, local time

const CHOICES: OnboardingChoices = {
  purpose: 'language',
  gender: 'woman',
  dateOfBirth: '1994-03-15',
  discoverySource: 'app_store',
  learningLang: 'en-US',
  nativeLang: 'ja-JP',
  wordCategory: undefined,
};

test('age is whole years elapsed', () => {
  assert.equal(calculateAge('1994-03-15', NOW), 32);
  assert.equal(calculateAge('2000-01-01', NOW), 26);
});

test('the birthday itself increments the age, the day before does not', () => {
  // Birthday today.
  assert.equal(calculateAge('2000-09-07', NOW), 26);
  // Birthday tomorrow — still the younger age.
  assert.equal(calculateAge('2000-09-08', NOW), 25);
  // Birthday yesterday.
  assert.equal(calculateAge('2000-09-06', NOW), 26);
});

test('a birthday later in the year has not happened yet', () => {
  assert.equal(calculateAge('2000-12-31', NOW), 25);
  assert.equal(calculateAge('2000-01-31', NOW), 26);
});

test('a 29 February birth date is handled without rolling into March', () => {
  assert.equal(calculateAge('2000-02-29', NOW), 26);
  // 2001 had no 29 February, so this is not a real date and must be refused.
  assert.equal(calculateAge('2001-02-29', NOW), null);
});

test('no age is produced from an unusable stored value', () => {
  assert.equal(calculateAge('', NOW), null);
  assert.equal(calculateAge('not-a-date', NOW), null);
  assert.equal(calculateAge('1994-3-15', NOW), null, 'unpadded months are not the stored format');
  assert.equal(calculateAge('2025-02-30', NOW), null, 'a day that does not exist');
  assert.equal(calculateAge('2030-01-01', NOW), null, 'a date in the future');
});

test('an implausible age is refused rather than clamped', () => {
  const tooYoung = new Date(NOW.getFullYear() - (MIN_RESEARCH_AGE - 1), 0, 1);
  const tooOld = new Date(NOW.getFullYear() - (MAX_RESEARCH_AGE + 1), 0, 1);
  const iso = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(calculateAge(iso(tooYoung), NOW), null);
  assert.equal(calculateAge(iso(tooOld), NOW), null);
  // The boundaries themselves are allowed.
  assert.equal(calculateAge(iso(new Date(NOW.getFullYear() - MIN_RESEARCH_AGE, 0, 1)), NOW), MIN_RESEARCH_AGE);
  assert.equal(calculateAge(iso(new Date(NOW.getFullYear() - MAX_RESEARCH_AGE, 0, 1)), NOW), MAX_RESEARCH_AGE);
});

test('the property set carries the derived age and never the date of birth', () => {
  const properties = buildResearchProperties(CHOICES, NOW);
  assert.deepEqual(properties, {
    age: 32,
    gender: 'woman',
    discovery_source: 'app_store',
    native_language: 'ja-JP',
    learning_language: 'en-US',
    learning_purpose: 'language',
  });
  // The whole point: no key holds the stored date, in any spelling.
  const serialized = JSON.stringify(properties);
  assert.doesNotMatch(serialized, /dateOfBirth|date_of_birth|1994-03-15/u);
});

test('age is omitted, not nulled, when it cannot be derived', () => {
  const properties = buildResearchProperties({ ...CHOICES, dateOfBirth: '' }, NOW);
  assert.equal('age' in properties, false);
  // Everything else still goes.
  assert.equal(properties.gender, 'woman');
  assert.equal(properties.learning_purpose, 'language');
});

test('learning language is omitted on the words path', () => {
  const properties = buildResearchProperties(
    { ...CHOICES, purpose: 'words', learningLang: 'en-US' },
    NOW,
  );
  assert.equal('learning_language' in properties, false);
  assert.equal(properties.learning_purpose, 'words');
});

test('the study category is never a research property', () => {
  const properties = buildResearchProperties({ ...CHOICES, wordCategory: 'business' }, NOW);
  assert.doesNotMatch(JSON.stringify(properties), /business|wordCategory|word_category/u);
});

test('stored answers are validated against their allowlists', () => {
  const parsed = parseOnboardingChoices(JSON.stringify({
    purpose: 'language',
    nativeLang: 'ja-JP',
    learningLang: 'en-US',
    gender: 'something-else',
    discoverySource: 'made-up',
    dateOfBirth: 12345,
  }));
  assert.notEqual(parsed, null);
  assert.equal(parsed?.gender, 'prefer_not_to_say');
  assert.equal(parsed?.discoverySource, 'other');
  assert.equal(parsed?.dateOfBirth, '', 'a non-string date becomes empty, so no age is sent');
});

test('an unusable stored record parses to null rather than a partial one', () => {
  assert.equal(parseOnboardingChoices('not json'), null);
  assert.equal(parseOnboardingChoices('[]'), null);
  assert.equal(parseOnboardingChoices(JSON.stringify({ purpose: 'language' })), null, 'no nativeLang');
  assert.equal(parseOnboardingChoices(JSON.stringify({ nativeLang: 'ja-JP' })), null, 'no purpose');
  assert.equal(parseOnboardingChoices(JSON.stringify({ purpose: 'words', nativeLang: 'other' })), null, 'legacy Other value');
  assert.equal(parseOnboardingChoices(JSON.stringify({ purpose: 'words', nativeLang: 'es' })), null, 'UI code instead of BCP-47 code');
  assert.equal(parseOnboardingChoices(JSON.stringify({
    purpose: 'language', nativeLang: 'ja-JP', learningLang: 'other',
  })), null, 'unsupported learning language');
});

test('the words path strips a stale learning language from stored data', () => {
  const parsed = parseOnboardingChoices(JSON.stringify({
    purpose: 'words',
    nativeLang: 'ko-KR',
    learningLang: 'en-US',
  }));
  assert.notEqual(parsed, null);
  assert.equal(parsed?.purpose, 'words');
  assert.equal(parsed?.nativeLang, 'ko-KR');
  assert.equal('learningLang' in (parsed ?? {}), false);
});
