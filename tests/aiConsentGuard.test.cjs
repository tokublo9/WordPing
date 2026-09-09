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

test('the one network boundary gates user content and isolates fixed promo', () => {
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
  assert.match(post, /if \(kind === 'user-content'\) \{\s*requireAIEntitlement\(\);\s*await requireAIConsent\(\);\s*\}/u);
  assert.match(post, /const identity = kind !== 'fixed-promo' \? await getIdentity\(\) : null;/u);

  // Both endpoint helpers go through post, so neither can skip the guard.
  assert.match(client, /export async function postText\([\s\S]*?await post\(/u);
  assert.match(client, /export async function postSpeech\([\s\S]*?await post\(/u);
  const promo = client.slice(client.indexOf('export async function postPromoSpeech('));
  assert.match(promo, /'fixed-promo'/u);
  assert.doesNotMatch(promo, /requireAIConsent|getIdentity|\btext\b|\bvoice\b|\binstructions\b/u);
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

  // The Upgrade sheet is deliberately absent: its fixed promotional clips are
  // fixed WordPing copy sent with no identifiers, so there is nothing to
  // consent to. They go through `postPromoSpeech`, not the guarded path.
  const sheet = read('src/components/ProSheet.tsx');
  assert.doesNotMatch(sheet, /ensureAIConsentForUserAction/u);
  assert.match(read('src/lib/api/client.ts'), /export async function postPromoSpeech/u);
});

test('device TTS and attached audio stay usable without consent', () => {
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');
  // Only the AI-Voice path reaches the network; device expo-speech — which is
  // what Free *and Basic* now get — and a card's own audio file must not be
  // gated. The flag is the capability, never a plan name.
  assert.match(
    playback,
    /const usesAI = canUseAIVoice && !\(target === 'word' && Boolean\(item\.audioUri\)\);/u,
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

test('the voice picker carries its own host, so the dialog is above it in a release build', () => {
  const settings = read('src/components/SettingsModal.tsx');

  // The bug this pins: the picker is presented from Settings' own controller,
  // and iOS refuses to present a second modal from a controller that is already
  // presenting one. A host declared out in Settings therefore opened a dialog
  // that could never appear — a logged warning on a debug build, silence in
  // TestFlight — and the sample tap waited forever on an answer nobody could
  // give. There are two hosts in this file for that reason, and the picker's
  // must be inside the picker's own <Modal>.
  assert.equal((settings.match(/<AIConsentDialog active=\{visible\}/gu) ?? []).length, 2);

  const picker = /function VoiceSelectionScreen\(\{[\s\S]*?\n\}\n/u.exec(settings)?.[0];
  assert.ok(picker, 'VoiceSelectionScreen not found');
  assert.match(picker, /<AIConsentDialog active=\{visible\} pal=\{pal\} themeColor=\{themeColor\} \/>/u);
  // Inside the picker's Modal, not beside it: the closing </Modal> comes after.
  const hostAt = picker.indexOf('<AIConsentDialog');
  assert.ok(hostAt > picker.indexOf('<Modal'), 'the host must be inside the picker modal');
  assert.ok(hostAt < picker.indexOf('</Modal>'), 'the host must be inside the picker modal');

  // Nothing on this path is conditional on the build. A guard that only held in
  // development is exactly how this reached TestFlight in the first place.
  const dialog = read('src/components/AIConsentDialog.tsx');
  for (const [path, source] of [['SettingsModal.tsx', picker], ['AIConsentDialog.tsx', dialog]]) {
    assert.doesNotMatch(source, /__DEV__/u, `${path} must behave the same in a release build`);
  }

  // The host registers while its screen is on top and unregisters when it goes,
  // which is what settles a question the user closed the screen on.
  assert.match(dialog, /return registerAIConsentPromptHost\(\{/u);
  const prompt = read('src/lib/aiConsentPrompt.ts');
  assert.match(prompt, /if \(pending !== null && !hosts\.includes\(host\)\) settle\('unknown'\);/u);
  assert.match(prompt, /if \(host === undefined\) return Promise\.resolve\('unknown'\);/u);
  // A second tap joins the open question rather than stacking a dialog on it.
  assert.match(prompt, /if \(pending !== null\) \{\s*const previous = pending;/u);
});

test('a sample preview always releases the row it was started from', () => {
  const flow = read('src/features/voice/voicePreviewFlow.ts');
  // Every exit — Allow, Not Now, a dismissal, a missing host, an outage, a
  // cancellation — passes through one cleanup, so no answer can leave a row
  // spinning behind a dialog that is gone.
  assert.match(flow, /\} finally \{[\s\S]*?if \(run === sequence\) publish\(null, 'idle'\);/u);
  // The consent await is inside the try, or the refusal path would skip it.
  const body = flow.slice(flow.indexOf('async function request('));
  assert.ok(
    body.indexOf('await options.ensureConsent()') > body.indexOf('try {'),
    'the consent wait must be covered by the cleanup',
  );

  // The picker feeds that cleanup straight into its only preview state, and
  // guards the write so a run settling after the screen has gone is harmless.
  const settings = read('src/components/SettingsModal.tsx');
  assert.match(settings, /onChange: snapshot => \{ if \(mounted\.current\) setPreviewState\(snapshot\); \},/u);
  assert.match(settings, /const previewingVoice = voicePreviewPlayingVoice\(previewState\);/u);
  assert.match(settings, /const loadingVoice = voicePreviewBusyVoice\(previewState\);/u);
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

test('permission can still be withdrawn, from About AI Voice', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const dialog = read('src/components/AboutAIVoiceDialog.tsx');

  // The standalone Settings row was removed; the withdrawal moved into the
  // About AI Voice explanation, which is where the feature is described.
  assert.doesNotMatch(settings, /ai_consent_setting_desc|handleToggleAIConsent/u);
  assert.match(settings, /<AboutAIVoiceDialog/u);

  // One action, and its label is the state: Withdraw while permission is held,
  // Allow otherwise — so it can never offer something the stored value
  // contradicts, which is what the old "granted only" branch was protecting.
  assert.match(dialog, /const consent = useAIConsent\(\);/u);
  assert.match(dialog, /const granted = consent === 'granted';/u);
  assert.match(dialog, /const actionKey = granted \? 'ai_consent_withdraw' : 'ai_consent_grant';/u);
  assert.match(dialog, /onPress=\{granted \? revoke : \(\) => \{ void apply\('granted'\); \}\}/u);
  // Withdrawing is confirmed first, then written through the shared store.
  assert.match(dialog, /onPress: \(\) => \{ void apply\('declined'\); \}/u);
  assert.match(dialog, /await setAIConsent\(next\);/u);
  // Whatever it writes comes from an explicit tap on that button: the dialog
  // never grants on open and never routes through the implicit action prompt.
  assert.doesNotMatch(dialog, /ensureAIConsentForUserAction/u);

  // The policy is still reachable from Settings → App Info, unchanged.
  const appInfo = settings.slice(settings.indexOf('// ── App Info sheet'));
  assert.match(appInfo, /label=\{t\('privacy_policy'\)\}/u);
  assert.match(appInfo, /openExternal\(LEGAL_URLS\.privacy\)/u);
});

test('the consent copy names the provider and ships in every locale', () => {
  const i18n = read('src/i18n.ts');
  // The number of dictionaries, read out of the file rather than written down.
  // `test_info_title` is required of every locale, so counting it counts them.
  // This assertion used to expect 2, from when consent copy was English and
  // Japanese only; the point was always "one entry per locale", not "two".
  const locales = (i18n.match(/^ {2}test_info_title:/gmu) ?? []).length;
  assert.ok(locales >= 20, `expected every locale, found ${locales}`);

  const keys = [
    'ai_consent_title', 'ai_consent_body', 'ai_consent_allow', 'ai_consent_decline',
    'ai_consent_setting',
    'ai_consent_status_granted', 'ai_consent_status_declined', 'ai_consent_status_unknown',
    'ai_consent_required_msg',
    // The withdrawal that replaced the removed Settings row.
    'ai_consent_withdraw', 'ai_consent_withdraw_confirm',
  ];
  for (const key of keys) {
    const occurrences = i18n.match(new RegExp(`^ {2}${key}:`, 'gmu')) ?? [];
    assert.equal(occurrences.length, locales, `${key} needs exactly one entry per locale`);
  }

  // The dialog must identify who receives the data — in every language, since
  // this is the disclosure the permission rests on. "OpenAI" is a company name
  // and is never translated, so one count covers all of them.
  assert.equal(
    (i18n.match(/^ {2}ai_consent_body:/gmu) ?? []).length,
    (i18n.match(/^ {2}ai_consent_body:[\s\S]*?(?=\n {2}[a-z_]+:)/gmu) ?? [])
      .filter(body => body.includes('OpenAI')).length,
    'every locale names OpenAI in the consent body',
  );
  assert.match(i18n, /ai_consent_body:[\s\S]{0,400}OpenAI/u);
  assert.match(i18n, /ai_consent_body:[\s\S]{0,600}OpenAIへ送信します/u);
  assert.match(i18n, /ai_consent_allow: 'Allow and Continue'/u);
  assert.match(i18n, /ai_consent_decline: 'Not Now'/u);
  assert.match(i18n, /ai_consent_allow: '許可して続ける'/u);
  assert.match(i18n, /ai_consent_decline: '今は許可しない'/u);
  // Arabic is the one right-to-left locale, and the buttons a user presses to
  // grant or refuse must read in Arabic rather than fall back to English.
  assert.match(i18n, /ai_consent_allow: 'السماح والمتابعة'/u);
  assert.match(i18n, /ai_consent_decline: 'عدم السماح الآن'/u);
});

test('consent is not part of any backup, so a file cannot grant it', () => {
  const format = read('src/lib/backup/format.ts');
  assert.doesNotMatch(format, /ai_data_sharing_consent|aiConsent/u);
  // It lives in AsyncStorage under its own key, outside the exported settings.
  assert.match(read('src/lib/aiConsent.ts'), /export const AI_CONSENT_KEY = 'ai_data_sharing_consent';/u);
});
