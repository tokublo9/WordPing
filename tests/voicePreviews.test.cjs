const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const APP_SAMPLES = 'src/lib/promoVoiceSamples.ts';
const WORKER_CONFIG = 'cloudflare/wordping-api/src/config.ts';

// ── The two promotional samples ──────────────────────────────────────────────

test('the two promo samples are the ones the Upgrade sheet already showed', () => {
  const samples = read(APP_SAMPLES);
  assert.match(samples, /export const PROMO_SAMPLE_IDS = \['spontaneous', 'morning_light'\] as const;/u);
  // The exact English copy that was already on screen — no new voice
  // definitions and no renamed ids.
  assert.match(samples, /en: 'Spontaneous',/u);
  assert.match(samples, /en: 'The morning light filtered through the trees\.',/u);
  // Japanese keeps the wording the sheet already used.
  assert.match(samples, /ja: '自発的',/u);
  assert.match(samples, /ja: '朝の光が木々の間から差し込んでいた。',/u);
});

test('the Upgrade sheet renders its demo text from the shared table', () => {
  const sheet = read('src/components/ProSheet.tsx');
  assert.match(sheet, /import \{ PROMO_SAMPLE_TEXT, type PromoSampleId \} from '\.\.\/lib\/promoVoiceSamples';/u);
  assert.match(sheet, /PROMO_SAMPLE_TEXT\.spontaneous\[lang\] as string/u);
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
      const head = line.match(/^\s{2}(spontaneous|morning_light): \{/u);
      if (head) { sample = head[1]; out[sample] = {}; continue; }
      const entry = line.match(/^\s{4}([a-z]{2}): '(.*)',$/u);
      if (entry && sample) out[sample][entry[1]] = entry[2];
    }
    return out;
  }

  const app = table(read(APP_SAMPLES));
  const worker = table(read(WORKER_CONFIG));

  assert.deepEqual(Object.keys(app).sort(), ['morning_light', 'spontaneous']);
  assert.deepEqual(app, worker, 'promo sample text has drifted between app and Worker');
  // Both cover every language the sheet can display.
  assert.equal(Object.keys(app.spontaneous).length, 20);
  assert.equal(Object.keys(app.morning_light).length, 20);

  // And the cache version is bumped together, or a stale clip would be served.
  const appVersion = read(APP_SAMPLES).match(/PROMO_SAMPLE_VERSION = '([^']+)'/u)[1];
  const workerVersion = read(WORKER_CONFIG).match(/PROMO_SAMPLE_VERSION = '([^']+)'/u)[1];
  assert.equal(appVersion, workerVersion);
});

// ── Free access, without weakening the paid routes ───────────────────────────

test('the promo route is the only free feature, and it is free by config', () => {
  const config = read(WORKER_CONFIG);
  assert.match(config, /voice_promo: 'free',/u);
  // Every other route still demands an entitlement.
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
  assert.match(pipeline, /if \(requiredTier === 'free'\) \{\s*return approve\(context, spec, parsed\.data, 'free', identity\);/u);
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
  assert.doesNotMatch(promoFn, /\btext\b|\bvoice\b/u);

  const gateway = read('src/lib/openaiGateway.ts');
  assert.match(gateway, /result = await postPromoSpeech\(\s*promo!\.sample,\s*promo!\.langCode,/u);
});

test('an unapproved sample id is rejected by the schema', () => {
  const config = read(WORKER_CONFIG);
  assert.match(config, /const PROMO_SAMPLE_ID_SET: ReadonlySet<string> = new Set\(PROMO_SAMPLE_IDS\);/u);
  // z.enum over the two-value allowlist: anything else fails validation before
  // entitlement, rate limiting or OpenAI is reached.
  assert.match(read('cloudflare/wordping-api/src/schemas.ts'), /z\.enum\(PROMO_SAMPLE_IDS\)/u);
  // langCode only selects a row; an unknown value falls back to English.
  assert.match(config, /return PROMO_SAMPLE_TEXT\.spontaneous\[base\] !== undefined \? base : 'en';/u);
});

test('promo playback never spends the Basic monthly voice allowance', () => {
  const limits = read('cloudflare/wordping-api/src/planLimits.ts');
  assert.match(limits, /export const VOICE_QUOTA_FEATURES: readonly Feature\[\] = \['voice_card'\];/u);
  assert.doesNotMatch(limits, /VOICE_QUOTA_FEATURES[^;]*voice_sample/u);
  assert.doesNotMatch(limits, /voice_promo/u);
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
  // The old bug: speak(text, true, ...) sent a Free user to /v1/voice/card.
  assert.doesNotMatch(handler, /speak\([^)]*true/u);
});

test('previews reuse the on-device cache, so a replay makes no request', () => {
  const tts = read('src/lib/tts.ts');
  assert.match(tts, /export function speakPromoSample\(/u);
  // Same speakWithAI path as every other clip, so the persistent file cache and
  // the in-flight request registry both apply.
  assert.match(tts, /return speakWithAI\(\s*promoSampleText\(sample, lang\),\s*PROMO_PREVIEW_VOICE,/u);
  assert.match(tts, /options\.promo \? 'speech_promo' :/u);
  // A fixed voice, so the cached clip is the same one the Worker cached.
  assert.match(tts, /const PROMO_PREVIEW_VOICE: AIVoice = DEFAULT_AI_VOICE;/u);
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

test('an offline preview says so; any other failure says the preview is unavailable', () => {
  const sheet = read('src/components/ProSheet.tsx');
  assert.match(sheet, /error instanceof AIRequestError && error\.kind === 'offline'/u);
  // The AI branch gets its own copy: a fixed promo clip that will not load is a
  // preview problem, not a failed generation of the user's own content.
  assert.match(
    sheet,
    /t\(offline \? 'err_offline' : isAI \? 'promo_preview_unavailable' : 'err_generation_failed'\)/u,
  );
});

test('word-card AI voice is still gated for Free users', () => {
  // The preview route is additive: nothing about the paid path changed.
  const tts = read('src/lib/tts.ts');
  assert.match(tts, /export function speak\(\s*text: string,\s*isPro: boolean,/u);
  assert.match(tts, /if \(isPro\) return speakWithAI\(text, activeAIVoice, options\);\s*return speakFree\(/u);
  // And the Worker still refuses /v1/voice/card without an entitlement.
  assert.match(read(WORKER_CONFIG), /voice_card: 'basic',/u);
  assert.match(
    read('cloudflare/wordping-api/src/pipeline.ts'),
    /if \(!tierSatisfies\(tier, requiredTier\)\) \{\s*return reject\('subscription_required', 403/u,
  );
});
