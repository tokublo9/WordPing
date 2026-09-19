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

test('a server refusal shows the localized upgrade-or-device-voice dialog', () => {
  const errors = read('src/lib/api/errors.ts');
  const hook = read('src/hooks/useWordCardVoicePlayback.ts');
  const app = read('App.tsx');

  // The Worker's code becomes its own kind, distinct from the monthly limit and
  // from a plan boundary — the two it would otherwise be confused with.
  assert.match(errors, /voice_credits_exhausted: 'voice_credits_exhausted',/u);
  assert.match(hook, /case 'voice_credits_exhausted':/u);
  assert.match(hook, /onVoiceCreditsExhausted\(\(\) => \{ void speakOnDevice\(\); \}\)/u);
  assert.match(app, /<VoiceCreditsExhaustedDialog/u);
  assert.match(app, /onVoiceCreditsExhausted=\{handleVoiceCreditsExhausted\}/u);
  assert.match(read('src/components/VoiceCreditsExhaustedDialog.tsx'), /t\('voice_credits_body'\)/u);

  // No mirrored balance anywhere in the app.
  for (const source of [hook, read('App.tsx')]) {
    assert.doesNotMatch(source, /remainingCredits|creditsRemaining/u);
  }
});

test('the Upgrade Plan sheet stays above Word List and Test Mode layers', () => {
  const sheet = read('src/components/ProSheet.tsx');

  assert.match(sheet, /<View style=\{s\.overlayRoot\} pointerEvents="box-none">/u);
  assert.match(
    sheet,
    /overlayRoot:\s*\{\s*\.\.\.StyleSheet\.absoluteFillObject,\s*zIndex: 200,\s*elevation: 200,/u,
  );
});

test('the Basic card-limit popup offers Premium after card addition', () => {
  const app = read('App.tsx');
  assert.match(app, /queueBasicVoicePopup\('added'\)/u);
  assert.match(app, /text: t\('cmp_premium'\), onPress: \(\) => setProSheetVisible\(true\)/u);
});

test('choosing the free voice stops the dialog returning, and picking a voice restores it', () => {
  const app = read('App.tsx');
  const constants = read('src/constants.ts');

  // The preference is still a term of the capability, so no further generation
  // is even attempted — which is what makes the dialog non-repeating. The added
  // `voiceBackendReady` term only withholds while the ledger is unread; it
  // cannot re-enable generation once the preference is set.
  assert.match(app, /const canUseAIVoice = canUseAI && !preferDeviceVoice && voiceBackendReady;/u);
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
  assert.match(limits, /basic: 10,/u);
  // The comparison table must not call a one-time grant a monthly one.
  assert.match(limits, /one-time/u);
});

// ── The balance lookup holds up only the plan it belongs to ──────────────────

test('every paid tier waits for a fresh Worker entitlement', () => {
  const app = read('App.tsx');

  // Every paid CustomerInfo revision runs the force-fresh Worker route. This
  // includes purchase, restore and listener updates for Premium as well as Basic.
  assert.match(app, /if \(!isSubscriptionLoaded \|\| plan === 'free'/u);
  assert.match(app, /const balance = await fetchVoiceCreditBalance\(\);/u);
  assert.match(app, /if \(balance\.tier === plan\)/u);

  // Readiness is resolved once and shared, so playback and the library sweep
  // cannot disagree about when the server side is usable.
  assert.match(
    app,
    /const voiceBackendReady = entitlementSource === 'local-development-scenario'\s*\|\| \(plan !== 'free' && voiceCreditReadyRevision === entitlementRevision\);/u,
  );
  assert.equal(
    (app.match(/const voiceBackendReady =/gu) ?? []).length, 1,
    'one definition, read by both consumers',
  );
  assert.match(app, /const canUseAIVoice = canUseAI && !preferDeviceVoice && voiceBackendReady;/u);

  // The sweep asks the shared answer rather than re-deriving it from the
  // revision, which is what let the two drift apart in the first place.
  const sweep = app.slice(app.indexOf('const preloadedLibraryKeyRef'));
  assert.match(sweep.slice(0, sweep.indexOf('preloadAIPronunciationLibrary')), /\|\| !voiceBackendReady/u);

  // Exhaustion stays the server's answer: no local balance decides playback.
  assert.doesNotMatch(app, /remainingCredits|creditsRemaining/u);
});

test('a post-purchase voice-card 403 refreshes and retries exactly once', () => {
  const api = read('src/lib/api/client.ts');
  const subscription = read('src/hooks/useSubscription.ts');
  assert.match(subscription, /armVoiceCardEntitlementRetry\(\);/u);
  assert.match(api, /error\.kind !== 'voice_credits_exhausted' \|\| !takeVoiceCardEntitlementRetry\(\)/u);
  assert.match(api, /await fetchVoiceCreditBalance\(\);\s*response = await post\(VOICE_PATHS\[endpoint\]/u);
  assert.equal((api.match(/takeVoiceCardEntitlementRetry\(\)/gu) ?? []).length, 2,
    'one declaration and one guarded retry use');
});

test('the development identity refresh retries without creating an anonymous user', () => {
  const subscription = read('src/hooks/useSubscription.ts');
  assert.match(subscription, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/u);
  assert.match(subscription, /await Purchases\.logIn\(appUserID\)/u);
  assert.doesNotMatch(subscription, /Purchases\.logOut\(/u);
  assert.match(subscription, /console\.error\('\[useSubscription\] stable RevenueCat logIn failed after retry; identity was not changed:'/u);
  assert.ok(subscription.indexOf('resetApiIdentity();') > subscription.indexOf('if (lastError !== null) throw lastError;'),
    'the cached identity is cleared only after the stable login succeeds');
});

test('an Upgrade Plan preview is independent of the credit ledger', () => {
  const sheet = read('src/components/ProSheet.tsx');
  const play = sheet.slice(sheet.indexOf('const handlePlayDemo'), sheet.indexOf('const handleSubscribeBasic'));

  // The promo route carries no identity and no entitlement, so a balance that
  // failed to initialize has nothing to say about it.
  assert.doesNotMatch(play, /canUseAIVoice|voiceBackendReady|voiceCredit/u);
  assert.match(play, /await speakPromoSample\(sample, resolvedSampleLang, \{/u);
  // A failed preview never becomes a device-voice playback pretending to be AI.
  assert.doesNotMatch(play, /speakFree|speakOnDevice/u);
});

test('production alerts carry the friendly line only', () => {
  const sheet = read('src/components/ProSheet.tsx');

  // Every raw diagnostic is behind __DEV__, so a release bundle strips it and
  // no user is shown an error kind, a server code, a status or a request id.
  assert.match(sheet, /function promoFailureDiagnostics\(error: unknown\): string \{\s*if \(!__DEV__\) return '';/u);
  assert.match(sheet, /if \(__DEV__ && isAI\) \{/u);
  for (const field of ['kind: \\$\\{error\\.kind\\}', 'serverCode', 'status', 'requestId']) {
    const at = sheet.search(new RegExp(field, 'u'));
    assert.ok(at > sheet.indexOf('function promoFailureDiagnostics'), `${field} stays in the dev-only helper`);
  }
  // The alert body is a translated key plus that dev-only suffix, never a code.
  assert.match(sheet, /t\(promoFailureMessageKey\(error, isAI\)\) \+ promoFailureDiagnostics\(error\)/u);
});

// ── Audio already paid for stays playable ────────────────────────────────────

test('an exhausted Basic user still hears AI audio already on the device', () => {
  const tts = read('src/lib/tts.ts');

  // The lookup stops at the last cache tier — before the network hook and
  // before anything that could reserve or spend a credit.
  const fetchFn = tts.slice(tts.indexOf('async function fetchAndCacheAudio'));
  const rejectAt = fetchFn.indexOf('AI_CACHE_ONLY_MISS');
  const networkAt = fetchFn.indexOf('options.onNetworkRequired?.()');
  const requestAt = fetchFn.indexOf('requestAISpeech(');
  assert.ok(rejectAt > 0 && rejectAt < networkAt && rejectAt < requestAt,
    'cache-only stops before any network work');

  // It reuses the one lookup rather than re-deriving a key: same normalized
  // request, same cache key, same file validation for text, language, voice
  // and content version.
  assert.match(tts, /const cached = await fetchAndCacheAudio\(text, activeAIVoice, \{\s*cacheOnly: true,\s*language: forcedLocale,\s*\}\)/u);
  // Bounded to the function itself. Unbounded, this ran to the end of the file
  // and saw every later helper, so it could never have failed for the right
  // reason — or passed for one.
  const cachedAt = tts.indexOf('async function speakCachedAIOrDevice');
  assert.ok(cachedAt > -1, 'the cache-only playback path exists');
  const rest = tts.slice(cachedAt);
  const nextDecl = rest.slice(10).search(/\n(export )?(async )?function |\n(export )?const /u);
  assert.ok(nextDecl > -1, 'and something follows it, so the slice is bounded');
  assert.doesNotMatch(
    rest.slice(0, nextDecl + 10),
    /serializeTTSCacheKey|normalizeTTSRequest|ttsCacheFile/u,
    'no second cache-key derivation',
  );
});

test('entitlement, not the cache, decides who may reach paid audio', () => {
  const tts = read('src/lib/tts.ts');

  // Free — and any launch before RevenueCat answers — is refused: the snapshot
  // requires isSubscriptionLoaded && planCanUseAI, so an ineligible device
  // cannot play a former subscription's cached audio.
  assert.match(tts, /if \(options\?\.allowCachedAIFallback && isAIEntitlementEligible\(\)\) \{\s*return speakCachedAIOrDevice\(text, forcedLocale, options\);/u);
  assert.match(tts, /import \{ isAIEntitlementEligible \} from '\.\/aiEntitlement';/u);

  // Opt-in per call. The Upgrade Plan sheet's device-voice demo must keep
  // speaking through the device engine for a subscriber, or the comparison it
  // exists to draw would play AI audio on both sides.
  assert.match(read('src/hooks/useWordCardVoicePlayback.ts'), /allowCachedAIFallback: cardCanUseAI,/u);
  const sheet = read('src/components/ProSheet.tsx');
  assert.doesNotMatch(sheet, /allowCachedAIFallback/u);
  assert.match(sheet, /await speak\(demoTextForKey\(demo, key\), false, resolvedSampleLang\);/u);
});

test('exactly one engine owns the playback epoch, so a second tap still stops', () => {
  const tts = read('src/lib/tts.ts');
  const fn = tts.slice(
    tts.indexOf('async function speakCachedAIOrDevice'),
    tts.indexOf('/** Update the voice used by every subsequent subscriber AI playback request. */'),
  );
  // Code only — the comments here explain the epoch rule and naturally name it.
  const code = fn.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

  // The probe claims nothing. `beginPlayback` reads a repeat of the current key
  // as "stop"; probing from inside speakWithAI would leave the device engine
  // holding one key while the next tap arrived under another, restarting the
  // word instead of silencing it.
  assert.doesNotMatch(code, /beginPlayback|finishPlayback|claimAudioFocus/u);
  assert.ok(
    fn.indexOf('fetchAndCacheAudio') < fn.indexOf('speakWithAI'),
    'the cache is asked before any engine starts',
  );
  // A stop landing during the probe is honoured rather than overridden.
  assert.match(fn, /const epochBeforeProbe = epoch;/u);
  assert.match(fn, /if \(epoch !== epochBeforeProbe\) return;/u);

  // A miss is not a failure: no 'failed' phase, and no idle blink on the way
  // into the device engine.
  assert.match(tts, /if \(isAICacheOnlyMiss\(error\)\) \{\s*cacheOnlyMissed = true;\s*throw error;\s*\}/u);
  assert.match(tts, /if \(!cacheOnlyMissed\) reportPhase\('idle'\);/u);
});
