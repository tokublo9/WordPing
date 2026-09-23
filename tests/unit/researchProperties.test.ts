import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOnboardingChoices } from '../../src/features/onboarding/researchProperties';

/**
 * The stored onboarding answers never leave the device: PostHog has been
 * removed, so there is no payload to build and nothing to send. What is left to
 * cover is the parser bootstrap reads at launch — including that a record
 * written by a build that still asked for a date of birth, gender or discovery
 * source is read without those fields coming back.
 */

test('a record from an older build keeps its languages and drops the rest', () => {
  const parsed = parseOnboardingChoices(JSON.stringify({
    purpose: 'language',
    nativeLang: 'ja-JP',
    learningLang: 'en-US',
    gender: 'woman',
    discoverySource: 'app_store',
    dateOfBirth: '1994-03-15',
  }));
  assert.deepEqual(parsed, {
    purpose: 'language',
    learningLang: 'en-US',
    nativeLang: 'ja-JP',
    wordCategory: undefined,
  });
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
