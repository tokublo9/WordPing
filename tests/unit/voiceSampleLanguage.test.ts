import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  AI_CONSENT_KEY,
  configureAIConsentStorage,
  resetAIConsentForTests,
} from '../../src/lib/aiConsent';
import {
  ensureAIConsentForUserAction,
  registerAIConsentPromptHost,
  resetAIConsentPromptForTests,
  resolveAIConsentPrompt,
} from '../../src/lib/aiConsentPrompt';
import { createVoicePreviewFlow } from '../../src/features/voice/voicePreviewFlow';
import { resolveVoiceSampleLanguage } from '../../src/features/voice/voiceSampleLanguage';
import { AI_VOICES, type AIVoice } from '../../src/lib/aiVoices';
import {
  PROMO_SAMPLE_LANGS,
  PROMO_SAMPLE_TEXT,
  PROMO_SAMPLE_VERSION,
  VOICE_PROMO_SAMPLE_IDS,
  promoSampleText,
  promoSampleVoice,
  voiceSampleId,
} from '../../src/lib/promoVoiceSamples';
import { normalizeTTSRequest, serializeTTSCacheKey } from '../../src/lib/ttsRequest';

/**
 * Which language a Marin or Cedar sample speaks, and what it says.
 *
 * The bug these cover: the picker's samples were one fixed English sentence,
 * generated from `Welcome to WordCore. This is the ${voice} voice.` and spoken
 * in English whatever the user had chosen — including for someone who had just
 * picked Korean as their Explanation Language in the tutorial. There was no
 * language input on that path at all.
 *
 * The sample is a localized fixed clip now, and the language is resolved from
 * live state at the moment of the tap. Both halves are exercised here: the rule
 * itself, and a picker built the way the real one is, so a language changed in
 * Settings has to reach the next tap without anything being remounted.
 */

// ── The rule ─────────────────────────────────────────────────────────────────

test('the tutorial answers with the Explanation Language it just collected', () => {
  // The app language is still the launch default at this point — onboarding
  // sets it from this very answer when it completes — so it must not win.
  assert.equal(resolveVoiceSampleLanguage({
    onboardingActive: true,
    nativeLang: 'ko-KR',
    appLanguage: 'en-US',
  }), 'ko');
  assert.equal(resolveVoiceSampleLanguage({
    onboardingActive: true,
    nativeLang: 'ja-JP',
    appLanguage: 'en-US',
  }), 'ja');
});

test('after the tutorial, Settings → Language is the authority', () => {
  // The same stored onboarding answer, now outranked by the current choice.
  assert.equal(resolveVoiceSampleLanguage({
    onboardingActive: false,
    nativeLang: 'ja-JP',
    appLanguage: 'ko',
  }), 'ko');
  assert.equal(resolveVoiceSampleLanguage({
    onboardingActive: false,
    nativeLang: 'ko-KR',
    appLanguage: 'en-US',
  }), 'en');
});

test('every language the picker can be shown in resolves to its own row', () => {
  // The UI language codes as `SUPPORTED_LANGUAGES` spells them, including the
  // three regional ones, each landing on its own sample row rather than en.
  const uiLanguages = [
    'en-US', 'es', 'fr', 'ja', 'ko', 'zh-CN', 'de', 'it', 'pt-BR', 'ru',
    'ar', 'hi', 'tr', 'nl', 'vi', 'th', 'id', 'pl', 'el', 'sv',
  ];
  const resolved = uiLanguages.map(appLanguage => resolveVoiceSampleLanguage({
    onboardingActive: false,
    nativeLang: null,
    appLanguage,
  }));
  assert.deepEqual([...resolved].sort(), [...PROMO_SAMPLE_LANGS].sort());
});

test('an unusable answer falls back to English rather than to nothing', () => {
  for (const appLanguage of [null, undefined, '', 'other', 'klingon']) {
    assert.equal(resolveVoiceSampleLanguage({
      onboardingActive: false,
      nativeLang: null,
      appLanguage,
    }), 'en');
  }
  // An empty tutorial answer defers to the app language instead of English.
  assert.equal(resolveVoiceSampleLanguage({
    onboardingActive: true,
    nativeLang: '',
    appLanguage: 'ko',
  }), 'ko');
});

// ── The sentences ────────────────────────────────────────────────────────────

test('each voice previews its own sentence, in every locale', () => {
  assert.deepEqual([...VOICE_PROMO_SAMPLE_IDS], ['voice_marin', 'voice_cedar']);
  assert.deepEqual(AI_VOICES.map(voiceSampleId), ['voice_marin', 'voice_cedar']);

  for (const lang of PROMO_SAMPLE_LANGS) {
    const marin = promoSampleText('voice_marin', lang);
    const cedar = promoSampleText('voice_cedar', lang);
    for (const [name, text] of [['marin', marin], ['cedar', cedar]] as const) {
      assert.equal(typeof text, 'string', `${name}/${lang}`);
      assert.notEqual(text.trim(), '', `${name}/${lang} is empty`);
    }
    assert.notEqual(marin, cedar, `${lang} gives both voices the same sentence`);
  }
});

test('no locale is left speaking the English sentence', () => {
  for (const sample of VOICE_PROMO_SAMPLE_IDS) {
    const english = PROMO_SAMPLE_TEXT[sample].en;
    for (const lang of PROMO_SAMPLE_LANGS) {
      if (lang === 'en') continue;
      assert.notEqual(
        PROMO_SAMPLE_TEXT[sample][lang],
        english,
        `${sample}/${lang} still ships the English sentence`,
      );
    }
  }
});

test('Korean and Japanese are written in their own scripts, not transliterated', () => {
  // Pronunciation follows the text, so Latin letters here would be spoken as
  // English however the language code was set.
  assert.match(PROMO_SAMPLE_TEXT.voice_marin.ko, /^[^A-Za-z]*$/u);
  assert.match(PROMO_SAMPLE_TEXT.voice_cedar.ko, /^[^A-Za-z]*$/u);
  assert.match(PROMO_SAMPLE_TEXT.voice_marin.ja, /^[^A-Za-z]*$/u);
  assert.match(PROMO_SAMPLE_TEXT.voice_cedar.ja, /^[^A-Za-z]*$/u);
  // Hangul and kana/kanji specifically, so a wrong-script paste fails here.
  assert.match(PROMO_SAMPLE_TEXT.voice_marin.ko, /[가-힣]/u);
  assert.match(PROMO_SAMPLE_TEXT.voice_cedar.ja, /[぀-ヿ一-鿿]/u);
});

test('the on-device cache key carries both the voice and the locale', () => {
  const key = (voice: AIVoice, lang: 'en' | 'ko' | 'ja') => {
    const sample = voiceSampleId(voice);
    return serializeTTSCacheKey(normalizeTTSRequest(
      promoSampleText(sample, lang),
      promoSampleVoice(sample),
      PROMO_SAMPLE_VERSION,
      lang,
    ));
  };

  const keys = [
    key('marin', 'en'), key('marin', 'ko'), key('marin', 'ja'),
    key('cedar', 'en'), key('cedar', 'ko'), key('cedar', 'ja'),
  ];
  assert.equal(new Set(keys).size, keys.length, 'a voice or a locale must split the key');
  assert.match(key('marin', 'ko'), /"voice":"marin"/u);
  assert.match(key('cedar', 'ko'), /"voice":"cedar"/u);
  assert.match(key('cedar', 'ko'), /"language":"ko"/u);
});

// ── The picker, wired the way the real one is ────────────────────────────────

class FakeStore {
  constructor(private value: string | null = null) {}
  getItem(key: string): Promise<string | null> {
    assert.equal(key, AI_CONSENT_KEY);
    return Promise.resolve(this.value);
  }
  setItem(key: string, value: string): Promise<void> {
    assert.equal(key, AI_CONSENT_KEY);
    this.value = value;
    return Promise.resolve();
  }
}

function mountConsentHost(): void {
  registerAIConsentPromptHost({ open: () => {}, close: () => {} });
}

interface Spoken {
  voice: AIVoice;
  lang: string;
  text: string;
}

/**
 * The picker's `play`, built once — exactly as `createVoicePreviewFlow` keeps
 * it for the life of the screen — and reading the language through a ref that
 * the render refreshes. Anything that captured the language when this closure
 * was created would fail the Settings-change test below.
 */
function picker(state: { onboardingActive: boolean; nativeLang: string | null; appLanguage: string }) {
  const spoken: Spoken[] = [];
  const sampleLanguageRef = {
    get current() {
      return resolveVoiceSampleLanguage({
        onboardingActive: state.onboardingActive,
        nativeLang: state.nativeLang,
        appLanguage: state.appLanguage,
      });
    },
  };

  const flow = createVoicePreviewFlow<AIVoice>({
    ensureConsent: () => ensureAIConsentForUserAction(),
    play: async voice => {
      const lang = sampleLanguageRef.current;
      spoken.push({ voice, lang, text: promoSampleText(voiceSampleId(voice), lang) });
    },
    stop: () => {},
    onChange: () => {},
    onError: () => {},
  });

  return { flow, spoken };
}

beforeEach(() => {
  resetAIConsentForTests();
  resetAIConsentPromptForTests();
  configureAIConsentStorage(new FakeStore('granted'));
  mountConsentHost();
});

test('a Korean tutorial plays the Korean Marin sentence', async () => {
  const { flow, spoken } = picker({
    onboardingActive: true,
    nativeLang: 'ko-KR',
    appLanguage: 'en-US',
  });

  assert.equal(await flow.request('marin'), 'played');
  assert.deepEqual(spoken, [{
    voice: 'marin',
    lang: 'ko',
    text: PROMO_SAMPLE_TEXT.voice_marin.ko,
  }]);
});

test('a Japanese tutorial plays the Japanese Cedar sentence', async () => {
  const { flow, spoken } = picker({
    onboardingActive: true,
    nativeLang: 'ja-JP',
    appLanguage: 'en-US',
  });

  assert.equal(await flow.request('cedar'), 'played');
  assert.deepEqual(spoken, [{
    voice: 'cedar',
    lang: 'ja',
    text: PROMO_SAMPLE_TEXT.voice_cedar.ja,
  }]);
});

test('changing Settings → Language changes the very next tap', async () => {
  const state = { onboardingActive: false, nativeLang: 'en-US', appLanguage: 'en-US' };
  const { flow, spoken } = picker(state);

  assert.equal(await flow.request('marin'), 'played');

  // Settings → Language, with the picker still on screen and the flow — and
  // its `play` closure — untouched. No relaunch, no remount.
  state.appLanguage = 'ko';

  assert.equal(await flow.request('cedar'), 'played');
  assert.equal(await flow.request('marin'), 'played');

  assert.deepEqual(spoken.map(entry => entry.lang), ['en', 'ko', 'ko']);
  assert.deepEqual(spoken.map(entry => entry.text), [
    PROMO_SAMPLE_TEXT.voice_marin.en,
    PROMO_SAMPLE_TEXT.voice_cedar.ko,
    PROMO_SAMPLE_TEXT.voice_marin.ko,
  ]);
});

test('the two rows never speak each other’s sentence', async () => {
  const { flow, spoken } = picker({
    onboardingActive: false,
    nativeLang: null,
    appLanguage: 'ko',
  });

  await flow.request('marin');
  await flow.request('cedar');

  assert.deepEqual(spoken.map(entry => entry.voice), ['marin', 'cedar']);
  assert.equal(new Set(spoken.map(entry => entry.text)).size, 2);
  assert.equal(spoken[0]!.text, PROMO_SAMPLE_TEXT.voice_marin.ko);
  assert.equal(spoken[1]!.text, PROMO_SAMPLE_TEXT.voice_cedar.ko);
});

test('a tap that has to ask first resumes in the language it was tapped in', async () => {
  resetAIConsentForTests();
  configureAIConsentStorage(new FakeStore(null));
  const { flow, spoken } = picker({
    onboardingActive: true,
    nativeLang: 'ko-KR',
    appLanguage: 'en-US',
  });

  const request = flow.request('cedar');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(spoken, [], 'nothing is generated before the answer');

  await resolveAIConsentPrompt('granted');
  assert.equal(await request, 'played');
  assert.deepEqual(spoken, [{
    voice: 'cedar',
    lang: 'ko',
    text: PROMO_SAMPLE_TEXT.voice_cedar.ko,
  }]);
});
