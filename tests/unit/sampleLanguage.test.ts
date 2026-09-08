import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAIVoiceSampleLanguage } from '../../src/features/onboarding/sampleLanguage';
import { PROMO_SAMPLE_TEXT, resolvePromoLang } from '../../src/lib/promoVoiceSamples';

test('Korean onboarding languages resolve to the ko promo key', () => {
  assert.equal(resolvePromoLang('ko-KR'), 'ko');
  assert.equal(resolveAIVoiceSampleLanguage({
    purpose: 'language',
    learningLang: 'ko-KR',
    nativeLang: 'en-US',
  }), 'ko');
  assert.equal(resolveAIVoiceSampleLanguage({
    purpose: 'words',
    learningLang: null,
    nativeLang: 'ko-KR',
  }), 'ko');
});

test('all four Korean promo samples retain their localized text', () => {
  assert.deepEqual({
    spontaneous: PROMO_SAMPLE_TEXT.spontaneous.ko,
    vertical: PROMO_SAMPLE_TEXT.vertical.ko,
    merely: PROMO_SAMPLE_TEXT.merely.ko,
    morning_light: PROMO_SAMPLE_TEXT.morning_light.ko,
  }, {
    spontaneous: '자연스러운',
    vertical: '수직의',
    merely: '단지',
    morning_light: '아침 햇살이 나무 사이로 스며들었다.',
  });
});

test('the complete promo table records every cross-language text collision', () => {
  const collisions = Object.fromEntries(Object.entries(PROMO_SAMPLE_TEXT).flatMap(([sample, byLanguage]) => {
    const languagesByText = new Map<string, string[]>();
    for (const [lang, text] of Object.entries(byLanguage)) {
      languagesByText.set(text, [...(languagesByText.get(text) ?? []), lang]);
    }
    return [...languagesByText.entries()]
      .filter(([, languages]) => languages.length > 1)
      .map(([text, languages]) => [`${sample}:${text}`, languages]);
  }));

  assert.deepEqual(collisions, {
    'spontaneous:Spontan': ['de', 'id', 'sv'],
    'vertical:Vertical': ['en', 'es', 'fr', 'pt'],
    'vertical:Vertikal': ['de', 'id', 'sv'],
  });
});
