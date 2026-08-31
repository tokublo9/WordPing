const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

/**
 * Structural checks for the seven improvements.
 *
 * The logic behind each lives in a pure module with its own unit tests. What is
 * pinned here is the wiring those modules depend on: that the guard is actually
 * called, that a hidden row takes its divider with it, and that the copy the
 * user reads matches the behaviour the code implements.
 */

// ── 1. Copying text in Test Mode ──────────────────────────────────────────────

test('both faces of a Test Mode card allow native text selection', () => {
  const screen = read('src/components/TestModeScreen.tsx');

  // Front: the word. Back: the meaning and the note, which is where an example
  // sentence usually lives — every user-authored field, not just the headline.
  assert.match(screen, /<Text selectable style=\{\[s\.wordText/u);
  assert.match(screen, /<Text selectable style=\{\[s\.meaningText/u);
  assert.match(screen, /<Text selectable style=\{\[s\.noteText/u);

  // Both faces declare their text selectable, which is also what tells the face
  // a long press is a selection rather than a flip.
  // The bare JSX prop on each face, not the prose that mentions it.
  assert.equal((screen.match(/^\s+selectableText$/gmu) ?? []).length, 2);

  // Tap-to-flip is untouched: the Pressable that owns it still wraps the text.
  const face = read('src/components/CardScrollFace.tsx');
  assert.match(face, /<Pressable\s+style=\{s\.pressable\}\s+onPress=\{handlePress\}/u);
});

test('a long press on selectable text copies without flipping the card', () => {
  const face = read('src/components/CardScrollFace.tsx');

  // The decision lives in the pure reducer, which is what the unit tests drive.
  assert.match(face, /import \{\s*IDLE_FLIP_GESTURE,\s*reduceFlipGesture,\s*shouldFlipOnPress,/u);
  assert.match(face, /if \(shouldFlipOnPress\(gesture\.current\)\) onFlip\(\);/u);

  // Every new touch resets the gesture, so tap-to-flip is never left disabled.
  assert.match(face, /reduceFlipGesture\(gesture\.current, 'press-in'\)/u);
  assert.match(face, /reduceFlipGesture\(gesture\.current, 'long-press'\)/u);

  // Declaring onLongPress is also what makes Pressability itself withhold the
  // press for that gesture; the ref covers the platforms where one still lands.
  assert.match(
    face,
    /\{\.\.\.\(selectableText\s*\? \{ onPressIn: handlePressIn, onLongPress: handleLongPress \}\s*: null\)\}/u,
  );

  // No timing workaround: the platform's own long-press threshold is used, so an
  // ordinary tap can never be reclassified as a hold.
  assert.doesNotMatch(face, /delayLongPress|setTimeout|Date\.now\(\)/u);
  assert.doesNotMatch(read('src/features/cards/flipGesture.ts'), /setTimeout|Date\.now\(\)|ms\b/u);
});

test('Flip Mode keeps its original tap behaviour', () => {
  const browser = read('src/components/FlipCardBrowser.tsx');
  // Its faces are not selectable, so they do not opt in and their Pressable is
  // wired exactly as before — a long hold there still flips on release.
  assert.doesNotMatch(browser, /selectableText|selectable/u);
  const face = read('src/components/CardScrollFace.tsx');
  assert.match(face, /selectableText = false,/u);
});

test('a long press cannot reach a Test Mode answer button', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  // The answer row is a sibling of the card area, not a descendant of the
  // selectable face, so no gesture on the text can reach an answer.
  const answerRowAt = screen.indexOf('{/* Answer buttons');
  const cardAreaEnd = screen.indexOf('{/* Answer buttons');
  assert.ok(answerRowAt > -1 && cardAreaEnd > screen.indexOf('<CardScrollFace'));
  assert.match(screen, /onPress=\{\(\) => advance\(kind\)\}/u);
  // Answers stay inert until the card has been flipped at least once, which a
  // long press never does.
  assert.match(screen, /pointerEvents=\{backPlayed \? 'auto' : 'none'\}/u);
});

// ── 2. CSV / JSON import ──────────────────────────────────────────────────────

test('the import entry point is on the existing bulk-import screen', () => {
  const modal = read('src/components/BulkImportModal.tsx');
  assert.match(modal, /import \{ pickWordImportFile \} from '\.\.\/features\/cards\/importFile';/u);
  assert.match(modal, /accessibilityLabel=\{t\('import_from_file'\)\}/u);
  // Picking, parsing and planning happen before anything is written.
  assert.match(modal, /const picked = await pickWordImportFile\(\);/u);
  assert.match(modal, /setFilePlan\(planFileImport\(\{/u);
  assert.match(modal, /setStep\('file-preview'\)/u);
});

test('the preview reports valid, duplicate and invalid counts before saving', () => {
  const modal = read('src/components/BulkImportModal.tsx');
  assert.match(modal, /formatCount\(t\('import_file_valid'\), filePlan\.validCount\)/u);
  assert.match(modal, /formatCount\(t\('import_file_duplicates'\), filePlan\.duplicateCount\)/u);
  assert.match(modal, /formatCount\(t\('import_file_invalid'\), filePlan\.invalidCount\)/u);
  // Cancel and confirm are both offered, and confirm is dead while nothing is valid.
  assert.match(modal, /onPress=\{\(\) => \{ setStep\('input'\); setFilePlan\(null\); \}\}/u);
  assert.match(modal, /disabled=\{importing \|\| filePlan\.validCount === 0\}/u);
  // Unreadable rows are named by their number rather than silently dropped.
  assert.match(modal, /filePlan\.errors\.map\(error =>/u);
  assert.match(modal, /formatCount\(t\('import_file_row'\), error\.rowNumber\)/u);
});

test('an imported file is read locally and never leaves the device', () => {
  const picker = read('src/features/cards/importFile.ts');
  assert.match(picker, /DocumentPicker\.getDocumentAsync/u);
  assert.match(picker, /new File\(asset\.uri\)\.text\(\)/u);
  // No transport of any kind in the import path.
  for (const path of [
    'src/features/cards/importFile.ts',
    'src/features/cards/fileImport.ts',
    'src/features/cards/bulkImport.ts',
  ]) {
    assert.doesNotMatch(read(path), /\bfetch\(|XMLHttpRequest|WebSocket/u, `${path} must not transmit`);
  }
});

test('the parser stays free of react-native so both formats are testable', () => {
  const parser = read('src/features/cards/fileImport.ts');
  assert.doesNotMatch(parser, /from 'react-native'|from 'expo-/u);
});

// ── 3. About AI Voice on Free ────────────────────────────────────────────────

test('1-3, 5. About AI Voice sits second in Help, only for an eligible plan', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const help = settings.slice(
    settings.indexOf("t('help_section')"),
    settings.indexOf('{/* ── Privacy'),
  );

  // The section's rows, in the order they render: the result filters first,
  // About AI Voice immediately below, and nothing else in between.
  const rowLabels = [...help.matchAll(/<SettingRow[\s\S]*?label=\{t\('(\w+)'\)\}/gu)]
    .map(match => match[1]);
  assert.deepEqual(rowLabels, ['help_result_filters', 'ai_voice_info_menu']);

  // Basic and Premium see it; Free does not, and neither does anyone while the
  // subscription is still loading — `canUseAI` is false until RevenueCat answers.
  // Row and description are one conditional block, so nothing empty is left.
  assert.match(
    help,
    /\{canUseAI && \(\s*<>\s*<SettingRow icon="mic-outline" label=\{t\('ai_voice_info_menu'\)\}[\s\S]*?ai_voice_info_desc[\s\S]*?<\/>\s*\)\}/u,
  );
  // The rule is not restated here.
  assert.doesNotMatch(settings, /planCanUseAI|VOICE_MONTHLY_LIMITS/u);
});

test('6-8. the old location is gone and there is exactly one entry point', () => {
  // Removed from the three-dots menu, along with the props that fed it.
  const menu = read('src/app/AppContextMenu.tsx');
  assert.doesNotMatch(menu, /ai_voice_info|onOpenAiVoiceInfo|showAiVoiceInfo/u);

  // And from App, which no longer owns the popup or a route into it — so a Free
  // user has no other in-app path to open it.
  const app = read('App.tsx');
  assert.doesNotMatch(app, /aiVoiceInfo|openAiVoiceInfo|showAiVoiceInfo|SettingsInfoPopup/u);

  // Exactly one place renders the row.
  const settings = read('src/components/SettingsModal.tsx');
  assert.equal((settings.match(/t\('ai_voice_info_menu'\)/gu) ?? []).length, 1);
});

test('9. opening About AI Voice makes no request and asks no permission', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const row = settings.slice(
    settings.indexOf("label={t('ai_voice_info_menu')}"),
    settings.indexOf("{t('ai_voice_info_desc')}"),
  );
  // It shows the shared text popup and does nothing else.
  assert.match(row, /onPress=\{\(\) => showInfoPopup\(\{\s*title: t\('ai_voice_info_title'\),\s*body: t\('ai_voice_info_body'\),\s*\}\)\}/u);
  assert.doesNotMatch(row, /speak|preview|ensureAIConsent|requestAI|setAIConsent/u);
});

test('10-11. the copy avoids "API" without touching internal identifiers', () => {
  const i18n = read('src/i18n.ts');

  // Every user-facing string in this group, English and Japanese.
  const values = [...i18n.matchAll(/^\s+(ai_voice_info_\w+):([\s\S]*?)(?=\n\s+[a-z_]+:)/gmu)];
  assert.ok(values.length >= 8, 'both locales, four keys each');
  for (const [, key, body] of values) {
    assert.doesNotMatch(body, /\bAPI\b/u, `${key} must not say API`);
  }

  // The replacement wording is the one the implementation actually matches:
  // requests go to an online service, and replays come from the device.
  assert.match(i18n, /ai_voice_info_desc:[\s\S]{0,200}online AI voice service/u);
  assert.match(i18n, /ai_voice_info_desc:[\s\S]{0,200}オンラインのAI音声サービス/u);
  assert.match(i18n, /ai_voice_info_body:[\s\S]{0,400}monthly AI voice limit/u);

  // Internal names, comments and network code are untouched: the term is only
  // wrong in front of a user.
  assert.match(read('src/lib/api/client.ts'), /isApiConfigured|EXPO_PUBLIC_WORDPING_API_BASE_URL/u);
  assert.match(read('src/lib/api/errors.ts'), /AIRequestError/u);
  assert.match(read('src/lib/aiEntitlement.ts'), /VOICE_MONTHLY_LIMITS/u);
});

test('hiding the explanation does not hide upgrade messaging', () => {
  const app = read('App.tsx');
  // The Upgrade Plan sheet and the paywall are still reachable on every plan.
  assert.match(app, /setProSheetVisible\(true\)/u);
  assert.match(app, /const openVoicePaywall = \(\) => setPaywallVisible\(true\);/u);
});

// ── AI entitlement and consent lifecycle ─────────────────────────────────────

test('the network boundary requires both entitlement and consent', () => {
  const client = read('src/lib/api/client.ts');
  const post = client.slice(client.indexOf('async function post('));

  // Entitlement first, then consent, then anything else. Ordering matters: an
  // ineligible plan is never asked for a permission it could not use.
  const entitlementAt = post.indexOf('requireAIEntitlement()');
  const consentAt = post.indexOf('await requireAIConsent()');
  const identityAt = post.indexOf('await getIdentity()');
  const fetchAt = post.indexOf('await fetch(');
  assert.ok(entitlementAt > -1 && consentAt > entitlementAt);
  assert.ok(consentAt < identityAt, 'both gates precede identity resolution');
  assert.ok(consentAt < fetchAt, 'both gates precede the request');
});

test('eligibility is read from the existing plan configuration', () => {
  const rule = read('src/lib/aiEntitlement.ts');
  assert.match(rule, /import \{ VOICE_MONTHLY_LIMITS, type PlanTier \} from '\.\/planLimits';/u);
  assert.match(rule, /return VOICE_MONTHLY_LIMITS\[plan\] !== 0;/u);
  // No second list of tier names anywhere in the rule.
  assert.doesNotMatch(rule, /'basic' \|\| |=== 'premium'|isSubscribed/u);
});

test('an unknown RevenueCat state is never treated as a cancellation', () => {
  const rule = read('src/lib/aiEntitlement.ts');
  // A verified downgrade needs a real snapshot behind it, not just plan === free.
  assert.match(
    rule,
    /export function isVerifiedFreePlan[\s\S]*?state\.isSubscriptionLoaded\s*&& state\.entitlementSource !== null\s*&& !planCanUseAI\(state\.plan\)/u,
  );

  const app = read('App.tsx');
  assert.match(app, /if \(!isVerifiedFreePlan\(aiEntitlement\)\) return;\s*void invalidateAIConsent\(\);/u);
  // Never gated on the plan alone.
  assert.doesNotMatch(app, /plan === 'free'[\s\S]{0,120}invalidateAIConsent/u);
});

test('consent is published and invalidated from one place', () => {
  const app = read('App.tsx');
  assert.match(app, /setAIEntitlementSnapshot\(aiEntitlement\)/u);
  assert.match(app, /const canUseAI = hasEligibleAIEntitlement\(aiEntitlement\)/u);
  // The snapshot carries the verified source, not just the plan.
  assert.match(app, /\(\) => \(\{ plan, isSubscriptionLoaded, entitlementSource \}\)/u);

  // Clearing is a no-op once there is nothing stored, so startup does not churn.
  const consent = read('src/lib/aiConsent.ts');
  assert.match(consent, /if \(cached === 'unknown'\) return;\s*await setAIConsent\('unknown'\);/u);
});

test('1–3. AI Data Sharing is shown only to a plan that can use AI', () => {
  const settings = read('src/components/SettingsModal.tsx');

  // The heading, divider and row are one conditional block, so an ineligible
  // plan leaves no empty section behind.
  assert.match(
    settings,
    /\{canUseAI && \(\s*<>\s*<View style=\{\[styles\.divider[\s\S]*?privacy_section[\s\S]*?ai_consent_setting[\s\S]*?<\/>\s*\)\}/u,
  );
  // Decided by App from the one rule, not re-derived here.
  assert.doesNotMatch(settings, /planCanUseAI|VOICE_MONTHLY_LIMITS/u);
  assert.match(read('App.tsx'), /canUseAI,\s*onDataReplaced: reloadAfterImport,/u);
});

test('18. free on-device speech needs no entitlement and no consent', () => {
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');
  // Only the subscriber path asks; device speech and attached audio do not.
  assert.match(
    playback,
    /const usesAI = isSubscribed && !\(target === 'word' && Boolean\(item\.audioUri\)\);/u,
  );
  assert.match(playback, /if \(usesAI && !await ensureAIConsentForUserAction\(\)\) return;/u);

  // The device engine is reached without touching the network layer at all.
  const tts = read('src/lib/tts.ts');
  assert.match(tts, /if \(isPro\) return speakWithAI\(text, activeAIVoice, options\);\s*return speakFree\(/u);
  // speakFree drives expo-speech directly — no client, no gateway, no guard.
  const speakFree = tts.slice(tts.indexOf('function speakFree('), tts.indexOf('// ── OpenAI TTS'));
  assert.match(speakFree, /speechLib\(\)\.speak\(/u);
  assert.doesNotMatch(speakFree, /requireAI|ensureAIConsent|requestAISpeech|fetchAndCacheAudio/u);
});

test('1 & 14. the fixed promo preview is available on every plan', () => {
  const sheet = read('src/components/ProSheet.tsx');
  // Both controls render unconditionally: the comparison is what the sheet
  // sells, and its audience is precisely the users who cannot subscribe yet.
  assert.match(sheet, /onPress=\{\(\) => onPlay\(demoKeyDefault\)\}/u);
  assert.match(sheet, /onPress=\{\(\) => onPlay\(demoKeyAi\)\}/u);
  assert.doesNotMatch(sheet, /canUseAI|planCanUseAI/u, 'no entitlement gate on the preview');
});

test('3 & 4. playing the promo neither prompts for nor changes consent', () => {
  const sheet = read('src/components/ProSheet.tsx');
  // The sheet cannot raise the dialog or write consent at all — it imports
  // neither the prompt nor the store.
  assert.doesNotMatch(sheet, /ensureAIConsentForUserAction|setAIConsent|aiConsentPrompt|lib\/aiConsent/u);
  assert.match(sheet, /await speakPromoSample\(sample, resolvedSampleLang/u);
});

test('9. only the dedicated promo function can use the exempt classification', () => {
  const client = read('src/lib/api/client.ts');

  // The classification is internal — not exported, so no caller can name it.
  assert.match(client, /^type AIRequestKind = 'user-content' \| 'fixed-promo';$/mu);
  assert.doesNotMatch(client, /export type AIRequestKind|export const .*fixed-promo/u);

  // `post` defaults to user-content, and exactly one call site passes the
  // exempt classification as an argument.
  assert.match(client, /kind: AIRequestKind = 'user-content',/u);
  assert.equal(
    (client.match(/^\s+'fixed-promo',$/gmu) ?? []).length,
    1,
    'exactly one caller may opt out',
  );
  // ...and it is inside postPromoSpeech, not anywhere else.
  const promoFn = client.slice(client.indexOf('export async function postPromoSpeech'));
  assert.match(promoFn, /^\s+'fixed-promo',$/mu);

  // The generic voice helper cannot reach the promo route: it is not in the map.
  assert.match(client, /export type VoiceEndpoint = 'card' \| 'sample' \| 'custom';/u);
  const voicePaths = client.slice(client.indexOf('const VOICE_PATHS'), client.indexOf('const PROMO_PATH'));
  assert.doesNotMatch(voicePaths, /promo/u);

  // The gateway routes the promo action away from postSpeech entirely.
  const gateway = read('src/lib/openaiGateway.ts');
  assert.match(gateway, /if \(action === 'speech_promo'\) \{\s*result = await postPromoSpeech\(/u);
  assert.match(gateway, /Exclude<AISpeechAction, 'speech_promo'>/u);
});

test('5 & 6. the promo request creates and sends no identifier', () => {
  const client = read('src/lib/api/client.ts');

  // Identity is resolved only for a user-content request. `getInstallId` mints
  // an id when none exists, so calling it here would create one to play a
  // public sample.
  assert.match(client, /const identity = kind === 'user-content' \? await getIdentity\(\) : null;/u);
  // ...and the two headers are attached only when there is an identity.
  assert.match(
    client,
    /\.\.\.\(identity === null \? null : \{\s*\[INSTALL_ID_HEADER\]: identity\.installId,\s*\[APP_USER_ID_HEADER\]: identity\.appUserId,\s*\}\)/u,
  );

  // The Worker accepts the route without identity rather than demanding one.
  const pipeline = read('cloudflare/wordping-api/src/pipeline.ts');
  assert.match(pipeline, /const anonymous = ANONYMOUS_FEATURES\.has\(spec\.feature\);/u);
  assert.match(pipeline, /const identity = anonymous \? null : readIdentity\(request\);/u);
  assert.match(pipeline, /if \(!anonymous && !identity\) return reject\('missing_install_id', 400\);/u);
  // Nothing is hashed or metered from an identity that was never received.
  assert.match(pipeline, /identity === null \? Promise\.resolve\(null\) : privacyHash\(env, 'install'/u);
  assert.match(pipeline, /isVoiceQuotaFeature\(spec\.feature\) && identity !== null/u);
});

test('7 & 8. the promo body carries no user content and an allowlisted id', () => {
  const client = read('src/lib/api/client.ts');
  const promo = client.slice(client.indexOf('export async function postPromoSpeech'));

  // Checked on the device against the same two-value list the Worker enforces.
  assert.match(promo, /if \(!isPromoSampleId\(sample\)\) \{/u);
  // The body is built here, from arguments — a caller cannot supply one.
  assert.match(promo, /\{\s*sample,\s*\.\.\.\(langCode !== undefined \? \{ langCode \} : \{\}\),\s*\.\.\.\(sampleVersion !== undefined \? \{ sampleVersion \} : \{\}\),\s*\}/u);
  assert.doesNotMatch(promo, /\btext\b|\bvoice\b|instructions/u, 'no text or voice field exists');

  // Both allowlists agree, and the Worker's schema has no text or voice field.
  const clientList = read('src/lib/promoVoiceSamples.ts');
  const workerList = read('cloudflare/wordping-api/src/config.ts');
  assert.match(clientList, /PROMO_SAMPLE_IDS = \['spontaneous', 'morning_light'\]/u);
  assert.match(workerList, /PROMO_SAMPLE_IDS = \['spontaneous', 'morning_light'\]/u);
  const schema = read('cloudflare/wordping-api/src/schemas.ts');
  const promoSchema = schema.slice(schema.indexOf('export const voicePromoSchema'), schema.indexOf('export type VoicePromoRequest'));
  assert.match(promoSchema, /sample: z\.enum\(PROMO_SAMPLE_IDS\)/u);
  assert.doesNotMatch(promoSchema, /text:|voice:/u);
});

test('the promo clip is served from the shared cache, not regenerated per user', () => {
  const route = read('cloudflare/wordping-api/src/routes/voice.ts');
  const promo = route.slice(route.indexOf('export async function handleVoicePromo'), route.indexOf('export async function handleVoiceCustom'));
  // KV is consulted first and answered without touching OpenAI on a hit.
  assert.match(promo, /const cached = await context\.env\.WORDPING_KV\.get\(cacheKey, 'arrayBuffer'\)/u);
  assert.match(promo, /if \(cached\) \{[\s\S]*?return audioResponse\(/u);
  // The cache key is the sample and language only — nothing per-user.
  assert.match(promo, /const cacheKey = `promo:\$\{PROMO_SAMPLE_VERSION\}:\$\{sample\}:\$\{lang\}\.wav`/u);
  assert.match(promo, /expirationTtl: PROMO_SAMPLE_CACHE_TTL_SECONDS/u);
  // The spoken text comes from the server's own table, never from the request.
  assert.match(promo, /const text = promoSampleText\(sample, lang\);/u);
});

test('2 & 10. user-content requests are unchanged and still doubly gated', () => {
  const client = read('src/lib/api/client.ts');
  const post = client.slice(client.indexOf('async function post('));
  // Both guards still run, and only for user-content.
  assert.match(
    post,
    /if \(kind === 'user-content'\) \{\s*requireAIEntitlement\(\);\s*await requireAIConsent\(\);\s*\}/u,
  );
  // Every user-content helper goes through the default classification.
  assert.match(client, /export async function postText\([\s\S]*?await post\(\s*TEXT_PATHS\[endpoint\]/u);
  assert.match(client, /export async function postSpeech\([\s\S]*?await post\(VOICE_PATHS\[endpoint\], body, options, DEFAULT_SPEECH_TIMEOUT_MS\)/u);
});

test('15. a failed promo never falls back to a user-content route', () => {
  const sheet = read('src/components/ProSheet.tsx');
  const handler = sheet.slice(sheet.indexOf('const handlePlayDemo'), sheet.indexOf('const handleSubscribeBasic'));
  // One request, one catch, a message — no retry against another endpoint.
  assert.match(handler, /promo_preview_unavailable/u);
  assert.doesNotMatch(handler, /speakWordCard|previewAIVoice|requestAIText|generateMeaning/u);
  assert.equal((handler.match(/speakPromoSample/gu) ?? []).length, 1);
});

// ── 15–17. Privacy Policy lives in exactly one place ─────────────────────────

test('15 & 17. the duplicate Privacy Policy row is gone from Settings', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const mainScreen = settings.slice(0, settings.indexOf('// ── App Info sheet'));

  // The main Settings screen no longer links the policy, and the handler that
  // opened it from there is gone with it — no dead code left behind.
  assert.doesNotMatch(mainScreen, /privacy_policy/u);
  assert.doesNotMatch(settings, /openPrivacyPolicy/u);

  // The Privacy section that held it contains only the AI setting now, and the
  // whole block is conditional, so nothing empty can remain.
  const privacySection = settings.slice(
    settings.indexOf("{canUseAI && ("),
    settings.indexOf('{/* ── App Info'),
  );
  assert.match(privacySection, /ai_consent_setting/u);
  assert.doesNotMatch(privacySection, /privacy_policy|LEGAL_URLS/u);
});

test('16. the Privacy Policy is still reachable from App Info', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const appInfo = settings.slice(settings.indexOf('// ── App Info sheet'));

  // One row, always rendered — not inside any plan or entitlement condition.
  assert.match(
    appInfo,
    /<SettingRow icon="document-text-outline" label=\{t\('privacy_policy'\)\} pal=\{pal\}\s*onPress=\{\(\) => void openExternal\(LEGAL_URLS\.privacy\)\} \/>/u,
  );
  assert.doesNotMatch(appInfo, /canUseAI|isSubscribed && [\s\S]{0,80}privacy_policy/u);

  // App Info itself is reachable from Settings on every plan.
  assert.match(settings, /<SettingRow icon="information-circle-outline" label=\{t\('app_info'\)\} pal=\{pal\}\s*onPress=\{\(\) => setAppInfoVisible\(true\)\} \/>/u);

  // The canonical URL is unchanged, and both locales resolve through it.
  assert.match(read('src/config/legalUrls.ts'), /privacy: 'https:\/\/word-ping-chi\.vercel\.app\/privacy'/u);
  assert.equal((settings.match(/LEGAL_URLS\.privacy/gu) ?? []).length, 1, 'exactly one link');
});

// ── 4 & 7. Tutorials ─────────────────────────────────────────────────────────

test('the result-filter tutorial persists its seen flag and is shown from App', () => {
  const app = read('App.tsx');
  assert.match(app, /visible=\{showResultFilterTutorial\}/u);
  assert.match(app, /onDismiss=\{dismissResultFilterTutorial\}/u);

  const persistence = read('src/app/useAppPersistence.ts');
  for (const key of ['RESULT_FILTER_TUTORIAL_KEY', 'FIRST_TEST_ANSWER_KEY']) {
    assert.match(persistence, new RegExp(`AsyncStorage\\.setItem\\(${key}`, 'u'));
  }
  // Read back on the next launch, so the tutorial does not repeat.
  const bootstrap = read('src/app/useAppBootstrap.ts');
  assert.match(bootstrap, /setFirstTestAnswerRecorded\(parseTutorialFlag\(rawFirstTestAnswer\)\)/u);
  // The stored dismissal wins; the migration can only ever add one.
  assert.match(
    bootstrap,
    /setResultFilterTutorialSeen\(storedTutorialSeen \|\| migration\.shouldMarkTutorialSeen\)/u,
  );
});

test('no gesture tutorial popup, state or Settings item exists', () => {
  const sources = [
    'App.tsx',
    'src/app/useAppSettings.ts',
    'src/app/useAppBootstrap.ts',
    'src/app/useAppPersistence.ts',
    'src/components/SettingsModal.tsx',
    'src/features/onboarding/tutorialState.ts',
    'src/i18n.ts',
  ];
  for (const path of sources) {
    assert.doesNotMatch(
      read(path),
      /QuickActions|quick_actions|quickActions/u,
      `${path} must carry no gesture-tutorial code`,
    );
  }
  // Swipe and long-press are taught by a seeded card instead.
  assert.match(read('src/lib/db.ts'), /GESTURES_CARD_ID/u);
});

test('the fifth default card teaches the gestures, and only for new users', () => {
  const db = read('src/lib/db.ts');
  const cards = db.slice(db.indexOf('const DEFAULT_CARDS'), db.indexOf('export interface Settings'));

  // Five cards, with the instruction last and the first four untouched.
  const ids = [...cards.matchAll(/id: (?:'(wp-w\d)'|(GESTURES_CARD_ID))/gu)]
    .map(match => match[1] ?? match[2]);
  assert.deepEqual(ids, ['wp-w1', 'wp-w2', 'wp-w3', 'wp-w4', 'GESTURES_CARD_ID']);
  assert.match(db, /export const GESTURES_CARD_ID = 'wp-w5';/u);

  // The exact copy, bilingual by design.
  assert.match(cards, /word: 'You can swipe or long-press words and folders\.'/u);
  assert.match(cards, /meaning: '単語やフォルダは、スワイプまたは長押しで操作できます。'/u);
  assert.match(cards, /wordLang: 'en-US', meaningLang: 'ja-JP'/u);

  // Seeded once, with the other four, only on a genuine first launch.
  assert.match(db, /if \(isFirstLaunch && cards\.length === 0\)/u);
  assert.match(db, /settings\.set\(SEEDED_KEY, String\(Date\.now\(\)\)\);/u);

  // Outside WELCOME_CARD_IDS, which is the list onboarding rebuilds — so
  // completing onboarding cannot duplicate it and deleting it is permanent.
  const welcome = read('src/features/onboarding/welcomeContent.ts');
  assert.match(welcome, /export const WELCOME_CARD_IDS: string\[\] = \['wp-w1', 'wp-w2', 'wp-w3', 'wp-w4'\];/u);
  assert.doesNotMatch(welcome, /wp-w5|GESTURES_CARD_ID/u);
  assert.match(read('App.tsx'), /prev\.filter\(c => !WELCOME_CARD_IDS\.includes\(c\.id\)\)/u);
});

test('the result-filter tutorial is derived from the real chip mapping', () => {
  const levels = read('src/features/cards/levels.ts');
  // The legend is built from LEVEL_FILTER_OPTIONS rather than restated, so the
  // explanation cannot describe a colour the chips no longer use.
  assert.match(levels, /export const RESULT_FILTER_LEGEND: readonly ResultFilterLegendEntry\[\] = LEVEL_FILTER_OPTIONS\.map\(/u);

  const tutorial = read('src/components/ResultFilterTutorial.tsx');
  assert.match(tutorial, /import \{ RESULT_FILTER_LEGEND \} from '\.\.\/features\/cards\/levels';/u);
  assert.doesNotMatch(tutorial, /#6BA4F0|#F2B445|#ED7373|#6B7280/u, 'colours must not be duplicated here');

  // Never colour alone: each row pairs the swatch with the result's own name.
  assert.match(tutorial, /accessibilityLabel=\{t\(labelKey as TranslationKey\)\}/u);
  assert.match(tutorial, /<Text style=\{\[styles\.legendLabel[\s\S]{0,120}\{t\(labelKey as TranslationKey\)\}/u);

  // "Know perfectly" has no chip; the copy says so rather than inventing one.
  // Its exact wording, including the sync-setting caveat, is asserted in
  // "the Perfect note is true whether or not result syncing is on".
  assert.match(tutorial, /result_filter_perfect_note/u);
});

test('the first answer is recorded without interrupting the test', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  // Reported from `advance`, the grading path — not from a popup or a modal.
  assert.match(screen, /if \(gradedIdsRef\.current\.size === 0\) onFirstAnswer\?\.\(\);/u);
  assert.doesNotMatch(screen, /ResultFilterTutorial/u, 'the popup must not open inside the test');

  const app = read('App.tsx');
  assert.match(app, /onFirstAnswer: \(\) => setFirstTestAnswerRecorded\(true\)/u);
  // Written straight away, so a force-close right after the answer keeps the
  // tutorial pending rather than losing it.
  assert.match(
    read('src/app/useAppPersistence.ts'),
    /AsyncStorage\.setItem\(FIRST_TEST_ANSWER_KEY, serializeTutorialFlag\(firstTestAnswerRecorded\)\)/u,
  );
});

test('the popup is driven by live screen state, not by how the test ended', () => {
  const app = read('App.tsx');
  // One condition serves the normal exit and force-close recovery alike, so
  // there is no "was closed" flag a crash could lose.
  assert.match(app, /const showResultFilterTutorial = shouldShowResultFilterTutorial\(\{/u);
  assert.match(app, /isAppReady: settingsLoaded,/u);
  assert.match(app, /isTestModeOpen: testModeVisible,/u);
  assert.match(app, /isScreenBusy: screenBusy,/u);
  assert.doesNotMatch(app, /testModeClosed/u, 'no separate exit flag may survive');
  assert.match(app, /onClose: \(\) => setTestModeVisible\(false\)/u);
});

test('only dismissing the tutorial reveals the filters', () => {
  const state = read('src/features/onboarding/tutorialState.ts');
  // The whole rule: one flag, nothing else.
  assert.match(
    state,
    /export function shouldShowResultFilters\(input: ResultFilterVisibilityInput\): boolean \{\s*return input\.hasSeenResultFilterTutorial;\s*\}/u,
  );
  // An answered card must not be an alternative route to visibility.
  const visibility = state.slice(
    state.indexOf('export function shouldShowResultFilters'),
    state.indexOf('export interface ResultFilterTutorialInput'),
  );
  assert.doesNotMatch(visibility, /hasCompletedFirstTestAnswer|hasHistoricalResults/u);

  const app = read('App.tsx');
  assert.match(
    app,
    /const showResultFilters = shouldShowResultFilters\(\{\s*hasSeenResultFilterTutorial: resultFilterTutorialSeen,\s*\}\);/u,
  );
  assert.match(app, /const dismissResultFilterTutorial = useCallback\(\(\) => \{\s*setResultFilterTutorialSeen\(true\);/u);
});

test('the result-filter tutorial can be reopened from the Help section', () => {
  const settings = read('src/components/SettingsModal.tsx');
  assert.match(settings, /t\('help_section'\)/u);
  assert.match(settings, /label=\{t\('help_result_filters'\)\}/u);
  // The same component as the automatic version, so the wording cannot drift.
  assert.match(settings, /<ResultFilterTutorial/u);
});

// ── 5. Duplicate words ───────────────────────────────────────────────────────

test('every creation path compares through the one duplicate rule', () => {
  // Manual creation and renaming.
  const cards = read('src/features/cards/useCards.ts');
  assert.match(cards, /import \{ findDuplicateCard \} from '\.\/duplicates';/u);
  assert.match(cards, /const duplicate = findDuplicateCard\(cards, word, targetFolderId, editingCard\?\.id\);/u);
  assert.match(cards, /duplicate_word_message/u);
  // Offers the existing word rather than only refusing.
  assert.match(cards, /onPress: \(\) => \{ setWordModalVisible\(false\); openEdit\(duplicate\); \}/u);

  // Typed and file bulk import share one commit path.
  const bulk = read('src/features/cards/bulkImport.ts');
  assert.match(bulk, /import \{ FolderWordIndex, normalizeWordKey \} from '\.\/duplicates';/u);
  assert.match(bulk, /export const bulkDuplicateKey = normalizeWordKey;/u);

  // Moving between folders.
  const folders = read('src/features/folders/useFolders.ts');
  assert.match(folders, /import \{ planFolderMove \} from '\.\.\/cards\/duplicates';/u);
  assert.match(folders, /planFolderMove\(prev, pendingMoveIds, targetFolderId\)/u);
});

test('the commit re-checks duplicates so the preview cannot be raced', () => {
  const bulk = read('src/features/cards/bulkImport.ts');
  const commit = bulk.slice(bulk.indexOf('export function createBulkImportBatch'));
  // The index is built from the cards as they are at commit time.
  assert.match(commit, /const index = new FolderWordIndex\(options\.existingCards\);/u);
  assert.match(commit, /if \(!index\.add\(word, folderId\)\) \{ duplicatesSkipped \+= 1; continue; \}/u);
});

test('nothing is overwritten, merged or deleted to resolve a duplicate', () => {
  const duplicates = read('src/features/cards/duplicates.ts');
  // The audit helper only reads.
  assert.doesNotMatch(duplicates, /delete |splice\(|\.filter\(card => card\.id !==/u);
  const bulk = read('src/features/cards/bulkImport.ts');
  assert.doesNotMatch(bulk, /overwrite|replaceExisting/u);
  // A blocked move leaves the word where it is rather than dropping it.
  const folders = read('src/features/folders/useFolders.ts');
  assert.match(folders, /if \(movableIds\.length === 0\) return prev;/u);
});

// ── 6. The position counter ──────────────────────────────────────────────────

test('the counter is hidden when everything fits on one page', () => {
  const label = read('src/components/WordListPositionLabel.tsx');
  assert.match(label, /const showPosition = hasMultiplePages && /u);
  // The line itself always renders, so nothing collapses and no gap is left.
  assert.match(label, /\{showPosition \? `\$\{position\} \/ \$\{total\}` : topContent\}/u);

  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  // Measured, not a word-count threshold: the same test the scrollbar uses.
  assert.match(wordList, /getScrollBarMetrics\(listContentH, listViewH\)\.show/u);
  assert.doesNotMatch(wordList, /hasMultiplePages = [\s\S]{0,80}length > \d\d/u);
});

test('the counter keeps its accessibility label while visible', () => {
  // The label is a plain Text whose content is the readout itself, so the
  // accessible name and the visible text can never disagree.
  const label = read('src/components/WordListPositionLabel.tsx');
  assert.match(label, /<Text style=\{style\} numberOfLines=\{1\}>/u);
});

// ── 7. Filter visibility ─────────────────────────────────────────────────────

test('the Test Mode icon holds its position whether or not the chips show', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const bar = wordList.slice(
    wordList.indexOf('const filterBar ='),
    wordList.indexOf('// ── Card list content'),
  );

  // Both branches put a `chipGroup` container in the row's first slot, so the
  // row always has two children and `space-between` keeps the Test button
  // pinned to the same right edge in either state.
  assert.match(bar, /\{showResultFilters \? \(\s*<View style=\{filterStyles\.chipGroup\}>/u);
  assert.match(
    bar,
    /\) : \(\s*<View\s*style=\{filterStyles\.chipGroup\}\s*pointerEvents="none"[\s\S]*?\/>\s*\)\}/u,
  );
  const groups = bar.match(/style=\{filterStyles\.chipGroup\}/gu) ?? [];
  assert.equal(groups.length, 2, 'both states must use the same container style');

  // The button itself is outside the conditional, so neither its style nor its
  // touch target changes between the two states.
  const testButton = bar.slice(bar.indexOf('onPress={actions.onOpenTestMode}'));
  assert.doesNotMatch(testButton, /showResultFilters/u);
  assert.match(bar, /<TouchableOpacity\s*style=\{s\.iconBtn\}\s*hitSlop=\{\{ top: 8, bottom: 8, left: 8, right: 8 \}\}/u);

  // The row's own geometry is fixed and independent of its contents, so the
  // layout is identical on a small iPhone and a large one, in any language.
  assert.match(
    wordList,
    /bar: \{\s*height: 50,[\s\S]*?justifyContent: 'space-between',/u,
  );
});

test('the hidden filter placeholder is inert and invisible to assistive tech', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  // Anchored inside the filter bar: `) : (` appears in other ternaries too.
  const bar = wordList.slice(
    wordList.indexOf('const filterBar ='),
    wordList.indexOf('// ── Card list content'),
  );
  const placeholderStart = bar.lastIndexOf(') : (');
  // Ends at its own self-closing tag, so the Test button below is not included.
  const placeholder = bar.slice(
    placeholderStart,
    bar.indexOf('/>', placeholderStart) + 2,
  );

  // It renders no children at all — there is no disabled chip to see or focus.
  assert.match(placeholder, /<View\s*style=\{filterStyles\.chipGroup\}[\s\S]*?\/>/u);
  assert.doesNotMatch(placeholder, /TouchableOpacity|Ionicons|<Text/u);

  // Belt and braces on both platforms, so nothing can be tapped or announced.
  assert.match(placeholder, /pointerEvents="none"/u);
  assert.match(placeholder, /accessibilityElementsHidden/u);
  assert.match(placeholder, /importantForAccessibility="no-hide-descendants"/u);

  // Never the opacity trick: an invisible control that still takes touches and
  // still reads out to VoiceOver is worse than a visible one.
  assert.doesNotMatch(placeholder, /opacity/u);
});

test('the colour chips are hidden before the first test answer', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  assert.match(wordList, /\{showResultFilters \? \(\s*<View style=\{filterStyles\.chipGroup\}>/u);

  // Test Mode's own button is outside that condition — it is how a new user
  // produces the results these chips will filter by.
  const bar = wordList.slice(wordList.indexOf('const filterBar ='), wordList.indexOf('// ── Card list content'));
  assert.match(bar, /onPress=\{actions\.onOpenTestMode\}/u);
  const testButtonAt = bar.indexOf('actions.onOpenTestMode');
  const chipGuardAt = bar.indexOf('{showResultFilters ? (');
  assert.ok(chipGuardAt > -1 && testButtonAt > chipGuardAt);
  // Exactly one gate on the chips, and none on the button below it.
  assert.equal((bar.match(/showResultFilters/gu) ?? []).length, 1);

  const app = read('App.tsx');
  assert.match(app, /showResultFilters=\{showResultFilters\}/u);
  assert.match(app, /const showResultFilters = shouldShowResultFilters\(\{/u);
});

test('existing users are migrated once, explicitly, at bootstrap', () => {
  const bootstrap = read('src/app/useAppBootstrap.ts');
  // The check reads their stored results and initialises the same flag a
  // dismissal would set, so afterwards there is only one rule in play.
  assert.match(bootstrap, /const migration = resolveResultFilterMigration\(\{/u);
  assert.match(bootstrap, /hasHistoricalResults: hasExistingTestResults\(migratedCards\),/u);
  assert.match(bootstrap, /AsyncStorage\.setItem\(RESULT_FILTER_MIGRATION_KEY, serializeTutorialFlag\(true\)\)/u);
  assert.match(bootstrap, /AsyncStorage\.setItem\(RESULT_FILTER_TUTORIAL_KEY, serializeTutorialFlag\(true\)\)/u);

  // A separate marker, so "migrated" and "dismissed" stay distinguishable and
  // the check cannot re-run once the user has results of their own.
  const state = read('src/features/onboarding/tutorialState.ts');
  assert.match(state, /export const RESULT_FILTER_MIGRATION_KEY = 'wordping_result_filter_migrated';/u);
  assert.match(state, /if \(input\.alreadyMigrated\) \{\s*return \{ shouldMarkMigrated: false, shouldMarkTutorialSeen: false \};/u);

  // Their results are read, never written: the module has no mutation of any
  // kind, only predicates over the cards it is handed.
  assert.match(state, /export function hasExistingTestResults/u);
  // An assignment to a card field, not a comparison against one.
  assert.doesNotMatch(state, /setCards\(|\.splice\(|delete card\.|card\.\w+ =(?!=)/u);
});

test('the Perfect note is true whether or not result syncing is on', () => {
  const i18n = read('src/i18n.ts');
  // Perfect deletes the card only under the sync setting (grading.ts:73), so the
  // copy must attribute the removal to that setting rather than state it flatly.
  assert.match(
    i18n,
    /result_filter_perfect_note:[\s\S]{0,300}stop appearing under these filters\. With “Sync with test results” on, they also leave your word list\./u,
  );
  assert.match(
    i18n,
    /result_filter_perfect_note:[\s\S]{0,300}これらのボタンでは表示されなくなります。「テスト結果と連動」がオンの場合は、単語リストからも外れます。/u,
  );
  // The label quoted in the copy is the real setting's own label.
  assert.match(i18n, /sync_test_results: {10}'Sync with test results',/u);
  assert.match(i18n, /sync_test_results: {10}'テスト結果と連動',/u);

  // The deletion itself remains conditional in the grading rule — the copy was
  // corrected to match the code, not the other way round.
  assert.match(
    read('src/features/cards/grading.ts'),
    /if \(kind === 'perfect'\) \{\s*if \(syncTestResults\) return \{ action: 'delete' \};/u,
  );
});

// ── Localization ─────────────────────────────────────────────────────────────

test('every new string ships in English and Japanese', () => {
  const i18n = read('src/i18n.ts');
  const keys = [
    'help_section', 'help_result_filters',
    'result_filter_title', 'result_filter_intro', 'result_filter_untested',
    'result_filter_perfect_note', 'result_filter_got_it',
    'duplicate_word_title', 'duplicate_word_message', 'duplicate_word_open',
    'duplicate_move_skipped',
    'import_from_file', 'import_file_summary', 'import_file_valid',
    'import_file_duplicates', 'import_file_invalid', 'import_file_routed',
    'import_file_ignored_columns', 'import_file_row',
    'import_file_error_empty', 'import_file_error_invalid_json',
    'import_file_error_shape', 'import_file_error_columns', 'import_file_error_unreadable',
  ];
  for (const key of keys) {
    const occurrences = i18n.match(new RegExp(`^\\s{2}${key}:`, 'gmu')) ?? [];
    assert.equal(occurrences.length, 2, `${key} needs an English and a Japanese entry`);
  }
  // The duplicate message is the exact wording specified for each language.
  assert.match(i18n, /duplicate_word_message: 'This word already exists in this folder\.'/u);
  assert.match(i18n, /duplicate_word_message: 'この単語はすでにこのフォルダに登録されています。'/u);
  assert.match(i18n, /result_filter_got_it:  'Got it'/u);
  assert.match(i18n, /result_filter_got_it:  'わかりました'/u);
});

// ── TEMPORARY: Subscription Diagnostics ──────────────────────────────────────
// Delete this block together with the feature. See SUBSCRIPTION_DIAGNOSTICS_ENABLED.

test('Subscription Diagnostics is read-only and leaks no credential', () => {
  const sheet = read('src/components/SubscriptionDiagnosticsSheet.tsx');

  // It reads two RevenueCat getters and calls nothing that could change a plan.
  assert.match(sheet, /Purchases\.getAppUserID\(\)/u);
  assert.match(sheet, /Purchases\.getCustomerInfo\(\)/u);
  for (const mutator of [
    'purchasePackage', 'purchaseProduct', 'restorePurchases', 'syncPurchases',
    'logIn', 'logOut', 'setAttributes', 'configure',
  ]) {
    assert.doesNotMatch(
      sheet,
      new RegExp(`Purchases\\.${mutator}\\b`, 'u'),
      `diagnostics must not call ${mutator}`,
    );
  }
  // It cannot reach the app's own subscription actions either.
  assert.doesNotMatch(sheet, /useSubscription|subscribePremium|setPlan|unsubscribe/u);

  // Entitlement identifiers only — never the objects that carry receipts.
  assert.match(sheet, /Object\.keys\(info\.entitlements\.active\)/u);
  // Checked against the code alone: the comments deliberately name these terms
  // to say they are excluded, and must not fail the very rule they document.
  const code = sheet
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
  assert.doesNotMatch(
    code,
    /receipt|verification|originalPurchaseDate|productIdentifier|\btoken\b/iu,
    'no receipt or token may be shown',
  );

  // The SDK key is read, but only ever to describe itself. Every value derived
  // from it is a slice or a length — the string itself is never put in state
  // and never rendered, so the panel cannot leak a usable key.
  const describe = code.slice(code.indexOf('function describeKey'), code.indexOf('type State ='));
  assert.match(describe, /apiKey\.slice\(0, 9\)/u);
  assert.match(describe, /apiKey\.slice\(-4\)/u);
  assert.match(describe, /keyLength: apiKey\.length/u);
  // Every value it returns is derived. Strip the three permitted forms — a
  // slice, a length, and the emptiness test — and no mention of the key should
  // remain, so none of them can be the key itself.
  const returned = describe.slice(describe.indexOf('return {'));
  const derivedOnly = returned
    .replace(/apiKey\.slice\([^)]*\)/gu, '')
    .replace(/apiKey\.length/gu, '')
    .replace(/apiKey === ''/gu, '');
  assert.doesNotMatch(derivedOnly, /\bapiKey\b/u, 'the raw key must never be returned');
  // Every mention of the key in the whole file is inside describeKey. The call
  // site passes the env var straight in, so nothing else ever holds it.
  assert.equal(
    (code.match(/\bapiKey\b/gu) ?? []).length,
    (describe.match(/\bapiKey\b/gu) ?? []).length,
    'the key must never be referenced outside describeKey',
  );
  assert.match(code, /\.\.\.describeKey\(process\.env\.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY \?\? ''\)/u);
});

test('Subscription Diagnostics is hidden behind a long press and one flag', () => {
  const settings = read('src/components/SettingsModal.tsx');

  // No visible affordance: the version row is not tappable, only holdable.
  assert.match(
    settings,
    /label=\{t\('app_version'\)\}\s*value=\{APP_VERSION\} pal=\{pal\}\s*\{\.\.\.\(SUBSCRIPTION_DIAGNOSTICS_ENABLED\s*\? \{ onLongPress: \(\) => setDiagnosticsVisible\(true\) \}\s*: null\)\}/u,
  );
  assert.match(settings, /delayLongPress=\{800\}/u);
  assert.match(settings, /\{SUBSCRIPTION_DIAGNOSTICS_ENABLED && \(\s*<SubscriptionDiagnosticsSheet/u);

  // Labelled exactly as required.
  assert.match(read('src/components/SubscriptionDiagnosticsSheet.tsx'), /Subscription Diagnostics/u);
});

test('Subscription Diagnostics can be removed by deleting three things', () => {
  const flags = read('src/features/flags.ts');
  assert.match(flags, /export const SUBSCRIPTION_DIAGNOSTICS_ENABLED = true;/u);
  assert.match(flags, /REMOVE BEFORE THE APP STORE SUBMISSION/u);

  // Referenced only by the flag, its own component, SettingsModal and this test —
  // so a stale reference cannot survive the deletion.
  const referencing = [
    'App.tsx', 'src/app/AppModals.tsx', 'src/hooks/useSubscription.ts',
    'src/lib/purchases.ts', 'src/i18n.ts',
  ];
  for (const path of referencing) {
    assert.doesNotMatch(
      read(path),
      /SUBSCRIPTION_DIAGNOSTICS_ENABLED|SubscriptionDiagnostics/u,
      `${path} must not reference the temporary diagnostics`,
    );
  }
  // It owns no translation keys, so removal leaves no orphans behind.
  assert.doesNotMatch(read('src/i18n.ts'), /diagnostics/iu);
});
