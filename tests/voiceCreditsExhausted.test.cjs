const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

/**
 * Basic's one-time AI Voice grant, seen from the app.
 *
 * The device holds no credit count on purpose, so every assertion here is about
 * the app reacting to the server's answer rather than predicting it.
 */

test('the dialog is raised by the server answer, never by a local count', () => {
  const errors = read('src/lib/api/errors.ts');
  const hook = read('src/hooks/useWordCardVoicePlayback.ts');
  const dialog = read('src/components/VoiceCreditsExhaustedDialog.tsx');

  // The Worker's code becomes its own kind, distinct from the monthly limit and
  // from a plan boundary — the two it would otherwise be confused with.
  assert.match(errors, /voice_credits_exhausted: 'voice_credits_exhausted',/u);
  assert.match(hook, /case 'voice_credits_exhausted':/u);
  assert.match(hook, /onVoiceCreditsExhausted\?\.\(\(\) => \{ void speakOnDevice\(\); \}\)/u);

  // No mirrored balance anywhere in the app.
  for (const source of [hook, dialog, read('App.tsx')]) {
    assert.doesNotMatch(source, /remainingCredits|creditsRemaining/u);
  }
  // The dialog reads the size of the grant for its copy, never a live balance.
  assert.match(dialog, /VOICE_LIFETIME_CREDITS\.basic \?\? 0/u);
});

test('the two buttons do what they say, and nothing else closes the dialog', () => {
  const dialog = read('src/components/VoiceCreditsExhaustedDialog.tsx');
  const app = read('App.tsx');

  assert.match(dialog, /\{t\('voice_credits_upgrade'\)\}/u);
  assert.match(dialog, /\{t\('voice_credits_use_free'\)\}/u);
  // No backdrop touchable and no close button: both ways out are decisions.
  assert.doesNotMatch(dialog, /StyleSheet\.absoluteFill\b[\s\S]{0,200}onPress/u);
  // Android back maps to the outcome that leaves the app working.
  assert.match(dialog, /onRequestClose=\{onUseFreeVoice\}/u);

  // Upgrade opens the paywall and starts no audio.
  assert.match(app, /const handleUpgradeFromVoiceCredits = useCallback\(\(\) => \{\s*setVoiceCreditsFallback\(null\);\s*setProSheetVisible\(true\);/u);
  // Use Free Voice sets the preference first, then speaks the word that failed.
  assert.match(app, /setPreferDeviceVoice\(true\);\s*setVoiceCreditsFallback\(current => \{\s*current\?\.\(\);/u);
});

test('choosing the free voice stops the dialog returning, and picking a voice restores it', () => {
  const app = read('App.tsx');
  const constants = read('src/constants.ts');

  // The preference is half of the capability, so no further generation is even
  // attempted — which is what makes the dialog non-repeating.
  assert.match(app, /const canUseAIVoice = canUseAI && !preferDeviceVoice;/u);
  assert.match(constants, /export const PREFER_DEVICE_VOICE_KEY = 'prefer_device_voice';/u);

  // Selecting a voice again is the documented way back.
  assert.match(
    app,
    /const handlePickAIVoice = useCallback\(\(voice: AIVoice\) => \{\s*setAIVoice\(voice\);\s*setPreferDeviceVoice\(false\);/u,
  );
  assert.match(app, /onPickAIVoice: handlePickAIVoice,/u);

  // It is a preference, never an entitlement: it is not in the AI rule module.
  assert.doesNotMatch(read('src/lib/aiEntitlement.ts'), /preferDeviceVoice|PREFER_DEVICE_VOICE/u);
});

test('the fallback speaks through device TTS, which reaches no network', () => {
  const hook = read('src/hooks/useWordCardVoicePlayback.ts');
  const fallback = /const speakOnDevice = useCallback\(async \(\) => \{[\s\S]*?\}, \[item, setVoiceState\]\);/u
    .exec(hook)?.[0];
  assert.ok(fallback, 'speakOnDevice not found');

  // `false` is the canUseAIVoice argument: device TTS, so no entitlement and no
  // consent are involved, exactly as on Free.
  assert.match(fallback, /speakWordCard\(item, false, playbackOptions\)/u);
  assert.match(fallback, /speak\(item\.meaning, false, item\.meaningLang, playbackOptions\)/u);
  assert.doesNotMatch(fallback, /ensureAIConsentForUserAction|requireAIEntitlement/u);
});

test('Basic is eligible to ask, and the plan tables say why', () => {
  const entitlement = read('src/lib/aiEntitlement.ts');
  const limits = read('src/lib/planLimits.ts');

  // Derived from the two configured allowances rather than a tier list.
  assert.match(
    entitlement,
    /VOICE_MONTHLY_LIMITS\[plan\] !== 0 \|\| VOICE_LIFETIME_CREDITS\[plan\] !== 0/u,
  );
  assert.match(limits, /basic: 200,/u);
  // The comparison table must not call a one-time grant a monthly one.
  assert.match(limits, /one-time/u);
});
