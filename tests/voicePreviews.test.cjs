const assert = require('node:assert/strict');
const fs = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const APP_SAMPLES = 'src/lib/promoVoiceSamples.ts';
const WORKER_CONFIG = 'cloudflare/wordping-api/src/config.ts';

// ── The promotional samples ──────────────────────────────────────────────────

test('the promo samples include the ordered Upgrade sheet examples', () => {
  const samples = read(APP_SAMPLES);
  assert.match(samples, /export const PROMO_SAMPLE_IDS = \['spontaneous', 'vertical', 'merely', 'morning_light'\] as const;/u);
  // The original copy is unchanged and the two inserted words are in order.
  assert.match(samples, /en: 'Spontaneous',/u);
  assert.match(samples, /vertical: \{[\s\S]*?en: 'Vertical',/u);
  assert.match(samples, /merely: \{[\s\S]*?en: 'Merely',/u);
  assert.match(samples, /en: 'The morning light filtered through the trees\.',/u);
  // Japanese keeps the original wording and localizes the new meanings.
  assert.match(samples, /ja: '自発的',/u);
  assert.match(samples, /vertical: \{[\s\S]*?ja: '垂直の',/u);
  assert.match(samples, /merely: \{[\s\S]*?ja: '単に',/u);
  assert.match(samples, /ja: '朝の光が木々の間から差し込んでいた。',/u);
});

test('all four Upgrade AI controls map to the four allowlisted promo ids', () => {
  const sheet = read('src/components/ProSheet.tsx');
  const mapping = sheet.slice(
    sheet.indexOf('const PROMO_SAMPLE_BY_DEMO'),
    sheet.indexOf('function demoTextForKey'),
  );
  const expected = {
    spontaneous_ai: 'spontaneous',
    vertical_ai: 'vertical',
    merely_ai: 'merely',
    sentence_ai: 'morning_light',
  };
  for (const [control, sample] of Object.entries(expected)) {
    assert.match(mapping, new RegExp(`\\b${control}: '${sample}'`, 'u'));
  }
  assert.equal((mapping.match(/^  \w+_ai:/gmu) ?? []).length, 4);

  const handler = sheet.slice(
    sheet.indexOf('const handlePlayDemo'),
    sheet.indexOf('const handleSubscribeBasic'),
  );
  assert.match(handler, /const sample = PROMO_SAMPLE_BY_DEMO\[key as AIDemoKey\];/u);
  assert.match(handler, /await speakPromoSample\(sample, resolvedSampleLang, \{/u);
});

test('all four Korean promo clips have ko-specific bundle paths', () => {
  const audio = read('src/lib/promoVoiceAudio.ts');
  const korean = audio.slice(audio.indexOf('  ko: {'), audio.indexOf('  zh: {'));
  for (const sample of ['spontaneous', 'vertical', 'merely', 'morning_light']) {
    assert.match(korean, new RegExp(`${sample}: require\\('../../assets/promo-voice/ko/${sample}\\.mp3'\\)`, 'u'));
  }
});

test('identical vertical spellings have distinct bundled asset paths', () => {
  const audio = read('src/lib/promoVoiceAudio.ts');
  for (const lang of ['en', 'es', 'fr']) {
    const blockStart = audio.indexOf(`  ${lang}: {`);
    const block = audio.slice(blockStart, audio.indexOf('  },', blockStart));
    assert.match(block, new RegExp(`vertical: require\\('../../assets/promo-voice/${lang}/vertical\\.mp3'\\)`, 'u'));
  }
});

test('the bundle generator keeps identical text separate by language', async () => {
  const generator = await import(pathToFileURL(resolve('scripts/generate-promo-voice.mjs')).href);
  const instructions = JSON.parse(read('cloudflare/wordping-api/src/promoVoicePronunciation.json'));
  const samples = ['spontaneous', 'vertical', 'merely', 'morning_light'];
  const table = Object.fromEntries(samples.map(sample => [sample, {
    en: sample === 'vertical' ? 'Vertical' : `${sample}-en`,
    es: sample === 'vertical' ? 'Vertical' : `${sample}-es`,
    fr: sample === 'vertical' ? 'Vertical' : `${sample}-fr`,
  }]));

  const plan = generator.buildPromoGenerationPlan(table, instructions, ['en', 'es', 'fr']);
  const vertical = plan.filter(item => item.sample === 'vertical');
  assert.deepEqual(vertical.map(item => item.lang), ['en', 'es', 'fr']);
  assert.deepEqual(vertical.map(item => item.text), ['Vertical', 'Vertical', 'Vertical']);
  assert.equal(new Set(vertical.map(item => item.path)).size, 3);
  assert.equal(new Set(vertical.map(item => item.instructions)).size, 3);
  for (const item of plan) {
    const request = generator.promoSpeechRequestBody(item.text, item.instructions);
    assert.equal(request.input, item.text, 'the instruction must not alter audible text');
    assert.equal(request.instructions, instructions[item.lang]);
  }
});

test('the Upgrade sheet renders its demo text from the shared table', () => {
  const sheet = read('src/components/ProSheet.tsx');
  assert.match(sheet, /import \{ PROMO_SAMPLE_TEXT, type PromoSampleId \} from '\.\.\/lib\/promoVoiceSamples';/u);
  assert.match(sheet, /PROMO_SAMPLE_TEXT\.spontaneous\[lang\] as string/u);
  assert.match(sheet, /PROMO_SAMPLE_TEXT\.vertical\[lang\] as string/u);
  assert.match(sheet, /PROMO_SAMPLE_TEXT\.merely\[lang\] as string/u);
  assert.match(sheet, /PROMO_SAMPLE_TEXT\.morning_light\[lang\] as string/u);
  // No second copy of the sentences left behind in the component.
  assert.doesNotMatch(sheet, /The morning light filtered through the trees/u);
});

test('the app and the Worker speak exactly the same words', () => {
  // Audio that does not match the text on screen is worse than no preview, so
  // the two tables are compared entry by entry.
  function table(source) {
    const start = source.indexOf('PROMO_SAMPLE_TEXT');
    const body = source.slice(start, source.indexOf('\n};', start));
    const out = {};
    let sample = null;
    for (const line of body.split('\n')) {
      const head = line.match(/^\s{2}(spontaneous|vertical|merely|morning_light): \{/u);
      if (head) { sample = head[1]; out[sample] = {}; continue; }
      const entry = line.match(/^\s{4}([a-z]{2}): '(.*)',$/u);
      if (entry && sample) out[sample][entry[1]] = entry[2];
    }
    return out;
  }

  const app = table(read(APP_SAMPLES));
  const worker = table(read(WORKER_CONFIG));

  assert.deepEqual(Object.keys(app).sort(), ['merely', 'morning_light', 'spontaneous', 'vertical']);
  assert.deepEqual(app, worker, 'promo sample text has drifted between app and Worker');
  // Both cover every language the sheet can display.
  assert.equal(Object.keys(app.spontaneous).length, 20);
  assert.equal(Object.keys(app.vertical).length, 20);
  assert.equal(Object.keys(app.merely).length, 20);
  assert.equal(Object.keys(app.morning_light).length, 20);

  // And the cache version is bumped together, or a stale clip would be served.
  const appVersion = read(APP_SAMPLES).match(/PROMO_SAMPLE_VERSION = '([^']+)'/u)[1];
  const workerVersion = read(WORKER_CONFIG).match(/PROMO_SAMPLE_VERSION = '([^']+)'/u)[1];
  assert.equal(appVersion, workerVersion);
});

test('bundled audio is bypassed whenever generation has not stamped the current version', () => {
  const audio = read('src/lib/promoVoiceAudio.ts');
  assert.match(audio, /export const PROMO_SAMPLE_AUDIO_VERSION: string = '[^']+';/u);
  assert.match(audio, /if \(PROMO_SAMPLE_AUDIO_VERSION !== PROMO_SAMPLE_VERSION\) return null;/u);
  assert.match(audio, /if \(PROMO_SAMPLE_AUDIO_VERSION !== PROMO_SAMPLE_VERSION\) return \[\];/u);

  const generator = read('scripts/generate-promo-voice.mjs');
  assert.match(generator, /export const PROMO_SAMPLE_AUDIO_VERSION: string = '\$\{version\}';/u);
  assert.match(generator, /writeAudioMap\(produced, version\)/u);
});

// ── Free access, without weakening the paid routes ───────────────────────────

test('the promo route is the only free feature, and it is free by config', () => {
  const config = read(WORKER_CONFIG);
  assert.match(config, /voice_promo: 'free',/u);
  // Every other route still demands an entitlement. The AI Voice routes admit
  // Basic, whose one-time credits then decide; the picker preview moves with
  // the feature it previews. Free reaches neither.
  assert.match(config, /voice_card: 'basic',/u);
  assert.match(config, /voice_sample: 'basic',/u);
  assert.match(config, /voice_custom: 'premium',/u);
  for (const feature of ['meaning', 'breakdown', 'translation', 'example']) {
    assert.match(config, new RegExp(`${feature}: 'premium',`, 'u'));
  }
  assert.equal((config.match(/: 'free',/gu) ?? []).length, 1, 'exactly one free feature');
});

test('the free branch skips only entitlement, never the limits', () => {
  const pipeline = read('cloudflare/wordping-api/src/pipeline.ts');
  // Keyed on a server-side constant, not on anything in the request.
  // The trailing `null` is the voice-credit ledger id: a free route has none,
  // which is the same statement as "spends nothing", made explicit at the call.
  assert.match(pipeline, /if \(requiredTier === 'free'\) \{\s*return approve\(context, spec, parsed\.data, 'free', identity, null\);/u);
  // No client-controlled bypass of any kind.
  assert.doesNotMatch(pipeline, /skipEntitlement|body\.preview|isPreview|body\.free/u);
  // The protective half is shared, so it cannot be skipped with the lookup.
  const approve = pipeline.slice(pipeline.indexOf('async function approve<T>'));
  assert.match(approve, /maxCharsPerRequest/u);
  assert.match(approve, /const decision = await consume\(/u);
  assert.match(approve, /reserveMonthlyQuota\(/u);
});

test('a free preview cannot carry text or choose a voice', () => {
  const schemas = read('cloudflare/wordping-api/src/schemas.ts');
  const promo = schemas.slice(
    schemas.indexOf('export const voicePromoSchema'),
    schemas.indexOf('export type VoicePromoRequest'),
  );
  assert.match(promo, /sample: z\.enum\(PROMO_SAMPLE_IDS\),/u);
  assert.doesNotMatch(promo, /text:/u);
  assert.doesNotMatch(promo, /voice:/u);
  assert.doesNotMatch(promo, /instructions:/u);
  assert.doesNotMatch(promo, /format:/u);

  // The route speaks a server-resolved sentence in a server-fixed voice.
  const voice = read('cloudflare/wordping-api/src/routes/voice.ts');
  const handler = voice.slice(
    voice.indexOf('export async function handleVoicePromo'),
    voice.indexOf('/** POST /v1/voice/custom'),
  );
  assert.match(handler, /const text = promoSampleText\(sample, lang\);/u);
  assert.match(handler, /voice: PROMO_SAMPLE_VOICE,/u);
  assert.doesNotMatch(handler, /body\.text|body\.voice/u);

  // And the client never puts text in the body either. The promo body is now
  // built inside `postPromoSpeech`, from arguments it validates itself, so no
  // caller-assembled object can reach the route.
  const client = read('src/lib/api/client.ts');
  const promoFn = client.slice(client.indexOf('export async function postPromoSpeech'));
  assert.match(promoFn, /if \(!isPromoSampleId\(sample\)\) \{/u);
  assert.match(
    promoFn,
    /\{\s*sample,\s*\.\.\.\(langCode !== undefined \? \{ langCode \} : \{\}\),\s*\.\.\.\(sampleVersion !== undefined \? \{ sampleVersion \} : \{\}\),\s*\}/u,
  );
  assert.doesNotMatch(promoFn, /\btext\b|\bvoice\b|\binstructions\b/u);

  const gateway = read('src/lib/openaiGateway.ts');
  assert.match(gateway, /result = await postPromoSpeech\(\s*promo!\.sample,\s*promo!\.langCode,/u);
});

test('an unapproved sample id is rejected by the schema', () => {
  const config = read(WORKER_CONFIG);
  assert.match(config, /const PROMO_SAMPLE_ID_SET: ReadonlySet<string> = new Set\(PROMO_SAMPLE_IDS\);/u);
  // z.enum over the fixed allowlist: anything else fails validation before
  // entitlement, rate limiting or OpenAI is reached.
  assert.match(read('cloudflare/wordping-api/src/schemas.ts'), /z\.enum\(PROMO_SAMPLE_IDS\)/u);
  // langCode only selects a row; an unknown value falls back to English. The
  // membership test moved to a prebuilt set, and the length cap ahead of it
  // means an oversized tag is never even looked up.
  assert.match(config, /export function resolvePromoLang\(langCode: unknown\): PromoSampleLang \{/u);
  assert.match(config, /if \(typeof langCode !== 'string' \|\| langCode\.length > MAX_LANG_CODE_LENGTH\) return 'en';/u);
  assert.match(config, /return PROMO_SAMPLE_LANG_SET\.has\(base\) \? base as PromoSampleLang : 'en';/u);
});

test('promo playback spends neither a monthly allowance nor a lifetime credit', () => {
  const limits = read('cloudflare/wordping-api/src/planLimits.ts');
  assert.match(limits, /export const VOICE_QUOTA_FEATURES: readonly Feature\[\] = \[\];/u);
  assert.doesNotMatch(limits, /VOICE_QUOTA_FEATURES[^;]*voice_sample/u);
  assert.doesNotMatch(limits, /voice_promo/u);

  // The credit ledger meters word-card generation and nothing else.
  const credits = read('cloudflare/wordping-api/src/lifetimeCredits.ts');
  assert.match(credits, /export const LIFETIME_CREDIT_FEATURES = \['voice_card'\] as const;/u);
  assert.doesNotMatch(credits, /LIFETIME_CREDIT_FEATURES[^;]*voice_promo/u);
});

test('the promo route stays rate limited and cached', () => {
  const config = read(WORKER_CONFIG);
  const block = config.slice(config.indexOf('  voice_promo: {'), config.indexOf('  voice_custom: {'));
  assert.match(block, /maxRequestsPerMinute: 6/u);
  assert.match(block, /maxRequestsPerDay: 30/u);

  const voice = read('cloudflare/wordping-api/src/routes/voice.ts');
  const handler = voice.slice(voice.indexOf('export async function handleVoicePromo'));
  // Shared KV cache: repeated playback across all users costs nothing upstream.
  assert.match(handler, /const cacheKey = `promo:\$\{PROMO_SAMPLE_VERSION\}:\$\{sample\}:\$\{lang\}\.wav`;/u);
  assert.match(handler, /WORDPING_KV\s*\.get\(cacheKey, 'arrayBuffer'\)/u);
  assert.match(handler, /'X-WordPing-Cache': 'hit'/u);
  assert.match(handler, /\.put\(cacheKey, toCache, \{ expirationTtl: PROMO_SAMPLE_CACHE_TTL_SECONDS \}\)/u);
});

// ── Client behaviour ─────────────────────────────────────────────────────────

test('the Upgrade sheet plays previews without consulting the plan', () => {
  const sheet = read('src/components/ProSheet.tsx');
  const handler = sheet.slice(
    sheet.indexOf('const handlePlayDemo'),
    sheet.indexOf('const handleSubscribeBasic'),
  );
  assert.match(handler, /await speakPromoSample\(sample, resolvedSampleLang, \{/u);
  // No plan check anywhere on the preview path — Free, Basic, Premium and the
  // still-loading state all reach the same call.
  assert.doesNotMatch(handler, /isSubscribed|isPremium|isSubscriptionLoaded|plan ===/u);
  assert.doesNotMatch(handler, /ensureAIConsentForUserAction|previewAIVoice|speakWithAI|requestAISpeech|postSpeech/u);
  // The old bug: speak(text, true, ...) sent a Free user to /v1/voice/card.
  assert.doesNotMatch(handler, /speak\([^)]*true/u);
});

test('both Upgrade sheet instances use the same consent-free ProSheet implementation', () => {
  const appModals = read('src/app/AppModals.tsx');
  const settings = read('src/components/SettingsModal.tsx');
  assert.match(appModals, /<ProSheet[\s\S]*?sampleLanguage=\{proSheet\.sampleLanguage\}/u);
  assert.match(settings, /<ProSheet[\s\S]*?sampleLanguage=\{sampleLanguage\}/u);
  assert.doesNotMatch(read('src/components/ProSheet.tsx'), /ensureAIConsentForUserAction/u);
});

test('previews reuse the on-device cache without entering normal speakWithAI', () => {
  const tts = read('src/lib/tts.ts');
  const promoPlayback = tts.slice(
    tts.indexOf('function speakFixedPromoNetwork('),
    tts.indexOf('/** Play a one-off subscriber preview'),
  );
  assert.match(promoPlayback, /return speakFetchedAudio\(\s*promoSampleText\(sample, lang\),/u);
  assert.match(promoPlayback, /PROMO_SAMPLE_VERSION,\s*\{ sample, langCode: lang \},\s*lang,/u);
  assert.doesNotMatch(promoPlayback, /\bspeakWithAI\(|previewAIVoice|speech_sample|speech_card/u);

  // The persistent cache and in-flight registry retain the language and promo
  // version even when different languages use the same visible spelling.
  assert.match(tts, /normalizeTTSRequest\(promoSampleText\(sample, lang\), PROMO_PREVIEW_VOICE, PROMO_SAMPLE_VERSION, lang\)/u);
  assert.match(tts, /const key = promoCacheKey\(sample, lang\);\s*if \(promoPreloadByKey\.has\(key\)\) continue;/u);
  assert.match(tts, /const pending = networkRequests\.run\(key,/u);
  assert.match(tts, /options\.promo \? 'speech_promo' :/u);
  // A fixed voice, so the cached clip is the same one the Worker cached.
  assert.match(tts, /const PROMO_PREVIEW_VOICE: AIVoice = DEFAULT_AI_VOICE;/u);
});

test('a missing or failed localized bundle falls back only through fixed promo', () => {
  const audio = read('src/lib/promoVoiceAudio.ts');
  const lookup = audio.slice(audio.indexOf('export function bundledPromoAudio('));
  assert.match(lookup, /return PROMO_SAMPLE_AUDIO\[lang\]\?\.\[sample\] \?\? null;/u);
  assert.doesNotMatch(lookup, /PROMO_SAMPLE_AUDIO\.en/u, 'a missing Korean clip must not become English');

  const tts = read('src/lib/tts.ts');
  // The end marker is asserted, not assumed: it used to be the single-line
  // comment '/** Play a bundled promotional clip', which was reflowed to a
  // block. `indexOf` then returned -1, the slice silently became the rest of
  // the file, and the check below started reading unrelated functions.
  const preloadEnd = tts.indexOf('Play a bundled promotional clip');
  assert.ok(preloadEnd > -1, 'the promo playback section still marks the end of the preload path');
  const preload = tts.slice(tts.indexOf('export function preloadPromoVoiceSamples('), preloadEnd);
  assert.match(preload, /Asset\.loadAsync\([\s\S]*?\.catch\(\(\) => \{\s*preloadNetworkPromoVoiceSamples\(lang\);/u);
  assert.match(preload, /promo: \{ sample, langCode: lang \}/u);
  assert.doesNotMatch(preload, /syncAIVoiceSamplePreloading|getAIVoiceSample|previewAIVoice|speech_sample/u);

  const playback = tts.slice(
    tts.indexOf('export function speakPromoSample('),
    tts.indexOf('/** Stop any active playback'),
  );
  assert.match(playback, /speakBundledPromo\([\s\S]*?\.catch\(error => \{[\s\S]*?return speakFixedPromoNetwork\(sample, lang, options\);/u);
  assert.match(playback, /no bundled clip[\s\S]*?return speakFixedPromoNetwork\(sample, lang, options\);/u);
  assert.doesNotMatch(playback, /\bspeakWithAI\(|previewAIVoice|postSpeech|speech_sample|speech_card/u);
});

test('the network fallback remains structurally isolated as fixed-promo', () => {
  const tts = read('src/lib/tts.ts');
  const cacheFetch = tts.slice(
    tts.indexOf('async function fetchAndCacheAudio('),
    tts.indexOf('export interface AIPronunciationPreloadOptions'),
  );
  assert.match(cacheFetch, /options\.promo \? 'speech_promo' : request\.contentVersion \? 'speech_sample' : 'speech'/u);

  const gateway = read('src/lib/openaiGateway.ts');
  const request = gateway.slice(gateway.indexOf('export async function requestAISpeech('));
  assert.match(request, /if \(action === 'speech_promo'\) \{\s*result = await postPromoSpeech\(/u);
  const endpointsAt = gateway.indexOf('const VOICE_ENDPOINTS');
  const endpoints = gateway.slice(gateway.indexOf('{', endpointsAt), gateway.indexOf('};', endpointsAt));
  assert.doesNotMatch(endpoints, /speech_promo|promo/u);

  const client = read('src/lib/api/client.ts');
  assert.match(client, /const PROMO_PATH = '\/v1\/voice\/promo';/u);
  const post = client.slice(client.indexOf('async function post('), client.indexOf('// ── Endpoints'));
  assert.match(post, /if \(kind === 'user-content'\) \{\s*requireAIEntitlement\(\);\s*await requireAIConsent\(\);\s*\}/u);
  assert.match(post, /const identity = kind !== 'fixed-promo' \? await getIdentity\(\) : null;/u);
  assert.doesNotMatch(post, /skipConsent|consent_required[\s\S]*?retry/u);

  const promo = client.slice(client.indexOf('export async function postPromoSpeech('));
  assert.match(promo, /const response = await post\(\s*PROMO_PATH,[\s\S]*?'fixed-promo',\s*\);/u);
  assert.doesNotMatch(promo, /\btext\b|\bvoice\b|requireAIConsent|getIdentity/u);
});

test('ordinary voice playback remains consent gated and promo cannot mark a purchase prompt', () => {
  const voices = read('src/lib/aiVoices.ts');
  assert.match(voices, /export const AI_VOICES = \[\s*'marin',\s*'cedar',\s*\] as const;/u);

  const settings = read('src/components/SettingsModal.tsx');
  // The picker's play buttons run through the shared flow, and the flow is
  // handed the same consent call the Word List makes — not a copy of it, and
  // not a second dialog of its own.
  const pickerFlow = settings.slice(
    settings.indexOf('const previewFlowRef = useRef'),
    settings.indexOf('const close = useCallback'),
  );
  assert.match(pickerFlow, /ensureConsent: \(\) => ensureAIConsentForUserAction\(\),/u);
  assert.match(pickerFlow, /play: \(voice, report\) => previewAIVoice\(voice, \{ onPhaseChange: report \}\),/u);
  assert.match(settings, /\{AI_VOICES\.map\(voice => \{[\s\S]*?onPress=\{\(\) => preview\(voice\)\}/u);

  // And the flow asks before it plays, in that order, with nothing generated
  // for any answer other than an explicit grant.
  const flow = read('src/features/voice/voicePreviewFlow.ts');
  assert.match(
    flow,
    /const granted = await options\.ensureConsent\(\);[\s\S]*?if \(!granted\) return 'consent_refused';[\s\S]*?await options\.play\(voice,/u,
  );

  const card = read('src/hooks/useWordCardVoicePlayback.ts');
  assert.match(card, /if \(usesAI && !await ensureAIConsentForUserAction\(\)\) return;/u);

  const sheetHandler = read('src/components/ProSheet.tsx').slice(
    read('src/components/ProSheet.tsx').indexOf('const handlePlayDemo'),
    read('src/components/ProSheet.tsx').indexOf('const handleSubscribeBasic'),
  );
  assert.doesNotMatch(sheetHandler, /SUBSCRIPTION_CONSENT_PROMPT_KEY|setConsentPromptShown|entitlementSource|after-purchase-refresh/u);

  const app = read('App.tsx');
  assert.match(app, /entitlementSource,[\s\S]*?consentPromptShown,[\s\S]*?isUpgradeSheetClosed: !upgradeSheetVisible/u);
  assert.match(app, /AsyncStorage\.setItem\(SUBSCRIPTION_CONSENT_PROMPT_KEY, serializeConsentPromptShown\(true\)\)/u);
});

test('each sample has its own loading state and starting one stops the other', () => {
  const sheet = read('src/components/ProSheet.tsx');
  assert.match(sheet, /const \[loadingDemo, setLoadingDemo\] = useState<DemoKey \| null>\(null\);/u);
  // Only a real network fetch shows the spinner.
  assert.match(sheet, /setLoadingDemo\(phase === 'generating-or-downloading' \? key : null\)/u);
  assert.match(sheet, /accessibilityState=\{\{ busy: aiLoading, selected: aiPlaying \}\}/u);
  assert.match(sheet, /\{aiLoading \? \(\s*<ActivityIndicator/u);

  // Tapping the playing sample stops it; starting another supersedes it.
  const handler = sheet.slice(sheet.indexOf('const handlePlayDemo'));
  assert.match(handler, /if \(playingDemo === key\) \{[\s\S]{0,200}stopPlayback\(\);/u);
  assert.match(handler, /const sequence = \+\+demoSequence\.current;\s*stopPlayback\(\);/u);
});

test('a promo failure names its cause instead of collapsing into one line', () => {
  const sheet = read('src/components/ProSheet.tsx');
  // Branching on `kind`, like every other AI surface. Offline and a missing
  // base URL are the two with a real cause, and both used to read as an outage.
  assert.match(sheet, /case 'offline':\s*return 'err_offline';/u);
  assert.match(sheet, /case 'not_configured': return 'err_service_not_configured';/u);
  assert.match(sheet, /serverCode === 'api_not_configured'/u);
  // A genuine outage still says the preview is unavailable.
  assert.match(sheet, /isAI \? 'promo_preview_unavailable' : 'err_generation_failed'/u);
});

test('word-card AI voice is still gated by capability, never by the promo route', () => {
  // The preview route is additive: nothing about the paid path changed.
  const tts = read('src/lib/tts.ts');
  // The engine is chosen by the AI Voice *capability*, not by "is subscribed" —
  // which is what puts Free on the device engine, and anyone who chose the free
  // voice after their credits ran out.
  assert.match(tts, /export function speak\(\s*text: string,\s*canUseAIVoice: boolean,/u);
  assert.match(tts, /if \(canUseAIVoice\) \{\s*return speakWithAI\(text, activeAIVoice, options, undefined, forcedLocale\);\s*\}/u);
  assert.match(tts, /return speakFree\(text, forcedLocale \?\? detectLocale\(text\), options\);/u);
  assert.doesNotMatch(tts, /\bisPro\b/u);
  // And the Worker still refuses /v1/voice/card without a paid entitlement:
  // the promo route grants nothing here, and Free reaches neither.
  assert.match(read(WORKER_CONFIG), /voice_card: 'basic',/u);
  assert.doesNotMatch(read(WORKER_CONFIG), /voice_card: 'free',/u);
  assert.match(
    read('cloudflare/wordping-api/src/pipeline.ts'),
    /if \(!tierSatisfies\(tier, requiredTier\)\) \{\s*return reject\('subscription_required', 403/u,
  );
});
