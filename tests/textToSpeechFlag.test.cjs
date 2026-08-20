const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('one disabled flag gates every Text-to-Speech surface', () => {
  const flags = read('src/features/flags.ts');
  const app = read('App.tsx');
  const modals = read('src/app/AppModals.tsx');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const proSheet = read('src/components/ProSheet.tsx');

  assert.match(flags, /export const TEXT_TO_SPEECH_ENABLED = false;/u);
  assert.match(wordList, /TEXT_TO_SPEECH_ENABLED && \(isPremium \|\| hasTextToSpeechHistory\) && \(/u);
  assert.match(modals, /\{TEXT_TO_SPEECH_ENABLED && \(\s*<TextToSpeechScreen/u);
  assert.match(app, /visible: TEXT_TO_SPEECH_ENABLED && textToSpeechVisible/u);
  assert.match(app, /onOpenTextToSpeech: \(\) => \{\s*if \(!TEXT_TO_SPEECH_ENABLED\) return;/u);
  assert.match(proSheet, /filterTextToSpeechEntries\([\s\S]*?feature => feature\.key === 'text_to_speech'/u);
  assert.match(proSheet, /textToSpeech: true/u);
  assert.match(proSheet, /row => row\.textToSpeech === true/u);
});

test('disabled Text-to-Speech does not read history during app startup', () => {
  const app = read('App.tsx');
  assert.match(
    app,
    /useEffect\(\(\) => \{\s*if \(!TEXT_TO_SPEECH_ENABLED\) return;[\s\S]{0,220}loadPrototypeSpeechHistory\(\)/u,
  );
});

test('the complete implementation, saved data and translations remain intact', () => {
  const screen = read('src/components/TextToSpeechScreen.tsx');
  const implementation = read('src/lib/prototypeTextToSpeech.ts');
  const i18n = read('src/i18n.ts');
  const workerVoice = read('cloudflare/wordping-api/src/routes/voice.ts');
  const workerConfig = read('cloudflare/wordping-api/src/config.ts');

  assert.match(screen, /export function TextToSpeechScreen/u);
  assert.match(implementation, /HISTORY_KEY = '@wordping\/text_to_speech_history'/u);
  assert.match(implementation, /export async function generatePrototypeSpeech/u);
  assert.match(implementation, /export async function loadPrototypeSpeechHistory/u);
  assert.match(i18n, /feat_text_to_speech_title:/u);
  assert.match(i18n, /feat_text_to_speech_desc:/u);
  assert.match(workerVoice, /feature: 'voice_custom'/u);
  assert.match(workerConfig, /voice_custom: 'premium'/u);
});

test('Text-to-Speech definitions remain ready for flag re-enablement', () => {
  const proSheet = read('src/components/ProSheet.tsx');
  assert.match(proSheet, /key: 'text_to_speech'/u);
  assert.match(proSheet, /PAYWALL_IMAGES\.textToSpeech/u);
  assert.match(proSheet, /t\('feat_text_to_speech_title'\)/u);
});
