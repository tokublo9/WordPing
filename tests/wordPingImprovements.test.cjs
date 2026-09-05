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

test('both faces of a Flip Mode card copy exactly what is on screen', () => {
  const browser = read('src/components/FlipCardBrowser.tsx');

  // The same interaction and the same feedback as Test Mode: the platform's own
  // long-press selection and Copy menu, through the same `selectableText` face.
  // Front is the word; back is the meaning and the note, which is where an example
  // sentence usually lives.
  assert.match(browser, /<Text selectable=\{isCurr\} style=\{\[s\.wordText/u);
  assert.match(browser, /<Text selectable style=\{\[s\.meaningText/u);
  assert.match(browser, /<Text selectable style=\{\[s\.noteText/u);

  // Only the centred card is readable, so only it is selectable — an adjacent
  // preview being dragged past must not start a selection.
  assert.match(browser, /selectableText=\{isCurr\}/u);
  assert.match(browser, /^\s+selectableText$/mu);

  // Tap-to-flip is untouched: the Pressable that owns it still wraps the text, and
  // the flip decision is still the pure reducer's.
  const face = read('src/components/CardScrollFace.tsx');
  assert.match(face, /<Pressable\s+style=\{s\.pressable\}\s+onPress=\{handlePress\}/u);
  assert.match(face, /selectableText = false,/u);
});

test('selecting text in Flip Mode cannot swipe the card away from the Copy menu', () => {
  const browser = read('src/components/FlipCardBrowser.tsx');
  const face = read('src/components/CardScrollFace.tsx');

  // The face reports the selection from the same two events the flip decision uses,
  // so the two can never disagree about what the gesture was.
  assert.match(face, /gesture\.current = reduceFlipGesture\(gesture\.current, 'press-in'\);\s*onSelectionGesture\?\.\(false\);/u);
  assert.match(face, /gesture\.current = reduceFlipGesture\(gesture\.current, 'long-press'\);\s*onSelectionGesture\?\.\(true\);/u);

  // Flip Mode withholds only the horizontal navigation gesture, and only while the
  // selection owns the finger. Vertical scrolling and tap-to-flip are untouched.
  assert.match(browser, /onSelectionGesture=\{handleSelectionGesture\}/u);
  assert.match(
    browser,
    /onMoveShouldSetPanResponder:\s*\(_, \{ dx, dy \}\) =>[\s\S]*?!selectingTextRef\.current &&[\s\S]*?Math\.abs\(dx\) > 8/u,
  );
  // `press-in` clears it, so navigation is never left disabled after a copy — and a
  // card change clears it too, because that selection is gone with the card.
  assert.match(browser, /selectingTextRef\.current = false;/u);
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

test('1-3, 5. About AI Voice is the Help section, only for an eligible plan', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const help = settings.slice(
    settings.indexOf("t('help_section')"),
    settings.indexOf('{/* ── App Info'),
  );

  // The section's rows, in the order they render: About AI Voice is the only
  // one — the result-filter row was removed with its dialog.
  const rowLabels = [...help.matchAll(/<SettingRow[\s\S]*?label=\{t\('(\w+)'\)\}/gu)]
    .map(match => match[1]);
  assert.deepEqual(rowLabels, ['ai_voice_info_menu']);

  // Basic and Premium see it; Free does not, and neither does anyone while the
  // subscription is still loading — `canUseAI` is false until RevenueCat answers.
  // The heading rides on the same condition, so it never stands above nothing.
  assert.match(
    settings.slice(settings.indexOf('{/* ── Help ─'), settings.indexOf('{/* ── App Info')),
    /\{canUseAI && \(\s*<>[\s\S]*?<SettingRow icon="mic-outline" label=\{t\('ai_voice_info_menu'\)\}[\s\S]*?<\/>\s*\)\}/u,
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
  const rowStart = settings.indexOf("label={t('ai_voice_info_menu')}");
  const row = settings.slice(rowStart, settings.indexOf('/>', rowStart));
  // It dismisses its own marker and opens the explanation. Nothing else.
  assert.match(row, /setAboutAIVoiceVisible\(true\);/u);
  assert.doesNotMatch(row, /speak|preview|ensureAIConsent|requestAI|setAIConsent/u);
});

test('10-11. the copy avoids "API" without touching internal identifiers', () => {
  const i18n = read('src/i18n.ts');

  // Every user-facing string in this group, English and Japanese.
  const values = [...i18n.matchAll(/^\s+(ai_voice_info_\w+):([\s\S]*?)(?=\n\s+[a-z_]+:)/gmu)];
  assert.ok(values.length >= 6, 'both locales, three keys each');
  for (const [, key, body] of values) {
    assert.doesNotMatch(body, /\bAPI\b/u, `${key} must not say API`);
  }

  // The replacement wording is the one the implementation actually matches:
  // requests go to an online service, and replays come from the device.
  assert.match(i18n, /ai_voice_info_body:[\s\S]{0,400}online AI voice service/u);
  assert.match(i18n, /ai_voice_info_body:[\s\S]{0,600}オンラインのAI音声サービス/u);
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
  assert.match(rule, /VOICE_LIFETIME_CREDITS,\s*VOICE_MONTHLY_LIMITS,\s*type PlanTier,\s*\} from '\.\/planLimits';/u);
  // Both allowances, so a plan with either is eligible and neither is restated.
  assert.match(
    rule,
    /return VOICE_MONTHLY_LIMITS\[plan\] !== 0 \|\| VOICE_LIFETIME_CREDITS\[plan\] !== 0;/u,
  );
  // No second list of tier names anywhere in the rule.
  assert.doesNotMatch(rule, /'basic' \|\| |=== 'premium'|isSubscribed/u);
});

test('an unknown RevenueCat state is never treated as a cancellation', () => {
  const rule = read('src/lib/aiEntitlement.ts');
  // A verified downgrade needs a real snapshot behind it, not just plan === free.
  assert.match(
    rule,
    /export function isVerifiedAIIneligiblePlan[\s\S]*?state\.isSubscriptionLoaded\s*&& state\.entitlementSource !== null\s*&& !planCanUseAI\(state\.plan\)/u,
  );

  const app = read('App.tsx');
  assert.match(app, /if \(!isVerifiedAIIneligiblePlan\(aiEntitlement\)\) return;\s*void invalidateAIConsent\(\);/u);
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

test('18. on-device speech needs no entitlement and no consent', () => {
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');
  // Only the AI Voice path asks; device speech and attached audio do not. The
  // flag is the capability, so Free is on the device engine and is never
  // prompted — as is anyone who chose the free voice after their credits ran out.
  assert.match(
    playback,
    /const usesAI = canUseAIVoice && !\(target === 'word' && Boolean\(item\.audioUri\)\);/u,
  );
  assert.match(playback, /if \(usesAI && !await ensureAIConsentForUserAction\(\)\) return;/u);

  // The device engine is reached without touching the network layer at all.
  const tts = read('src/lib/tts.ts');
  assert.match(tts, /if \(canUseAIVoice\) return speakWithAI\(text, activeAIVoice, options\);\s*return speakFree\(/u);
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
  // `planCanUseAI` appears in the sheet, but only to label which plan the
  // feature belongs to — never around the preview controls themselves.
  const card = sheet.slice(sheet.indexOf('const AIVoiceCard'), sheet.indexOf('const PlanLabels'));
  assert.doesNotMatch(card, /canUseAI &&|canUseAI \?/u, 'no entitlement gate on the preview');
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

  // Checked on the device against the same fixed list the Worker enforces.
  assert.match(promo, /if \(!isPromoSampleId\(sample\)\) \{/u);
  // The body is built here, from arguments — a caller cannot supply one.
  assert.match(promo, /\{\s*sample,\s*\.\.\.\(langCode !== undefined \? \{ langCode \} : \{\}\),\s*\.\.\.\(sampleVersion !== undefined \? \{ sampleVersion \} : \{\}\),\s*\}/u);
  assert.doesNotMatch(promo, /\btext\b|\bvoice\b|instructions/u, 'no text or voice field exists');

  // Both allowlists agree, and the Worker's schema has no text or voice field.
  const clientList = read('src/lib/promoVoiceSamples.ts');
  const workerList = read('cloudflare/wordping-api/src/config.ts');
  assert.match(clientList, /PROMO_SAMPLE_IDS = \['spontaneous', 'vertical', 'merely', 'morning_light'\]/u);
  assert.match(workerList, /PROMO_SAMPLE_IDS = \['spontaneous', 'vertical', 'merely', 'morning_light'\]/u);
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
  // One request, one catch, a message — no retry against another endpoint. The
  // message is chosen by promoFailureMessageKey, which cannot reach a route.
  assert.match(handler, /promoFailureMessageKey\(error, isAI\)/u);
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

  // The Privacy section that once held the duplicate is gone entirely, so
  // there is no header, divider or spacing left where it used to be.
  assert.doesNotMatch(settings, /privacy_section/u);
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

test('the old result-filter popup, and its exit trigger, are gone', () => {
  const app = read('App.tsx');
  // Removed outright: the component, the rule that decided when to raise it,
  // and every reference App held to either.
  assert.equal(fs.existsSync('src/components/ResultFilterTutorial.tsx'), false);
  assert.doesNotMatch(app, /<ResultFilterTutorial|components\/ResultFilterTutorial/u);
  assert.doesNotMatch(app, /shouldShowResultFilterTutorial|dismissResultFilterTutorial/u);
  assert.doesNotMatch(
    read('src/features/onboarding/tutorialState.ts'),
    /shouldShowResultFilterTutorial|ResultFilterTutorialInput/u,
  );
  // Nothing may be raised by leaving the test: no rule anywhere reads whether
  // Test Mode is open, or how it ended.
  assert.doesNotMatch(app, /isTestModeOpen/u);
  assert.doesNotMatch(read('src/features/onboarding/tutorialState.ts'), /isTestModeOpen|isAppReady/u);

  // The two flags themselves stay: they are what already-taught users carry.
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
  // Swipe and long-press are taught by a seeded tutorial card instead.
  assert.match(
    read('src/lib/db.ts'),
    /word: 'Word cards and folders can be edited by swiping or long-pressing them\.'/u,
  );
});

test('the eight tutorial cards are seeded once and owned by onboarding', () => {
  const db = read('src/lib/db.ts');
  const cards = db.slice(db.indexOf('const DEFAULT_CARDS'), db.indexOf('export interface Settings'));

  // Eight placeholder cards, in tutorial order.
  const ids = [...cards.matchAll(/id: '(wp-w\d)'/gu)].map(match => match[1]);
  assert.deepEqual(ids, ['wp-w1', 'wp-w2', 'wp-w3', 'wp-w4', 'wp-w5', 'wp-w6', 'wp-w7', 'wp-w8']);

  // Seeded once, only on a genuine first launch.
  assert.match(db, /if \(isFirstLaunch && cards\.length === 0\)/u);
  assert.match(db, /settings\.set\(SEEDED_KEY, String\(Date\.now\(\)\)\);/u);

  // WELCOME_CARD_IDS is the list onboarding removes and rebuilds, so it must
  // cover every seeded id — otherwise a placeholder would survive in English,
  // or the four Vocabulary & Terms cards would leave four seeded ones behind.
  const welcome = read('src/features/onboarding/welcomeContent.ts');
  const welcomeIds = [...welcome.matchAll(/'(wp-w\d)'/gu)].map(match => match[1]);
  assert.deepEqual(welcomeIds, ids);
  assert.match(read('App.tsx'), /prev\.filter\(c => !WELCOME_CARD_IDS\.includes\(c\.id\)\)/u);

  // Each seeded card's English copy is the matching tutorial instruction, so the
  // placeholder a first launch shows cannot drift from the translated one.
  const english = welcome.slice(welcome.indexOf("'en-US': ["), welcome.indexOf("'ja-JP': ["));
  const instructions = [...english.matchAll(/^ {4}'(.+)',$/gmu)].map(match => match[1]);
  assert.equal(instructions.length, 8);
  for (const instruction of instructions) {
    assert.ok(
      cards.includes(`word: '${instruction}'`),
      `DEFAULT_CARDS is missing the tutorial instruction: ${instruction}`,
    );
  }
});

test('every locale carries all eight tutorial instructions', () => {
  const welcome = read('src/features/onboarding/welcomeContent.ts');
  const table = welcome.slice(
    welcome.indexOf('const WELCOME_CARD_TEXTS'),
    welcome.indexOf('export const WELCOME_CARD_IDS'),
  );

  // Same locales the onboarding picker offers, minus 'other', which is the one
  // deliberate English fallback.
  const onboarding = read('src/components/OnboardingModal.tsx');
  const pickerLocales = [...onboarding
    .slice(0, onboarding.indexOf('// ── Language picker'))
    .matchAll(/\{ code: '([\w-]+)',/gu)]
    .map(match => match[1])
    .filter(code => code !== 'other');

  const entries = [...table.matchAll(/^ {2}'?([\w-]+)'?: \[\n((?: {4}.+\n)+) {2}\],$/gmu)];
  const covered = entries.map(entry => entry[1]);
  assert.deepEqual(covered.slice().sort(), pickerLocales.slice().sort());

  for (const [, locale, body] of entries) {
    const lines = body.split('\n').filter(line => line.trim().length > 0);
    assert.equal(lines.length, 8, `${locale} must carry all eight instructions`);
  }

  // No locale left as untranslated English: only 'en-US' may repeat its own copy.
  const englishEntry = entries.find(entry => entry[1] === 'en-US');
  assert.ok(englishEntry);
  const englishLines = englishEntry[2].split('\n').map(line => line.trim()).filter(Boolean);
  for (const [, locale, body] of entries) {
    if (locale === 'en-US') continue;
    for (const line of body.split('\n').map(l => l.trim()).filter(Boolean)) {
      assert.ok(
        !englishLines.includes(line),
        `${locale} still carries the English string: ${line}`,
      );
    }
  }
});

test('the tutorial cards map instructions onto both purposes', () => {
  const welcome = read('src/features/onboarding/welcomeContent.ts');

  // Language Learning: the same instruction on both sides, in the two languages.
  assert.match(welcome, /word:\s+wordTexts\[i\],\n\s+meaning:\s+meaningTexts\[i\],/u);

  // Vocabulary & Terms: four cards, both sides in the explanation language,
  // pairing consecutive instructions rather than repeating one.
  assert.match(welcome, /\[0, 1, 2, 3\]\.map\(i => \(\{/u);
  assert.match(welcome, /word:\s+meaningTexts\[i \* 2\],\n\s+meaning:\s+meaningTexts\[i \* 2 \+ 1\],/u);
  assert.match(welcome, /wordLang:\s+meaningLang,/u);
});

test('the legend still follows the real chip mapping', () => {
  const levels = read('src/features/cards/levels.ts');
  // Built from LEVEL_FILTER_OPTIONS rather than restated, so nothing derived
  // from it can describe a colour the chips no longer use.
  assert.match(levels, /export const RESULT_FILTER_LEGEND: readonly ResultFilterLegendEntry\[\] = LEVEL_FILTER_OPTIONS\.map\(/u);
});

test('the first answer is recorded without interrupting the test', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  // Reported from `advance`, the grading path — not from a popup or a modal.
  assert.match(screen, /if \(gradedIdsRef\.current\.size === 0\) onFirstAnswer\?\.\(\);/u);

  const app = read('App.tsx');
  assert.match(app, /onFirstAnswer=\{\(\) => setFirstTestAnswerRecorded\(true\)\}/u);
  // Written straight away, so a force-close right after the answer keeps the
  // tutorial pending rather than losing it.
  assert.match(
    read('src/app/useAppPersistence.ts'),
    /AsyncStorage\.setItem\(FIRST_TEST_ANSWER_KEY, serializeTutorialFlag\(firstTestAnswerRecorded\)\)/u,
  );
});

test('the introduction is one derived step, never a fired event', () => {
  const state = read('src/features/onboarding/tutorialState.ts');
  const screen = read('src/components/TestModeScreen.tsx');

  // One answer, so two popups can never be on screen at once.
  assert.match(state, /export function nextTestIntroStep\(input: TestIntroInput\): TestIntroStep \| null/u);
  // Order is structural: an unseen step stops the search, so a later step can
  // never overtake an earlier one, and a resume lands on the first unseen step.
  assert.match(
    state,
    /if \(!input\.seen\.opened\) {3}return input\.hasCard \? 'opened' : null;\s*if \(!input\.seen\.revealed\) return input\.hasRevealedAnswers \? 'revealed' : null;\s*if \(!input\.seen\.answered\) return input\.hasAnswered \? 'answered' : null;/u,
  );
  // Nothing is shown before the stored flags have been read.
  assert.match(state, /if \(!input\.loaded \|\| input\.isScreenBusy\) return null;/u);

  // Derived in render, not raised from an effect: there is no "show" event for
  // a re-render, a repeated tap or Strict Mode to run twice.
  assert.match(screen, /const introStep = nextTestIntroStep\(\{/u);
  const introBlock = screen.slice(
    screen.indexOf('const introStep = nextTestIntroStep({'),
    screen.indexOf('// ── Voice playback'),
  );
  assert.doesNotMatch(introBlock, /useEffect|setTimeout/u);

  // Each step is written when its popup is dismissed, so quitting mid-step
  // resumes there rather than swallowing it.
  assert.match(screen, /if \(introStep === 'revealed'\) intro\.markSeen\('revealed'\);/u);
  assert.match(screen, /if \(introDialogStep\) intro\.markSeen\(introDialogStep\);/u);
  // Three separate keys, one per step.
  assert.match(
    state,
    /opened: {3}'wordping_tutorial_test_opened',\s*revealed: 'wordping_tutorial_test_revealed',\s*answered: 'wordping_tutorial_test_answered',/u,
  );
});

test('the introduction can never make the Test controls unpressable', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  const dialog = read('src/components/TestIntroDialog.tsx');
  const app = read('App.tsx');

  // One native modal on this screen, the Info popup — the count it has always
  // had. A second `Modal` mounted beside it is what left a presented window
  // swallowing every touch, including the X that unmounts this screen and the
  // Test icon that toggles it.
  assert.equal((screen.match(/<Modal/gu) ?? []).length, 1, 'exactly one native modal here');
  assert.doesNotMatch(dialog, /<Modal|from 'react-native'[\s\S]{0,120}Modal/u, 'the step dialog is an overlay');
  assert.match(dialog, /if \(!visible\) return null;/u, 'nothing is left mounted when hidden');

  // The test screen publishes the step and takes it back when it unmounts, so
  // the overlay cannot outlive the session the X ends — which is what keeps
  // that button working, not leaving part of the screen uncovered.
  assert.match(screen, /useEffect\(\(\) => \(\) => onIntroChange\?\.\(null\), \[onIntroChange\]\);/u);
  assert.doesNotMatch(screen, /TestIntroDialog/u, 'the test screen renders no dialog of its own');
  assert.match(app, /onIntroChange=\{setTestIntro\}/u);

  // Navigation runs first and unconditionally; the marker write is a
  // consequence of the tap, never a gate on it.
  assert.match(
    app,
    /onOpenTestMode: \(\) => \{\s*toggleTestMode\(\);\s*discovery\.dismiss\(FEATURE_MARKERS\.testIcon\);\s*\},/u,
  );
  assert.match(
    app,
    /onOpenNotifications: \(\) => \{\s*setNotificationModalVisible\(true\);\s*discovery\.dismiss\(FEATURE_MARKERS\.notificationIcon\);\s*\},/u,
  );
  // The toggle and the quit are untouched by any of it: no marker, seen state
  // or popup state appears in either.
  const quit = app.slice(app.indexOf('const quitTestMode'), app.indexOf('// ── The Word List header'));
  assert.doesNotMatch(quit, /discovery|FEATURE_MARKERS|intro/u, 'quitting reads no badge state');
  // And nothing anywhere makes a press conditional on a seen flag.
  assert.doesNotMatch(app, /disabled=\{[^}]*(?:showTestMarker|showNotificationMarker)/u);
  assert.doesNotMatch(
    read('src/screens/WordListScreen/WordListScreen.tsx'),
    /disabled=\{[^}]*(?:showTestMarker|showNotificationMarker)/u,
  );
});

test('a step postpones the automatic voice rather than adding a second one', () => {
  const screen = read('src/components/TestModeScreen.tsx');

  // The hold, including the case that caused the bug: the mute preference and
  // the introduction flags are separate reads, and the card spoke as soon as
  // the first one landed — before anything knew a popup was due.
  assert.match(screen, /const introPlaybackHold = !intro\.loaded \|\| introStep !== null;/u);

  // Front: held, and re-run by the release, so closing a step speaks the card
  // that is on screen then — `queue\[idx\]`, never the one just answered.
  assert.match(screen, /if \(!mutedLoaded \|\| introPlaybackHold\) return;/u);
  assert.match(screen, /\}, \[idx, sessionKey, mutedLoaded, canUseAIVoice, introPlaybackHold\];?\)/u);
  // A turned-over card belongs to the back side, so releasing the second step
  // cannot speak the front of a card the user is looking at the back of.
  assert.match(screen, /if \(backPlayed\) return;\s*const current = queue\[idx\];/u);
  // Nothing to say once the queue is spent, so the last answer ends in silence.
  assert.match(screen, /if \(!current\?\.word \|\| muted\) return;/u);

  // Back: the same shape, so the reveal itself is silent while the step that
  // the reveal raised is up.
  assert.match(screen, /if \(!backPlayed \|\| introPlaybackHold\) return;\s*if \(muted \|\| !card\?\.meaning\) return;\s*void playMeaning\(\);/u);
  assert.match(screen, /\}, \[backPlayed, introPlaybackHold\];?\)/u);

  // One caller per side. The flip records the reveal and says nothing, and no
  // dismiss handler speaks — a second call there would play over the first.
  assert.match(screen, /if \(!backPlayed\) setBackPlayed\(true\);/u);
  assert.equal((screen.match(/void playMeaning\(\);/gu) ?? []).length, 2, 'the effect and the icon');
  assert.equal((screen.match(/void playWord\(\);/gu) ?? []).length, 2, 'the effect and the icon');
  const dismissals = screen.slice(screen.indexOf('const closeInfoPopup'), screen.indexOf('// ── Voice playback'));
  assert.doesNotMatch(dismissals, /playWord|playMeaning/u, 'dismissing speaks nothing directly');
});

test('the introduction spotlights measured targets and anchors below them', () => {
  const app = read('App.tsx');
  const dialog = read('src/components/TestIntroDialog.tsx');
  const testMode = read('src/components/TestModeScreen.tsx');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');

  // Hosted in the window itself, after the SafeAreaView rather than inside it:
  // an absolutely-filled child is laid out inside its parent's padding, so
  // anything under those insets leaves the status bar and the bottom strip
  // undimmed. The background colour moves out with it, since those two regions
  // are now the outer view's to paint.
  assert.match(app, /<View style=\{\[s\.root, \{ backgroundColor: pal\.bg \}\]\}>\s*<SafeAreaView style=\{s\.root\}>/u);
  assert.match(app, /<\/SafeAreaView>[\s\S]{0,2400}<TestIntroDialog[\s\S]{0,800}\/>\s*<\/View>/u);

  // Both holes come from the real views in window coordinates. The card keeps
  // its own radius; the complete chip group is measured as one target.
  assert.match(testMode, /cardSlotRef\.current\?\.measureInWindow/u);
  assert.match(testMode, /radius: FLIP_CARD_RADIUS/u);
  assert.match(wordList, /chipGroupRef\.current\?\.measureInWindow/u);
  assert.match(wordList, /ref=\{chipGroupRef\}[\s\S]{0,100}onLayout=\{measureChipGroup\}/u);

  // A single huge border creates the rounded transparent centre. There are no
  // four dim strips, no padding that changes the target dimensions, and no
  // centred fallback while measurement is pending.
  assert.match(dialog, /borderWidth: spread,[\s\S]{0,80}borderColor: DIM_COLOR,[\s\S]{0,80}borderRadius: rect\.radius \+ spread,/u);
  assert.match(dialog, /width: rect\.width \+ spread \* 2/u);
  assert.match(dialog, /height: rect\.height \+ spread \* 2/u);
  assert.doesNotMatch(dialog, /SPOTLIGHT_PADDING|centredSlot/u);
  assert.match(dialog, /if \(!visible \|\| !isMeasuredRect\(spotlight\)\) return null;/u);

  // Placement is always below the measured target and bounded by the bottom
  // inset. The body shrinks/scrolls inside that space on a short screen.
  assert.match(dialog, /anchorBelowRect\(\{/u);
  assert.match(dialog, /bottomInset: insets\.bottom/u);
  assert.match(dialog, /top: anchored\.top, height: anchored\.maxHeight/u);
  assert.match(dialog, /bodyScroll: \{ flexGrow: 0, flexShrink: 1 \}/u);
});

test('one development-only switch replays the complete Test tutorial', () => {
  const flags = read('src/features/flags.ts');
  const hook = read('src/hooks/useTestIntro.ts');

  assert.match(flags, /export const TEST_TUTORIAL_MODE = false;/u);
  assert.match(hook, /const replayIntro = __DEV__ && TEST_TUTORIAL_MODE;/u);
  assert.match(hook, /const \[loaded, setLoaded\] = useState<boolean>\(replayIntro\);/u);
  assert.match(hook, /if \(replayIntro\) return;[\s\S]{0,180}AsyncStorage\.multiGet/u);
  assert.match(hook, /setSeen\(current => markTestIntroSeen\(current, step\)\);\s*if \(replayIntro\) return;\s*AsyncStorage\.setItem/u);
});

test('the three steps fire on opening, revealing and answering — in that order', () => {
  const screen = read('src/components/TestModeScreen.tsx');

  // 1. Opening: a card must be on screen for the popup to point at, and it does
  //    not touch the card — no flip, no answers.
  assert.match(screen, /hasCard: active && !showAnalytics,/u);
  assert.match(
    screen,
    /const introMessage = introDialogStep === 'answered'\s*\? localizeTestIntroResults\(t\)\s*: t\('test_intro_tap_card'\);/u,
  );

  // 2. Revealing: `backPlayed` is the same flag the answer row's opacity and
  //    pointerEvents read, so the popup cannot precede the choices appearing.
  assert.match(screen, /hasRevealedAnswers: backPlayed,/u);
  assert.match(screen, /opacity: backPlayed \? 1 : 0/u);
  // It is the Info popup itself, so there is one description of the results.
  assert.match(screen, /const infoPopupVisible = infoVisible \|\| introStep === 'revealed';/u);
  assert.match(screen, /<InfoPopup\s*visible=\{infoPopupVisible\}/u);
  // And the button still opens it manually at any time.
  assert.match(screen, /onPress=\{\(\) => setInfoVisible\(true\)\}/u);

  // 3. Answering: set in the exit animation's completion, after the grade was
  //    applied and the queue advanced — the answer is complete first.
  assert.match(screen, /setIdx\(i => i \+ 1\);[\s\S]{0,400}setAnsweredOnce\(true\);/u);
  assert.match(screen, /hasAnswered: answeredOnce,/u);
});

test('the filters are revealed by the first answer, and by the old flag', () => {
  const state = read('src/features/onboarding/tutorialState.ts');
  // Two eras of one rule: the answer that raises the popup explaining the
  // colours, and the flag everyone taught the previous way already carries.
  assert.match(
    state,
    /export function shouldShowResultFilters\(input: ResultFilterVisibilityInput\): boolean \{\s*return input\.hasSeenResultFilterTutorial \|\| input\.hasCompletedFirstTestAnswer;\s*\}/u,
  );

  const app = read('App.tsx');
  assert.match(
    app,
    /const showResultFilters = shouldShowResultFilters\(\{\s*hasSeenResultFilterTutorial: resultFilterTutorialSeen,\s*hasCompletedFirstTestAnswer: firstTestAnswerRecorded,\s*\}\);/u,
  );
});

test('Settings has no result-filter row, and no Help heading without a row', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // The explanation is shown once, automatically, from App.tsx. Settings no
  // longer offers a way back to it, so it must not carry the row, the dialog
  // or the state that opened it.
  assert.doesNotMatch(settings, /help_result_filters/u);
  assert.doesNotMatch(settings, /ResultFilterTutorial/u);
  assert.doesNotMatch(settings, /resultFilterHelpVisible/u);
  // About AI Voice is the only entry left, so the heading is drawn under the
  // same condition rather than standing above nothing on a plan without it.
  assert.match(settings, /t\('help_section'\)/u);
  const help = settings.slice(
    settings.indexOf("{/* ── Help ─"),
    settings.indexOf("{/* ── App Info ─"),
  );
  assert.match(help, /\{canUseAI && \(\s*<>/u);
  assert.match(help, /ai_voice_info_menu/u);
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
  const testButton = bar.slice(bar.indexOf('onPress={handleOpenTestMode}'));
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
  assert.match(bar, /onPress=\{handleOpenTestMode\}/u);
  const testButtonAt = bar.indexOf('handleOpenTestMode');
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
    'help_section',
    'result_filter_title', 'result_filter_intro',
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

test('the Test introduction copy and localized answer labels ship in every locale', () => {
  const i18n = read('src/i18n.ts');
  const screen = read('src/components/TestModeScreen.tsx');
  // One entry per dictionary. `test_info_title` is required of every locale, so
  // its count is the number of dictionaries the file actually has.
  const locales = (i18n.match(/^ {2}test_info_title:/gmu) ?? []).length;
  assert.ok(locales >= 20, `expected every locale, found ${locales}`);
  for (const key of [
    'test_intro_tap_card', 'test_intro_results', 'test_intro_got_it',
    'test_know_perfectly', 'test_know_good', 'test_know_slightly', 'test_dont_know',
  ]) {
    const occurrences = i18n.match(new RegExp(`\\b${key}:`, 'gu')) ?? [];
    assert.equal(occurrences.length, locales, `${key} is missing from a locale`);
  }

  // Each sentence is a localized template. Its four labels are resolved from
  // the same bound translator, reusing the authoritative Test-answer keys.
  assert.match(
    screen,
    /function localizeTestIntroResults\(t:[\s\S]*ANSWERS\.reduce\([\s\S]*message\.replace\(`\{\$\{answer\.kind\}\}`,[ ]*t\(answer\.labelKey\)\)[\s\S]*t\('test_intro_results'\)/u,
  );
  for (const placeholder of ['perfect', 'good', 'slightly', 'unknown']) {
    const occurrences = i18n.match(new RegExp(`\\{${placeholder}\\}`, 'gu')) ?? [];
    assert.equal(occurrences.length, locales, `{${placeholder}} is missing from a locale`);
  }

  // The surrounding copy remains localized; only the answer names are slots.
  assert.match(
    i18n,
    /test_intro_tap_card: {3}'Tap the card to test your understanding of its meaning\.',/u,
  );
  assert.match(
    i18n,
    /test_intro_tap_card: {3}'カードをタップして、意味を理解できているかテストしましょう。',/u,
  );
  assert.match(
    i18n,
    /'\{perfect\} words are removed from review\. \{good\}, \{slightly\}, and \{unknown\} words are sorted into the colored sections at the top-left and temporarily disappear from the main word list\.',/u,
  );
  assert.match(
    i18n,
    /'\{perfect\}の単語は復習対象から削除されます。\{good\}、\{slightly\}、\{unknown\}の単語は左上の色別セクションに仕分けされ、メインの単語帳には一時的に表示されなくなります。',/u,
  );

  const resultLines = [...i18n.matchAll(/^ {2}test_intro_results:\s*\n\s*'(.+)',$/gmu)].map(m => m[1]);
  assert.equal(resultLines.length, locales);
  for (const line of resultLines) {
    assert.doesNotMatch(line, /Perfect|Pretty good|Not really|Don’t know/u);
  }

  // No locale may be left holding the English or Japanese line as its own.
  const introLines = [...i18n.matchAll(/^ {2}test_intro_tap_card: +'(.+)',$/gmu)].map(m => m[1]);
  assert.equal(new Set(introLines).size, introLines.length, 'a locale repeats another’s copy');
});

test('Settings has no Subscription Diagnostics UI or hidden entry point', () => {
  assert.equal(fs.existsSync('src/components/SubscriptionDiagnosticsSheet.tsx'), false);

  for (const path of [
    'App.tsx',
    'src/app/AppModals.tsx',
    'src/components/SettingsModal.tsx',
    'src/features/flags.ts',
    'src/i18n.ts',
  ]) {
    assert.doesNotMatch(
      read(path),
      /SUBSCRIPTION_DIAGNOSTICS_ENABLED|SubscriptionDiagnostics|diagnosticsVisible/u,
      `${path} must not retain diagnostics-only UI or navigation`,
    );
  }

  const settings = read('src/components/SettingsModal.tsx');
  assert.match(settings, /<SettingRow icon="information-circle-outline" label=\{t\('app_version'\)\}\s*value=\{APP_VERSION\} pal=\{pal\} \/>/u);
  assert.doesNotMatch(settings, /delayLongPress|onLongPress/u);
});


// ── TEMPORARY: the Apple Sandbox build profile ───────────────────────────────

test('the sandbox profile targets Apple Sandbox without disturbing the others', () => {
  const eas = JSON.parse(read('eas.json'));
  const { development, preview, sandbox, production } = eas.build;
  const RC = 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY';

  // A standalone device build you can side-load. Deliberately NOT a dev
  // client: without one the JS is embedded at build time, so the key below is
  // the key the app actually runs with. A dev client would fetch its bundle
  // from Metro, which re-inlines EXPO_PUBLIC_* from the local .env — the
  // Test Store key — and silently defeat the point of this profile.
  assert.equal(sandbox.developmentClient, undefined);
  assert.equal(sandbox.distribution, 'internal');
  // Sandbox StoreKit does not exist on the simulator.
  assert.equal(sandbox.ios.simulator, false);

  // Real Apple Sandbox means the Apple App Store key, and specifically the same
  // RevenueCat app production uses — otherwise the purchase lands in a
  // different project and proves nothing. Compared, never printed.
  assert.equal(sandbox.env[RC], production.env[RC]);
  assert.ok(sandbox.env[RC].startsWith('appl_'), 'must be an App Store key');
  assert.ok(!sandbox.env[RC].startsWith('test_'), 'must not be the Test Store key');

  // Marked in the build environment for profile-specific behavior.
  assert.equal(sandbox.env.EXPO_PUBLIC_BUILD_PROFILE, 'sandbox');

  // The other three are untouched: dev and preview keep the Test Store key,
  // production keeps store distribution and its auto-increment.
  assert.ok(development.env[RC].startsWith('test_'));
  assert.ok(preview.env[RC].startsWith('test_'));
  assert.equal(development.developmentClient, true);
  assert.equal(preview.distribution, 'internal');
  assert.equal(production.autoIncrement, true);
  assert.equal(production.distribution, undefined, 'production stays store distribution');
  assert.equal(production.env.EXPO_PUBLIC_BUILD_PROFILE, undefined);

  // Every profile points at the same Worker: sandbox testing must not send the
  // device to a different backend or a different RevenueCat project.
  const url = 'EXPO_PUBLIC_WORDPING_API_BASE_URL';
  for (const profile of [development, preview, sandbox, production]) {
    assert.equal(profile.env[url], production.env[url]);
  }

  // No secret of any kind is carried in a build profile.
  const envJson = JSON.stringify(eas.build);
  assert.doesNotMatch(envJson, /sk_|SECRET|OPENAI|RATE_LIMIT_SALT|REVENUECAT_SECRET/u);
});

// ── Subscription onboarding, permission withdrawal and "!" markers ───────────

test('1-6. the consent offer is wired to a verified purchase and a closed sheet', () => {
  const app = read('App.tsx');

  assert.match(app, /shouldPromptConsentAfterSubscription\(\{/u);
  assert.match(app, /entitlementSource,/u);
  assert.match(app, /consent: getAIConsent\(\),/u);
  assert.match(app, /alreadyPrompted: consentPromptShown,/u);
  assert.match(app, /isUpgradeSheetClosed: !proSheetVisible && !settingsModalVisible,/u);

  // Waits for the sheet's dismissal animation rather than guessing a duration.
  assert.match(app, /InteractionManager\.runAfterInteractions\(\(\) => \{/u);
  assert.doesNotMatch(app, /setTimeout\([^)]*shouldPromptConsentAfterSubscription/u);

  // Recorded before the dialog opens, so a dismissal still counts as offered.
  assert.match(app, /setConsentPromptShown\(true\);[\s\S]{0,300}ensureAIConsentForUserAction\(\)/u);
  // Persisted, and cleared on a verified downgrade so a resubscription re-asks.
  assert.match(app, /AsyncStorage\.setItem\(SUBSCRIPTION_CONSENT_PROMPT_KEY, serializeConsentPromptShown\(true\)\)/u);
  assert.match(
    app,
    /if \(!isVerifiedAIIneligiblePlan\(aiEntitlement\)\) return;[\s\S]{0,400}serializeConsentPromptShown\(false\)/u,
  );
  // Defaults to "shown" until storage answers, so it cannot flash.
  assert.match(app, /useState\(true\);[\s\S]{0,200}SUBSCRIPTION_CONSENT_PROMPT_KEY/u);
});

test('10. the standalone AI Data Sharing row is gone from Settings', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // The row, its status line, its section and the code that existed only for it.
  assert.doesNotMatch(settings, /ai_consent_setting_desc|ai_consent_setting_info|handleToggleAIConsent/u);
  assert.doesNotMatch(settings, /privacy_section|rowDescription/u);
  assert.doesNotMatch(settings, /useAIConsent/u, 'the row was the only consumer here');
  // The keys went with it.
  const i18n = read('src/i18n.ts');
  assert.doesNotMatch(i18n, /ai_consent_setting_desc|ai_consent_setting_info|privacy_section/u);

  // The guard and the stored state are untouched.
  assert.match(read('src/lib/api/client.ts'), /await requireAIConsent\(\)/u);
  assert.match(read('src/lib/aiConsent.ts'), /export async function requireAIConsent/u);
});

test('11-12. permission is withdrawn from About AI Voice, and takes effect at once', () => {
  const dialog = read('src/components/AboutAIVoiceDialog.tsx');

  // Offered only while it is actually granted; otherwise a plain status.
  assert.match(dialog, /consent === 'granted' \? \(/u);
  assert.match(dialog, /accessibilityLabel=\{t\('ai_consent_withdraw'\)\}/u);
  assert.match(dialog, /'ai_consent_status_declined' : 'ai_consent_status_unknown'/u);

  // Confirmed, then written straight to the shared consent state — which is
  // what the network guard reads, so the next request is blocked immediately.
  assert.match(dialog, /Alert\.alert\(\s*t\('ai_consent_withdraw'\),/u);
  assert.match(dialog, /onPress: \(\) => \{ void setAIConsent\('declined'\); \}/u);

  // It destroys nothing and cannot touch the subscription.
  assert.doesNotMatch(dialog, /setCards|deleteCard|Paths\.|\.delete\(|purchase|restore/u);

  const i18n = read('src/i18n.ts');
  assert.match(i18n, /ai_consent_withdraw: 'Withdraw AI Data Sharing Permission'/u);
  assert.match(i18n, /ai_consent_withdraw: 'AIデータ共有の許可を取り消す'/u);
});

test('13. the Privacy Policy names the new withdrawal path', () => {
  const legal = read('website/lib/legalContent.ts');
  assert.match(legal, /Settings → Help → About AI Voice/u);
  assert.match(legal, /「設定」→「ヘルプ」→「AI Voiceについて」/u);
  // The removed row is no longer described as the way to withdraw.
  assert.doesNotMatch(legal, /Privacy → AI Data Sharing|「プライバシー」→「AIデータ共有」/u);
  // And the in-app consent dialog agrees with it.
  assert.match(read('src/i18n.ts'), /ai_consent_body:[\s\S]{0,900}Settings → Help → About AI Voice/u);
});

test('14. the About AI Voice row has no description', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const help = settings.slice(
    settings.indexOf("t('help_section')"),
    settings.indexOf('{/* ── App Info'),
  );
  assert.match(help, /label=\{t\('ai_voice_info_menu'\)\}/u);
  assert.doesNotMatch(help, /ai_voice_info_desc|rowDescription/u);
  assert.doesNotMatch(read('src/i18n.ts'), /ai_voice_info_desc/u);
  // The popup body and the withdrawal action are kept.
  assert.match(read('src/components/AboutAIVoiceDialog.tsx'), /t\('ai_voice_info_body'\)/u);
});

test('7. the markers are attached to the requested controls and nothing else', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const word = read('src/components/WordModal.tsx');

  // Natural AI Voice, About AI Voice, Theme Shop — each dismissing only itself.
  assert.match(settings, /discovery\.dismiss\(FEATURE_MARKERS\.naturalAIVoice\);\s*setVoicePickerVisible\(true\);/u);
  assert.match(settings, /discovery\.dismiss\(FEATURE_MARKERS\.aboutAIVoice\);\s*setAboutAIVoiceVisible\(true\);/u);
  assert.match(settings, /discovery\.dismiss\(FEATURE_MARKERS\.themeShop\); setShopVisible\(true\);/u);
  // The word editor's four controls. Each tap does its own job *and* dismisses
  // its own marker — one line each, so no tap can clear a marker it does not own.
  assert.match(word, /discovery\.dismiss\(FEATURE_MARKERS\.customAudio\);\s*handleAudioButton\(\);/u);
  assert.match(word, /discovery\.dismiss\(FEATURE_MARKERS\.hideWord\);\s*onChangeHideWord\?\.\(!hideWord\);/u);
  assert.match(word, /discovery\.dismiss\(FEATURE_MARKERS\.notifyWord\);\s*onToggleNotifCandidate\?\.\(\);/u);
  // Bulk Import dismisses before the closing animation starts, so the write does
  // not depend on the sheet still being mounted when the importer opens.
  assert.match(
    word,
    /const handleOpenBulkImport = \(\) => \{[\s\S]{0,320}?discovery\.dismiss\(FEATURE_MARKERS\.bulkImport\);[\s\S]*?onBulkImport\(\)/u,
  );

  // Not on the promo previews, the Privacy Policy, plan labels or a section header.
  assert.doesNotMatch(read('src/components/ProSheet.tsx'), /NewFeatureBadge|FEATURE_MARKERS/u);
  // The App Info sheet itself, not the shared SettingRow defined after it.
  const appInfo = settings.slice(
    settings.indexOf('// ── App Info sheet'),
    settings.indexOf('// ── Settings row'),
  );
  assert.doesNotMatch(appInfo, /NewFeatureBadge|badge=/u);
  assert.doesNotMatch(settings, /sectionLabel[\s\S]{0,120}NewFeatureBadge/u);
});

test('24. the marker is not colour alone and never blocks its control', () => {
  const badge = read('src/components/NewFeatureBadge.tsx');
  // A glyph, not a coloured dot, plus its own spoken label.
  assert.match(badge, /<Text style=\{styles\.glyph\}[^>]*>!<\/Text>/u);
  assert.match(badge, /accessibilityLabel=\{label\}/u);
  assert.match(read('src/i18n.ts'), /new_feature_badge: 'New feature'/u);
  assert.match(read('src/i18n.ts'), /new_feature_badge: '新機能'/u);
  // Inert: it cannot take a tap meant for the control it sits on. It is
  // absolutely positioned now — over the icon, never over the touch target's
  // handler — so only the interactive forms are excluded here.
  assert.match(badge, /pointerEvents="none"/u);
  assert.doesNotMatch(badge, /onPress|TouchableOpacity/u);
});

test('24b. the marker is pinned to the bottom-right of its feature icon', () => {
  const badge = read('src/components/NewFeatureBadge.tsx');

  // The icon is wrapped, so the anchor is the icon itself — not the row, the
  // label or the screen. A longer label or another language moves both together.
  assert.match(badge, /\{children\}/u);
  assert.match(badge, /position: 'absolute',\s*right: -BADGE_OVERHANG,\s*bottom: -BADGE_OVERHANG,/u);

  // Same corner and the same negative-inset pattern as the Test icon's count.
  const testIcon = read('src/components/TestStatusIcon.tsx');
  assert.match(testIcon, /position: 'absolute',\s*bottom: -4,/u);
  assert.match(testIcon, /right: -BADGE_OVERHANG,/u);

  // Nothing clips the overhang: not the wrapper, not the rows it sits in, not
  // the button in the word editor.
  assert.doesNotMatch(badge, /overflow: 'hidden'/u);
  const settings = read('src/components/SettingsModal.tsx');
  const rowStyles = settings.slice(settings.indexOf('const styles = StyleSheet.create'));
  assert.doesNotMatch(rowStyles, /overflow: 'hidden'/u);
  assert.doesNotMatch(read('src/components/WordModal.tsx'), /audioBtn: \{[^}]*overflow/u);
});

test('24c. every "!" marker wraps the feature\'s own left-side icon', () => {
  const settings = read('src/components/SettingsModal.tsx');

  // Theme Shop — the marker opens the row's icon element, and the label follows
  // it rather than sitting between the two.
  assert.match(
    settings,
    /visible=\{discovery\.isNew\(FEATURE_MARKERS\.themeShop\)\}[\s\S]{0,220}<Ionicons name="pricetag-outline"[\s\S]{0,80}<\/NewFeatureBadge>\s*<Text style=\{\[styles\.removeAdsLabel/u,
  );

  // Natural AI Voice — through CardBehaviorIcon, which wraps the glyph inside
  // its fixed-width column so the marker lands on the icon, not on the column.
  assert.match(
    settings,
    /<CardBehaviorIcon\s+name="mic-outline"[\s\S]{0,220}FEATURE_MARKERS\.naturalAIVoice/u,
  );
  assert.match(
    settings,
    /const icon = <Ionicons name=\{name\} size=\{CARD_BEHAVIOR_ICON_SIZE\}[\s\S]{0,320}<NewFeatureBadge visible=\{badge\.visible\}[\s\S]{0,80}\{icon\}/u,
  );
  // The row's label group no longer carries a marker of its own.
  assert.doesNotMatch(settings, /styles\.titleAndInfo[\s\S]{0,600}<NewFeatureBadge/u);

  // About AI Voice — through the shared SettingRow, whose marker wraps the icon
  // ahead of the label.
  assert.match(
    settings,
    /<NewFeatureBadge\s+visible=\{badge === true\}[\s\S]{0,220}<Ionicons name=\{icon\} size=\{18\}[\s\S]{0,80}<\/NewFeatureBadge>\s*<Text style=\{\[styles\.rowLabel/u,
  );

  // The word editor's controls get the same treatment: the marker wraps the
  // control's own glyph, never its label or the row it sits in.
  const word = read('src/components/WordModal.tsx');
  for (const [marker, icon] of [
    ['customAudio', /name=\{isPlayingAudio \? 'pause-circle'/u],
    ['hideWord', /name=\{hideWord \? 'eye-off' : 'eye-outline'\}/u],
    ['notifyWord', /name=\{notifCandidate \? 'notifications' : 'notifications-outline'\}/u],
  ]) {
    const badge = new RegExp(
      `visible=\\{[^}]*discovery\\.isNew\\(FEATURE_MARKERS\\.${marker}\\)\\}[\\s\\S]{0,700}?</NewFeatureBadge>`,
      'u',
    );
    const block = badge.exec(word)?.[0];
    assert.ok(block, `${marker} badge not found`);
    assert.match(block, icon, `${marker} must wrap its own icon`);
  }

  // Bulk Import is the exception, and deliberately: it has no icon, so the
  // marker wraps the button itself rather than its label.
  assert.match(
    word,
    /visible=\{discovery\.isNew\(FEATURE_MARKERS\.bulkImport\)\}[\s\S]{0,220}<TouchableOpacity[\s\S]{0,1000}<\/NewFeatureBadge>/u,
  );

  // Send Test has no icon either. Its own persisted marker wraps the complete
  // button and is dismissed by the first tap, not by opening Notification.
  const notification = read('src/components/NotificationModal.tsx');
  assert.match(
    notification,
    /<NewFeatureBadge\s+visible=\{showSendTestBadge\}[\s\S]{0,220}<TouchableOpacity[\s\S]{0,900}<\/NewFeatureBadge>/u,
  );
  assert.match(notification, /onPress=\{\(\) => \{\s*onSendTestSeen\(\);\s*onTest\(\);/u);
  const app = read('App.tsx');
  assert.match(app, /showSendTestBadge: discovery\.isNew\(FEATURE_MARKERS\.sendTest\)/u);
  assert.match(app, /onSendTestSeen: \(\) => discovery\.dismiss\(FEATURE_MARKERS\.sendTest\)/u);

  // Hide Front Word is marked in the Edit sheet only — the Add sheet shows the
  // two markers it was asked for — but the dismissal is unconditional, so a tap
  // in either sheet clears the one shared id.
  assert.match(word, /visible=\{editingCard !== null && discovery\.isNew\(FEATURE_MARKERS\.hideWord\)\}/u);

  // Upgrade Plan: on the row's own icon, dismissed by the tap that opens the
  // paywall rather than by the row being drawn.
  assert.match(
    settings,
    /onPress=\{\(\) => \{\s*discovery\.dismiss\(FEATURE_MARKERS\.upgradePlan\);\s*setProSheetVisible\(true\);\s*\}\}/u,
  );
  assert.match(
    settings,
    /visible=\{discovery\.isNew\(FEATURE_MARKERS\.upgradePlan\)\}[\s\S]{0,220}<Ionicons name="star-outline" size=\{18\}[\s\S]{0,80}<\/NewFeatureBadge>/u,
  );
  // Nothing about the row itself moved: same label, same plan chips, same chevron.
  assert.match(settings, /<\/NewFeatureBadge>\s*<Text style=\{\[styles\.removeAdsLabel, \{ color: pal\.text \}\]\}>\{t\('upgrade_plan'\)\}/u);
});

test('the Test marker replaces the count, and never shares its corner', () => {
  const icon = read('src/components/TestStatusIcon.tsx');
  // One early return: with the marker on, the count, the "99+" pill and the
  // completion tick are not rendered at all — there is no branch that draws
  // both. The count itself is computed exactly as before either way.
  assert.match(
    icon,
    /if \(markNew\) \{[\s\S]{0,400}<NewFeatureBadge visible themeColor=\{themeColor\}[\s\S]{0,300}<\/NewFeatureBadge>\s*\);\s*\}/u,
  );
  const marked = icon.slice(icon.indexOf('if (markNew) {'), icon.indexOf('\n\n  return ('));
  assert.ok(marked.includes('</NewFeatureBadge>'), 'the marked branch was not found whole');
  assert.doesNotMatch(marked, /untestedCount|badgeText|styles\.badge/u, 'no count inside the marked branch');
  // Zero cards still draws nothing at all, marker or not.
  assert.match(icon, /if \(cardCount === 0\) return null;/u);
  assert.ok(icon.indexOf('if (cardCount === 0)') < icon.indexOf('if (markNew)'));

  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  assert.match(wordList, /markNew=\{showTestMarker\}/u);
});

test('the Notification marker waits for the first test to have been left', () => {
  const app = read('App.tsx');
  const markers = read('src/features/onboarding/featureDiscovery.ts');

  // The sequence's one extra condition, stated once, in the rule module.
  assert.match(
    markers,
    /export function shouldShowNotificationMarker[\s\S]{0,400}?if \(!input\.seen\.has\(FEATURE_MARKERS\.firstTestExited\)\) return false;/u,
  );
  // The milestone is "opened once, not open now" — which is also true on the
  // launch after a force-quit inside that first session.
  assert.match(
    markers,
    /export function hasExitedFirstTest\(seen: ReadonlySet<string>, isTestModeOpen: boolean\): boolean \{\s*return !isTestModeOpen && seen\.has\(FEATURE_MARKERS\.testIcon\);\s*\}/u,
  );

  // Recorded from that condition, not from a close handler, and idempotently.
  assert.match(
    app,
    /if \(!hasExitedFirstTest\(discovery\.seen, testModeVisible\)\) return;\s*discovery\.dismiss\(FEATURE_MARKERS\.firstTestExited\);/u,
  );
  // Both header rules are resolved in App and handed down as booleans.
  assert.match(app, /const showTestMarker = shouldShowTestMarker\(\{ plan, isSubscriptionLoaded, seen: discovery\.seen \}\);/u);
  assert.match(app, /const showNotificationMarker = shouldShowNotificationMarker\(\{/u);
  assert.match(app, /showTestMarker=\{showTestMarker\}\s*showNotificationMarker=\{showNotificationMarker\}/u);

  // Each icon's tap opens what it always opened, and spends its own marker.
  assert.match(
    app,
    /onOpenNotifications: \(\) => \{\s*discovery\.dismiss\(FEATURE_MARKERS\.notificationIcon\);\s*setNotificationModalVisible\(true\);\s*\}/u,
  );

  // The Notification icon carries the marker on the icon itself.
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  assert.match(
    wordList,
    /visible=\{showNotificationMarker\}[\s\S]{0,220}name=\{notificationsEnabled \? 'notifications' : 'notifications-off-outline'\}[\s\S]{0,120}<\/NewFeatureBadge>/u,
  );
});

test('8 & 26. markers are independent of consent and grant nothing', () => {
  const settings = read('src/components/SettingsModal.tsx');
  // Opening About AI Voice dismisses its marker and opens a dialog — it does
  // not grant consent, and the dialog only ever withdraws.
  assert.doesNotMatch(settings, /dismiss\(FEATURE_MARKERS\.aboutAIVoice\)[\s\S]{0,200}setAIConsent\('granted'\)/u);
  assert.doesNotMatch(read('src/components/AboutAIVoiceDialog.tsx'), /'granted'\)/u);

  // Dismissing a marker only ever writes to the discovery set.
  const discovery = read('src/hooks/useFeatureDiscovery.ts');
  assert.match(discovery, /AsyncStorage\.setItem\(FEATURE_DISCOVERY_KEY/u);
  assert.doesNotMatch(discovery, /setAIConsent|requireAI|Purchases/u);

  // And the marker module cannot reach the network or the consent store.
  const markers = read('src/features/onboarding/featureDiscovery.ts');
  assert.doesNotMatch(markers, /fetch\(|aiConsent|requireAIEntitlement/u);
  // Its plan rule comes from the shared entitlement config.
  assert.match(markers, /import \{ planCanUseAI \} from '\.\.\/\.\.\/lib\/aiEntitlement';/u);
});

test('25. the free promotional preview still needs no consent', () => {
  const sheet = read('src/components/ProSheet.tsx');
  assert.doesNotMatch(sheet, /ensureAIConsentForUserAction/u);
  assert.match(read('src/lib/api/client.ts'), /export async function postPromoSpeech/u);
});
