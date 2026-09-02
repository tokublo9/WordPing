const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

/**
 * Basic's voice feature is Custom Voice for Words. AI Voice is Premium.
 *
 * The two used to be the other way round, and both were reached through a plan
 * name — `isSubscribed` for AI Voice, `isPremium` for Custom Voice. What is
 * pinned here is the wiring the pure rules depend on: that every surface asks
 * its feature's own rule, and that no plan name stands in for either.
 */

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

test('Custom Voice has its own rule, and it is not the AI one', () => {
  const access = read('src/features/voice/customVoiceAccess.ts');
  // Any paid plan, expressed through the shared definition of "paid".
  assert.match(access, /export function planUnlocksCustomVoice\(plan: PlanTier\): boolean \{\s*return planIsSubscribed\(plan\);/u);
  assert.match(access, /export const CUSTOM_VOICE_MIN_PLAN: PlanTier = 'basic';/u);
  // It is a local audio file: the module cannot reach the network or the AI rule.
  assert.doesNotMatch(access, /fetch\(|planCanUseAI|requireAI|openaiGateway/u);
});

test('the card voice button asks the two capabilities, never a plan', () => {
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');

  // Custom Voice decides whether a word's attached audio plays or shows the lock.
  assert.match(
    playback,
    /if \(target === 'word' && item\.audioUri && !canUseCustomVoice\) \{\s*onCustomVoiceLocked\?\.\(\);/u,
  );
  // AI Voice decides the engine. Without it the device engine speaks, exactly as
  // it always has for Free — the button is never dead and never raises a paywall.
  assert.match(playback, /await speakWordCard\(item, canUseAIVoice, playbackOptions\);/u);
  assert.match(playback, /await speak\(item\.meaning, canUseAIVoice, item\.meaningLang, playbackOptions\);/u);
  // No plan name reaches this hook at all. Checked against the code alone: the
  // comments deliberately name the flags they replaced.
  const code = playback
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
  assert.doesNotMatch(code, /isPremium|isSubscribed/u);
});

test('every voice surface is handed the capabilities, not the plan', () => {
  for (const path of [
    'src/components/SwipeableCard.tsx',
    'src/components/FlipCardBrowser.tsx',
    'src/components/TestModeScreen.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /canUseAIVoice/u, `${path} must take the AI Voice capability`);
    assert.match(source, /canUseCustomVoice/u, `${path} must take the Custom Voice capability`);
    // Nothing may pass a plan flag into the playback hook.
    const hookCall = source.slice(source.indexOf('useWordCardVoicePlayback({'));
    assert.doesNotMatch(
      hookCall.slice(0, 260),
      /isPremium|isSubscribed/u,
      `${path} must not gate voice on a plan name`,
    );
  }

  // Both come from one place, so no screen can compute its own answer.
  const app = read('App.tsx');
  assert.match(app, /const canUseAIVoice = canUseAI;/u);
  assert.match(app, /const canUseCustomVoice = planAllowsCustomVoice\(\{ isSubscribed, isSubscriptionLoaded \}\);/u);
});

test('the word editor unlocks its attach-audio control for Basic', () => {
  const modal = read('src/components/WordModal.tsx');
  assert.match(modal, /\{canUseCustomVoice \? \(/u);
  assert.match(modal, /\{canUseCustomVoice && audioUri \? \(/u);
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

test('the locked-voice message points at the plan that now unlocks it', () => {
  const i18n = read('src/i18n.ts');
  const lines = i18n.split('\n').filter(line => line.includes('custom_voice_locked_msg:'));
  assert.ok(lines.length >= 20, 'every locale carries the message');
  for (const line of lines) {
    assert.doesNotMatch(line, /Premium/u, `still names Premium: ${line.trim()}`);
    assert.match(line, /Basic/u, `must name Basic: ${line.trim()}`);
  }
  // And the AI Voice refusal names Premium.
  assert.match(i18n, /err_plan_required_speech: 'High-Quality AI Voice requires a Premium plan\./u);
});

test('a Basic purchase raises no AI consent dialog', () => {
  const onboarding = read('src/features/onboarding/subscriptionOnboarding.ts');
  // The post-purchase offer is gated on the AI rule, not on `plan !== 'free'`.
  // Basic pays for a local audio file, so its purchase shares nothing and has
  // nothing to permit — asking would be a dialog for a feature it cannot use.
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
  assert.match(markers, /case FEATURE_MARKERS\.customAudio:\s*return planUnlocksCustomVoice\(plan\);/u);
  assert.match(markers, /case FEATURE_MARKERS\.themeShop:\s*return planIsSubscribed\(plan\);/u);
  assert.match(markers, /default:\s*return planCanUseAI\(plan\);/u);
});
