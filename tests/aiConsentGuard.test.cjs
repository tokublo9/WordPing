const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

/**
 * Structural guarantees for AI data-sharing consent.
 *
 * The behaviour is covered by tests/unit/aiConsent.test.ts against the real
 * modules. What is asserted here is the shape the codebase has to keep for that
 * behaviour to be reachable at all: one enforcement point that every request
 * passes through, no second network caller, and a prompt at every surface a
 * user can start an AI feature from. A refactor that quietly reintroduces a
 * bypass fails here rather than at App Review.
 */

test('the one network boundary checks consent before anything leaves the device', () => {
  const client = read('src/lib/api/client.ts');

  assert.match(client, /import \{ configureAIConsentStorage, requireAIConsent \} from '\.\.\/aiConsent';/u);

  // The guard must be inside `post`, which every endpoint helper funnels into.
  const post = client.slice(client.indexOf('async function post('));
  assert.notEqual(post, '');
  const guardAt = post.indexOf('await requireAIConsent()');
  const fetchAt = post.indexOf('await fetch(');
  const identityAt = post.indexOf('await getIdentity()');
  assert.ok(guardAt > -1, 'post() must call requireAIConsent()');
  assert.ok(guardAt < fetchAt, 'consent must be checked before the request is sent');
  assert.ok(guardAt < identityAt, 'consent must be checked before identity is resolved');

  // Both endpoint helpers go through post, so neither can skip the guard.
  assert.match(client, /export async function postText\([\s\S]*?await post\(/u);
  assert.match(client, /export async function postSpeech\([\s\S]*?await post\(/u);
});

test('no module other than the guarded client sends a production request', () => {
  const sources = [
    'src/lib/openaiGateway.ts',
    'src/lib/tts.ts',
    'src/lib/generateMeaning.ts',
    'src/lib/prototypeTextToSpeech.ts',
    'src/components/WordModal.tsx',
    'src/components/SettingsModal.tsx',
    'src/components/ProSheet.tsx',
    'src/components/TextToSpeechScreen.tsx',
    'src/hooks/useWordCardVoicePlayback.ts',
    'App.tsx',
  ];
  for (const path of sources) {
    assert.doesNotMatch(read(path), /\bfetch\(/u, `${path} must not call fetch directly`);
  }
  // The single exception is the loopback-only development probe, which carries
  // no user text and cannot target a non-local host.
  const devProbe = read('src/dev/localAiVoiceScenario.ts');
  assert.match(devProbe, /if \(!__DEV__\) return null;/u);
  assert.match(devProbe, /LOCAL_HOSTS\.has\(url\.hostname\.toLowerCase\(\)\)/u);
});

test('consent can never default to granted', () => {
  const consent = read('src/lib/aiConsent.ts');

  // An allowlist of two exact words — anything else, including a missing or
  // truncated value, falls through to 'unknown'.
  assert.match(consent, /if \(raw === 'granted'\) return 'granted';/u);
  assert.match(consent, /if \(raw === 'declined'\) return 'declined';/u);
  assert.match(consent, /return 'unknown';/u);
  assert.match(consent, /let cached: AIConsentState = 'unknown';/u);

  // The guard passes for exactly one value and throws for everything else.
  assert.match(consent, /if \(state === 'granted'\) return;\s*throw new AIRequestError\('consent_required'/u);
});

test('every user-initiated AI surface asks before it acts', () => {
  const surfaces = {
    // Word-card AI voice, the AI feature shipping in the current build.
    'src/hooks/useWordCardVoicePlayback.ts': 1,
    // The voice picker's previews.
    'src/components/SettingsModal.tsx': 1,
    // AI meaning, example, breakdown and the two translations.
    'src/components/WordModal.tsx': 5,
    // Standalone Text-to-Speech.
    'src/components/TextToSpeechScreen.tsx': 1,
  };

  for (const [path, expected] of Object.entries(surfaces)) {
    const source = read(path);
    assert.match(
      source,
      /import \{ ensureAIConsentForUserAction \} from '.*aiConsentPrompt';/u,
      `${path} must import the shared consent check`,
    );
    const calls = source.match(/ensureAIConsentForUserAction\(\)/gu) ?? [];
    assert.ok(
      calls.length >= expected,
      `${path} should gate ${expected} AI action(s), found ${calls.length}`,
    );
  }

  // The Upgrade sheet is deliberately absent: its two promotional clips are
  // fixed WordPing copy sent with no identifiers, so there is nothing to
  // consent to. They go through `postPromoSpeech`, not the guarded path.
  const sheet = read('src/components/ProSheet.tsx');
  assert.doesNotMatch(sheet, /ensureAIConsentForUserAction/u);
  assert.match(read('src/lib/api/client.ts'), /export async function postPromoSpeech/u);
});

test('device TTS and attached audio stay usable without consent', () => {
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');
  // Only the subscriber path reaches the network; free-plan expo-speech and a
  // card's own audio file must not be gated.
  assert.match(
    playback,
    /const usesAI = isSubscribed && !\(target === 'word' && Boolean\(item\.audioUri\)\);/u,
  );
  assert.match(playback, /if \(usesAI && !await ensureAIConsentForUserAction\(\)\) return;/u);
});

test('background preloads never transmit and never prompt', () => {
  const tts = read('src/lib/tts.ts');
  assert.match(tts, /import \{ isAIConsentGranted \} from '\.\/aiConsent';/u);

  // Each unattended path checks the cached decision and does nothing without it.
  const single = tts.slice(tts.indexOf('export function preloadAIPronunciation('));
  assert.match(single.slice(0, 800), /if \(!isAIConsentGranted\(\)\) return;/u);

  const library = tts.slice(tts.indexOf('export function preloadAIPronunciationLibrary('));
  assert.match(library.slice(0, 800), /if \(!isAIConsentGranted\(\)\) return;/u);

  const samples = tts.slice(tts.indexOf('export function syncAIVoiceSamplePreloading('));
  assert.match(samples.slice(0, 800), /voiceSamplePreloadEligible = options\.hasAIAccess && isAIConsentGranted\(\);/u);

  // None of them may raise a dialog: there is no user action behind them.
  assert.doesNotMatch(tts, /ensureAIConsentForUserAction/u);
});

test('a consent dialog host is mounted wherever one can be asked for', () => {
  const hosts = {
    // The root host: word cards and anything outside a presented modal.
    'App.tsx': /<AIConsentDialog active pal=\{pal\} themeColor=\{activeThemeColor\} \/>/u,
    // Each of these presents its own native controller, so it needs its own.
    'src/components/SettingsModal.tsx': /<AIConsentDialog active=\{visible\}/u,
    'src/components/WordModal.tsx': /<AIConsentDialog active=\{visible\}/u,
    'src/components/TextToSpeechScreen.tsx': /<AIConsentDialog active=\{visible\}/u,
  };
  for (const [path, pattern] of Object.entries(hosts)) {
    assert.match(read(path), pattern, `${path} must mount a consent dialog host`);
  }
});

test('dismissing the dialog is wired to the no-consent path, not to Allow', () => {
  const dialog = read('src/components/AIConsentDialog.tsx');
  // Backdrop tap and the hardware back button both dismiss without deciding.
  assert.match(dialog, /onRequestClose=\{dismiss\}/u);
  assert.match(dialog, /onPress=\{dismiss\}/u);
  assert.match(dialog, /const dismiss = useCallback\(\(\) => \{[\s\S]*?dismissAIConsentPrompt\(\);/u);
  assert.match(dialog, /onPress=\{\(\) => decide\('granted'\)\}/u);
  assert.match(dialog, /onPress=\{\(\) => decide\('declined'\)\}/u);
  // Nothing may be pre-selected or auto-confirmed.
  assert.doesNotMatch(dialog, /useState\(true\)/u);
});

test('Settings exposes the decision, a way to revoke it, and the policy', () => {
  const settings = read('src/components/SettingsModal.tsx');

  assert.match(settings, /t\('privacy_section'\)/u);
  assert.match(settings, /label=\{t\('ai_consent_setting'\)\}/u);
  assert.match(settings, /value=\{aiConsent === 'granted'\}/u);
  // Turning it on shows the disclosure; the switch alone never grants.
  assert.match(
    settings,
    /if \(next\) \{\s*void ensureAIConsentForUserAction\(\);\s*return;\s*\}\s*void setAIConsent\('declined'\);/u,
  );
  // All three states are legible, including "not set".
  assert.match(settings, /ai_consent_status_granted/u);
  assert.match(settings, /ai_consent_status_declined/u);
  assert.match(settings, /ai_consent_status_unknown/u);
  // The policy is reachable from Settings → App Info. It used to be repeated in
  // the Privacy section as well; one canonical link replaced the pair, and App
  // Info is open to every plan while this section is not.
  const appInfo = settings.slice(settings.indexOf('// ── App Info sheet'));
  assert.match(appInfo, /label=\{t\('privacy_policy'\)\}/u);
  assert.match(appInfo, /openExternal\(LEGAL_URLS\.privacy\)/u);
});

test('the consent copy names the provider and ships in English and Japanese', () => {
  const i18n = read('src/i18n.ts');
  const keys = [
    'ai_consent_title', 'ai_consent_body', 'ai_consent_allow', 'ai_consent_decline',
    'ai_consent_setting', 'ai_consent_setting_desc', 'ai_consent_setting_info',
    'ai_consent_status_granted', 'ai_consent_status_declined', 'ai_consent_status_unknown',
    'ai_consent_required_msg', 'privacy_section',
  ];
  for (const key of keys) {
    const occurrences = i18n.match(new RegExp(`^\\s{2}${key}:`, 'gmu')) ?? [];
    assert.equal(occurrences.length, 2, `${key} needs an English and a Japanese entry`);
  }

  // The dialog must identify who receives the data, in both languages.
  assert.match(i18n, /ai_consent_body:[\s\S]{0,400}OpenAI/u);
  assert.match(i18n, /ai_consent_body:[\s\S]{0,600}OpenAIへ送信します/u);
  assert.match(i18n, /ai_consent_allow: 'Allow and Continue'/u);
  assert.match(i18n, /ai_consent_decline: 'Not Now'/u);
  assert.match(i18n, /ai_consent_allow: '許可して続ける'/u);
  assert.match(i18n, /ai_consent_decline: '今は許可しない'/u);
});

test('consent is not part of any backup, so a file cannot grant it', () => {
  const format = read('src/lib/backup/format.ts');
  assert.doesNotMatch(format, /ai_data_sharing_consent|aiConsent/u);
  // It lives in AsyncStorage under its own key, outside the exported settings.
  assert.match(read('src/lib/aiConsent.ts'), /export const AI_CONSENT_KEY = 'ai_data_sharing_consent';/u);
});
