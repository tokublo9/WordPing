const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('an active entitlement sweeps every existing word into the cache', () => {
  const app = read('App.tsx');
  const tts = read('src/lib/tts.ts');

  // The sweep runs for whichever plans actually have AI Voice — Premium today —
  // once the subscription and the stored voice are both known; preloading before
  // the voice loads would cache the wrong voice. Read from `planCanUseAI` rather
  // than a tier list, so a plan change moves the sweep with it.
  assert.match(app, /const hasAIAccess = planCanUseAI\(plan\);/u);
  assert.match(app, /if \(!isSubscriptionLoaded \|\| !settingsLoaded \|\| !hasAIAccess\)/u);
  assert.match(app, /preloadAIPronunciationLibrary\(\{\s*entries: cards\.map\(/u);
  assert.match(app, /text: card\.word,/u);
  assert.match(app, /hasCustomAudio: Boolean\(card\.audioUri\),/u);

  // Keyed rather than run-once: cards usually finish loading after the subscription
  // resolves, and a voice change needs a fresh sweep because the cache is voice-keyed.
  assert.match(app, /const key = `\$\{plan\} \$\{aiVoice\} \$\{entitlementRevision\}`;/u);
  assert.match(app, /if \(preloadedLibraryKeyRef\.current === key\) return;/u);
  assert.match(app, /if \(cards\.length === 0\) return;/u);
  // Losing access resets the key so re-subscribing sweeps again.
  assert.match(app, /if \(!hasAIAccess\) preloadedLibraryKeyRef\.current = null;/u);
  // The effect must see card and voice changes to do any of that.
  assert.match(app, /\[\s*aiVoice, cards, entitlementRevision, entitlementSource,\s*isSubscriptionLoaded, plan, settingsLoaded,\s*\]/u);

  // The helper reuses the single-card path, so it inherits the cache hits, in-flight
  // deduplication and one-at-a-time queue rather than firing N parallel requests.
  assert.match(tts, /export function preloadAIPronunciationLibrary\(/u);
  assert.match(tts, /for \(const entry of options\.entries\) \{\s*preloadAIPronunciation\(\{/u);
  assert.match(tts, /if \(!options\.hasAIAccess \|\| options\.entries\.length === 0\) return;/u);
});

test('words added while subscribed are preloaded on registration', () => {
  const app = read('App.tsx');
  // handleCardRegistered covers everything added after the sweep.
  assert.match(
    app,
    /const handleCardRegistered = useCallback\(\(card: WordCard\) => \{\s*preloadAIPronunciation\(\{/u,
  );
  // `canUseAIVoice` already carries "loaded and eligible", so a Basic user — who
  // has no AI Voice — queues nothing.
  assert.match(
    app,
    /hasAIAccess: canUseAIVoice && entitlementSource !== 'local-development-scenario',/u,
  );
  assert.match(app, /onCardRegistered: handleCardRegistered/u);
  // And deleted cards release their queued work.
  assert.match(app, /cancelAIPronunciationPreload/u);
});

test('cached audio survives navigation and restarts', () => {
  const tts = read('src/lib/tts.ts');
  // Files on disk are the cache: a lookup precedes any network call, so audio generated
  // in an earlier session still plays without regenerating.
  assert.match(tts, /new Directory\(Paths\.cache, TTS_CACHE_DIR\)/u);
  assert.match(tts, /dir\.create\(\{ intermediates: true, idempotent: true \}\)/u);
  // Structurally validated before being trusted, so a truncated file is refetched
  // instead of failing playback after a restart.
  assert.match(tts, /async function validateCachedAudioFile\(file: File\): Promise<boolean> \{[\s\S]*?isSupportedCachedWav\(await file\.bytes\(\)\)/u);
  // Nothing clears the directory wholesale — only individual invalid files are dropped.
  assert.doesNotMatch(tts, /dir\.delete\(\)|TTS_CACHE_DIR[\s\S]{0,80}\.delete\(\)/u);
});

test('Test mode drives its voice icon through the shared playback hook', () => {
  const testMode = read('src/components/TestModeScreen.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');

  // Same hook, same button component, same props as the Flip screen.
  for (const source of [testMode, flip]) {
    assert.match(source, /useWordCardVoicePlayback\(\{/u);
    assert.match(source, /<WordCardVoiceButton/u);
    assert.match(source, /themeColor=\{themeColor\}\s*inactiveColor=\{pal\.sub\}/u);
  }
  // Only generated AI Voice has an entitlement capability. Attached Custom
  // Voice files are local and always available.
  assert.match(testMode, /const \{ voiceState, playWord, playMeaning, stopVoice, wordVoiceSource \} = useWordCardVoicePlayback\(\{\s*item: card,\s*canUseAIVoice,\s*\}\);/u);
  assert.doesNotMatch(testMode, /canUseCustomVoice|onCustomVoiceLocked/u);
  // No duplicate lock banner is drawn over the screen.
  assert.doesNotMatch(testMode, /showVoiceLockedBanner|voiceBannerPan|s\.voiceBanner/u);
  // Phase is read per target, so the word and meaning icons show their own state.
  assert.match(testMode, /phase=\{voiceState\?\.target === 'word' \? voiceState\.phase : undefined\}/u);
  assert.match(testMode, /phase=\{voiceState\?\.target === 'meaning' \? voiceState\.phase : undefined\}/u);

  // No parallel implementation left: no direct TTS calls, no local playing flag.
  assert.doesNotMatch(testMode, /speakWordCard|stopPlayback|setPlaying|from '\.\.\/lib\/tts'/u);
  // Automatic playback uses the same actions, so the icon reflects it too.
  assert.match(testMode, /void playWord\(\);/u);
  assert.match(testMode, /if \(!muted && card\?\.meaning\) void playMeaning\(\);/u);
  // Stops route through the hook so its state clears with the audio.
  assert.match(testMode, /if \(!muted\) stopVoice\(\);/u);
});

test('the card face exposes only the shared voice button', () => {
  const face = read('src/components/CardScrollFace.tsx');
  // The hand-rolled icon branch is gone, so no screen can drift from the shared one.
  assert.doesNotMatch(face, /onVoice|voiceColor|volume-medium-outline|TouchableOpacity/u);
  assert.match(face, /\{showVoice && voiceButton && \(\s*<View style=\{s\.wordCardVoiceBtn\}>\{voiceButton\}<\/View>\s*\)\}/u);
  assert.doesNotMatch(face, /voiceBtn: \{/u);
});
