const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

/** Custom Voice is local and free; only High-Quality AI Voice is gated. */

// ── The entitlement checks ───────────────────────────────────────────────────

test('the Worker sells Basic the metered voice routes and nothing more', () => {
  const config = read('cloudflare/wordping-api/src/config.ts');
  // Standalone Text-to-Speech takes arbitrary user text and is not credit
  // metered, so it does not follow AI Voice down to Basic.
  assert.match(config, /voice_custom: 'premium',/u);
  // The two voice routes Basic can reach say so, and Free still cannot.
  assert.match(config, /voice_card: 'basic',/u);
  assert.match(config, /voice_sample: 'basic',/u);
  const limits = config.slice(config.indexOf('export const DEFAULT_LIMITS'), config.indexOf('MAX_REQUEST_BODY_BYTES'));
  assert.match(limits, /voice_card: \{\s*free: NO_ACCESS,/u);

  // Basic's access is the one-time grant, not a monthly allowance, and both
  // copies of both tables have to agree or the app promises what the server
  // will not honour.
  for (const path of ['src/lib/planLimits.ts', 'cloudflare/wordping-api/src/planLimits.ts']) {
    const source = read(path);
    assert.match(
      source,
      /VOICE_MONTHLY_LIMITS[\s\S]{0,400}free: 0,\s*basic: 0,\s*premium: null,/u,
      `${path} must give Basic no *monthly* allowance`,
    );
    assert.match(
      source,
      /VOICE_LIFETIME_CREDITS[\s\S]{0,400}free: 0,\s*basic: 200,\s*premium: null,/u,
      `${path} must give Basic the one-time grant`,
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

  // The only voice capability comes from the AI entitlement rule, and the
  // user's own fallback. No plan name and no second rule appears here.
  const app = read('App.tsx');
  assert.match(app, /const canUseAIVoice = canUseAI && !preferDeviceVoice;/u);
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

test('Custom Voice has no locked-plan copy, and AI Voice names both paid plans', () => {
  const i18n = read('src/i18n.ts');
  assert.doesNotMatch(i18n, /custom_voice_locked_msg|basic_voice_limit|cmp_custom_voice|feat_custom_voice/u);
  // Basic includes AI Voice through its one-time credits, so naming Premium
  // alone told a Free user to buy the more expensive of the two plans that have
  // it — and told a Basic subscriber to buy a plan they did not need.
  assert.match(
    i18n,
    /err_plan_required_speech: 'High-Quality AI Voice requires a Basic or Premium plan\./u,
  );
});

test('a server refusal is never sold as an upgrade to an entitled plan', () => {
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');
  const branch = /case 'subscription_required':([\s\S]*?)case 'monthly_limit_reached':/u.exec(playback)?.[1];
  assert.ok(branch, 'subscription_required presentation branch not found');

  // The app's own rule decides which of the two this is. `canUseAIVoice` is what
  // let the request leave the device, so a refusal on top of it is the server
  // disagreeing — Restore and Retry — not a plan boundary to sell past.
  assert.match(branch, /if \(canUseAIVoice\) \{\s*showEntitlementUnverified\(\);\s*return;\s*\}/u);
  assert.match(branch, /Alert\.alert\(title, t\('err_plan_required_speech'\), upgradeAction\);/u);

  // One alert, shared with the entitlement_unverified branch, so the two cannot
  // drift apart.
  assert.match(playback, /const showEntitlementUnverified = \(\) => \{[\s\S]*?t\('err_entitlement_unverified'\)/u);
  assert.match(playback, /case 'entitlement_unverified':\s*showEntitlementUnverified\(\);/u);
  assert.match(playback, /\}, \[canUseAIVoice, language, onRestorePurchases/u);
});

test('a paid purchase raises the AI consent dialog from the AI rule alone', () => {
  const onboarding = read('src/features/onboarding/subscriptionOnboarding.ts');
  // Gated on the AI rule, not on `plan !== 'free'`. Basic now unlocks AI Voice
  // through its one-time grant, so it does have something to permit — and the
  // gate followed it there without being restated.
  assert.match(onboarding, /if \(!planCanUseAI\(input\.plan\)\) return false;/u);
  assert.doesNotMatch(onboarding, /input\.plan === 'free'/u);
  assert.match(onboarding, /import \{ planCanUseAI \} from '\.\.\/\.\.\/lib\/aiEntitlement';/u);

  // It is the only place that can raise the dialog outside a point of use. The
  // point-of-use prompt still guards every AI request, on either paid plan.
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');
  assert.match(playback, /if \(usesAI && !await ensureAIConsentForUserAction\(\)\) return;/u);
  assert.match(
    read('src/lib/aiEntitlement.ts'),
    /export function requireAIEntitlement\(\): void \{\s*if \(isAIEntitlementEligible\(\)\) return;\s*throw new AIRequestError\('subscription_required'/u,
  );
});

test('the discovery markers follow their own features', () => {
  const markers = read('src/features/onboarding/featureDiscovery.ts');
  // The ungated group: everything that works on Free, so no plan check. Upgrade
  // Plan is in it deliberately — gating that one would hide it from Free.
  assert.match(
    markers,
    /case FEATURE_MARKERS\.hideWord:\s*case FEATURE_MARKERS\.notifyWord:\s*case FEATURE_MARKERS\.bulkImport:\s*case FEATURE_MARKERS\.upgradePlan:\s*case FEATURE_MARKERS\.testIcon:\s*case FEATURE_MARKERS\.notificationIcon:\s*case FEATURE_MARKERS\.sendTest:\s*case FEATURE_MARKERS\.firstTestExited:\s*case FEATURE_MARKERS\.customAudio:\s*return true;/u,
  );
  assert.match(markers, /case FEATURE_MARKERS\.themeShop:\s*return planIsSubscribed\(plan\);/u);
  assert.match(markers, /default:\s*return planCanUseAI\(plan\);/u);
});
