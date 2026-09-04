const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

/** Custom Voice is local and free; only High-Quality AI Voice is gated. */

// ── The entitlement checks ───────────────────────────────────────────────────

test('the Worker sells no voice generation to Basic', () => {
  const config = read('cloudflare/wordping-api/src/config.ts');
  assert.match(config, /voice_card: 'premium',/u);
  assert.match(config, /voice_sample: 'premium',/u);
  assert.match(config, /voice_custom: 'premium',/u);
  // The rate-limit table agrees, so a mis-set tier cannot leak a budget.
  const limits = config.slice(config.indexOf('export const DEFAULT_LIMITS'), config.indexOf('MAX_REQUEST_BODY_BYTES'));
  assert.match(limits, /voice_card: \{\s*free: NO_ACCESS,\s*basic: NO_ACCESS,/u);
  assert.match(limits, /voice_sample: \{\s*free: NO_ACCESS,\s*basic: NO_ACCESS,/u);

  // And the monthly allowance the app mirrors says the same thing.
  for (const path of ['src/lib/planLimits.ts', 'cloudflare/wordping-api/src/planLimits.ts']) {
    assert.match(
      read(path),
      /VOICE_MONTHLY_LIMITS[\s\S]{0,200}free: 0,\s*basic: 0,\s*premium: null,/u,
      `${path} must give Basic no AI voice allowance`,
    );
  }
});

test('Custom Voice has no entitlement module', () => {
  assert.equal(fs.existsSync('src/features/voice/customVoiceAccess.ts'), false);
});

test('the card voice button gates only AI Voice', () => {
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');

  assert.doesNotMatch(playback, /canUseCustomVoice|onCustomVoiceLocked|custom_voice_locked/u);
  // AI Voice still decides the generated-speech engine. Attached audio remains
  // part of speakWordCard and is available without a plan check.
  assert.match(playback, /await speakWordCard\(item, canUseAIVoice, playbackOptions\);/u);
  assert.match(playback, /await speak\(item\.meaning, canUseAIVoice, item\.meaningLang, playbackOptions\);/u);
  // No plan name reaches this hook at all. Checked against the code alone: the
  // comments deliberately name the flags they replaced.
  const code = playback
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
  assert.doesNotMatch(code, /isPremium|isSubscribed/u);
});

test('every voice surface receives only the AI capability', () => {
  for (const path of [
    'src/components/SwipeableCard.tsx',
    'src/components/FlipCardBrowser.tsx',
    'src/components/TestModeScreen.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /canUseAIVoice/u, `${path} must take the AI Voice capability`);
    assert.doesNotMatch(source, /canUseCustomVoice|onCustomVoiceLocked/u);
    // Nothing may pass a plan flag into the playback hook.
    const hookCall = source.slice(source.indexOf('useWordCardVoicePlayback({'));
    assert.doesNotMatch(
      hookCall.slice(0, 260),
      /isPremium|isSubscribed/u,
      `${path} must not gate voice on a plan name`,
    );
  }

  // The only voice capability comes from the AI entitlement rule.
  const app = read('App.tsx');
  assert.match(app, /const canUseAIVoice = canUseAI;/u);
  assert.doesNotMatch(app, /planAllowsCustomVoice|canUseCustomVoice|showVoiceLockBanner/u);
});

test('the word editor always exposes Custom Voice and its playback settings', () => {
  const modal = read('src/components/WordModal.tsx');
  assert.doesNotMatch(modal, /canUseCustomVoice|handleLockedVoicePlay|custom_voice_locked_msg/u);
  assert.match(modal, /<View style=\{\[styles\.audioBtnGroup, styles\.wordHeaderRight\]\}>/u);
  assert.match(modal, /\{audioUri \? \(\s*<View style=\{\[styles\.audioSettings/u);
  // The AI text tools are a separate, Premium feature and keep their own flag.
  assert.match(modal, /const aiTextVisible = AI_TEXT_FEATURES_ENABLED && isPremium && !hideAiTools;/u);
});

test('the AI voice picker follows AI Voice into Premium', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // `canUseAI` is the rule; a plan check here could drift from it.
  assert.match(settings, /\{canUseAI && \(\s*<TouchableOpacity\s*style=\{styles\.cardBehaviorRow\}/u);
  assert.match(settings, /if \(visible && canUseAI\) return;\s*stopPlayback\(\);/u);
});

// ── Plan descriptions ────────────────────────────────────────────────────────

test('Custom Voice has no locked-plan copy while AI Voice still names Premium', () => {
  const i18n = read('src/i18n.ts');
  assert.doesNotMatch(i18n, /custom_voice_locked_msg|basic_voice_limit|cmp_custom_voice|feat_custom_voice/u);
  assert.match(i18n, /err_plan_required_speech: 'High-Quality AI Voice requires a Premium plan\./u);
});

test('a Basic purchase raises no AI consent dialog', () => {
  const onboarding = read('src/features/onboarding/subscriptionOnboarding.ts');
  // The post-purchase offer is gated on the AI rule, not on `plan !== 'free'`.
  // Basic unlocks no server-backed AI feature, so its purchase shares nothing
  // and has nothing to permit.
  assert.match(onboarding, /if \(!planCanUseAI\(input\.plan\)\) return false;/u);
  assert.doesNotMatch(onboarding, /input\.plan === 'free'/u);
  assert.match(onboarding, /import \{ planCanUseAI \} from '\.\.\/\.\.\/lib\/aiEntitlement';/u);

  // It is the only place that can raise the dialog outside a point of use, and
  // the point-of-use prompt is unreachable on Basic anyway: `usesAI` is false,
  // and the network guard refuses an ineligible plan before any request.
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');
  assert.match(playback, /if \(usesAI && !await ensureAIConsentForUserAction\(\)\) return;/u);
  assert.match(
    read('src/lib/aiEntitlement.ts'),
    /export function requireAIEntitlement\(\): void \{\s*if \(isAIEntitlementEligible\(\)\) return;\s*throw new AIRequestError\('subscription_required'/u,
  );
});

test('the discovery markers follow their own features', () => {
  const markers = read('src/features/onboarding/featureDiscovery.ts');
  assert.match(markers, /case FEATURE_MARKERS\.customAudio:\s*return true;/u);
  assert.match(markers, /case FEATURE_MARKERS\.themeShop:\s*return planIsSubscribed\(plan\);/u);
  assert.match(markers, /default:\s*return planCanUseAI\(plan\);/u);
});
