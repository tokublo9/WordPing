import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUPPORTED_LANGUAGES,
  isSupportedOnboardingLanguage,
  translate,
} from '../../src/i18n';

test('onboarding uses exactly the same 20-language registry as app i18n', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 20);
  assert.equal(new Set(SUPPORTED_LANGUAGES.map(item => item.code)).size, 20);
  assert.equal(new Set(SUPPORTED_LANGUAGES.map(item => item.onboardingCode)).size, 20);

  // 'other' must not be offered in the Learning Language or Explanation
  // Language selectors. Asserted through the two things those selectors
  // actually use — the registry they render from, and the validator they gate
  // a stored value on — rather than by comparing the literal union to 'other',
  // which TypeScript rejects as a comparison that can never hold.
  const onboardingCodes: readonly string[] = SUPPORTED_LANGUAGES.map(item => item.onboardingCode);
  assert.equal(onboardingCodes.includes('other'), false);
  assert.equal(isSupportedOnboardingLanguage('other'), false);
});

test('only registry BCP-47 values pass onboarding language validation', () => {
  for (const language of SUPPORTED_LANGUAGES) {
    assert.equal(isSupportedOnboardingLanguage(language.onboardingCode), true);
  }
  for (const invalid of ['', 'other', 'es', 'zh-Hans', 'unsupported', null, undefined]) {
    assert.equal(isSupportedOnboardingLanguage(invalid), false);
  }
});

test('every language name has explicit localized copy in every supported UI locale', () => {
  for (const uiLanguage of SUPPORTED_LANGUAGES) {
    for (const namedLanguage of SUPPORTED_LANGUAGES) {
      const label = translate(uiLanguage.code, namedLanguage.nameKey);
      assert.notEqual(label, namedLanguage.nameKey);
      assert.notEqual(label.trim(), '');
    }
  }
  assert.equal(translate('ja', 'lang_name_spanish'), 'スペイン語');
  assert.equal(translate('es', 'lang_name_japanese'), 'Japonés');
});

test('App Info and welcome-announcement copy is explicit in every supported locale', () => {
  const keys = [
    'write_review',
    'recommend_friends',
    'review_open_failed',
    'share_failed',
    'recommend_share_message',
    'announcement_welcome_title',
    'announcement_welcome_body',
    'announcement_unread',
  ] as const;
  for (const language of SUPPORTED_LANGUAGES) {
    for (const key of keys) {
      const copy = translate(language.code, key);
      assert.notEqual(copy, key);
      assert.notEqual(copy.trim(), '');
      if (language.code !== 'en-US') {
        assert.notEqual(copy, translate('en-US', key), `${language.code}:${key} must not use English placeholder copy`);
      }
    }
  }
});
