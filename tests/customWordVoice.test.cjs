const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

/**
 * Custom Voice for Words, end to end.
 *
 * A word with a registered file plays that file and only that file. The card
 * looks no different for it — the voice icon is the same either way — so the
 * distinction is carried by the audio and by the accessibility label alone. The
 * rule itself is a pure module with its own unit tests; what is pinned here is
 * the wiring those tests cannot see: that the player, the button and the
 * preloader all read the same predicate.
 */

// ── Registering the audio ────────────────────────────────────────────────────

test('the editor copies the picked file into persistent storage', () => {
  const modal = read('src/components/WordModal.tsx');
  const picker = modal.slice(modal.indexOf('const handleAudioButton'), modal.indexOf('const handleClearAudio'));

  // Picked without the cache copy, then copied into Paths.document — the cache
  // is OS-managed and cleared on low storage, which would lose the word's voice.
  assert.match(picker, /DocumentPicker\.getDocumentAsync\(\{ type: 'audio\/\*', copyToCacheDirectory: false \}\)/u);
  assert.match(picker, /const audioDir = new Directory\(Paths\.document, 'audio'\);/u);
  assert.match(picker, /new File\(asset\.uri\)\.copy\(destFile\);/u);
  assert.match(picker, /onChangeAudioUri\(destFile\.uri\);/u);

  // Only an audio file, and only within the size cap.
  assert.match(picker, /!asset\.mimeType\.startsWith\('audio\/'\)/u);
  assert.match(picker, /asset\.size > MAX_AUDIO_FILE_BYTES/u);
  // The extension is taken from an allowlist, never straight from the filename.
  assert.match(picker, /AUDIO_EXTENSIONS\.has\(candidateExtension\) \? candidateExtension : 'm4a'/u);
});

test('remove sits to the right of the always-available Custom Voice button', () => {
  const modal = read('src/components/WordModal.tsx');
  const group = modal.slice(
    modal.indexOf('<View style={[styles.audioBtnGroup, styles.wordHeaderRight]}>'),
    modal.indexOf('<View>\n                  {/* A hidden word is dimmed here'),
  );

  // The button that attaches or plays the file comes before the × that clears
  // it. Remove renders only once there is something to clear, so the Custom
  // Voice button holds the same place whether or not a file is attached.
  assert.ok(
    group.indexOf('handleAudioButton();') < group.indexOf('onPress={handleClearAudio}'),
    'the Custom Voice button must come first',
  );
  assert.match(group, /<\/TouchableOpacity>\s*\{\/\*[\s\S]*?\*\/\}\s*\{audioUri && \(/u);
  assert.doesNotMatch(group, /isSubscribed|isPremium|canUseCustomVoice|handleLockedVoicePlay/u);
});

test('the file is saved with the word and survives a round trip', () => {
  const repositories = read('src/lib/sqlite/repositories.ts');
  // Written on save...
  assert.match(repositories, /audio_uri = excluded\.audio_uri,\s*audio_speed = excluded\.audio_speed,\s*audio_volume = excluded\.audio_volume/u);
  assert.match(repositories, /card\.audioUri \?\? null,/u);
  // ...and read back onto the card.
  assert.match(repositories, /if \(row\.audio_uri !== null\) card\.audioUri = row\.audio_uri;/u);
  assert.match(repositories, /if \(row\.audio_speed !== null\) card\.audioSpeed = row\.audio_speed;/u);
  assert.match(repositories, /if \(row\.audio_volume !== null\) card\.audioVolume = row\.audio_volume;/u);
  assert.match(read('src/lib/sqlite/schema.ts'), /audio_uri\s+TEXT,/u);
});

// ── Playing only the custom audio ────────────────────────────────────────────

test('a registered file replaces speech outright, with no generation', () => {
  const tts = read('src/lib/tts.ts');
  const speakWordCard = tts.slice(tts.indexOf('export function speakWordCard'), tts.indexOf('export function speak('));

  // Routed on the shared predicate, not on an inline truthiness check that
  // could drift from the icon's.
  assert.match(speakWordCard, /if \(resolveCardVoiceSource\(card, 'word'\) === 'custom'\) \{/u);
  assert.match(speakWordCard, /return speakCustom\(card\.audioUri!, card\.audioSpeed \?\? 1\.0, card\.audioVolume \?\? 1\.0, options\);/u);
  assert.match(tts, /import \{ resolveCardVoiceSource \} from '\.\.\/features\/voice\/cardVoiceSource';/u);

  // speakCustom opens the local file and nothing else: no gateway, no cache
  // fetch, no consent check — so a custom voice works with the network off.
  const speakCustom = tts.slice(tts.indexOf('export async function speakCustom'), tts.indexOf('// ── Public API'));
  assert.match(speakCustom, /createAudioPlayer\(\{ uri \}\)/u);
  assert.doesNotMatch(
    speakCustom,
    /fetchAndCacheAudio|requestAISpeech|speakWithAI|ensureAIConsent|requireAI/u,
    'custom playback must not reach the network',
  );
});

test('no AI pronunciation is generated for a word that has a file', () => {
  // The preloader is the only path that would generate ahead of a tap.
  const queue = read('src/lib/ttsPreloadQueue.ts');
  assert.match(
    queue,
    /return options\.hasAIAccess && !options\.hasCustomAudio && options\.text\.trim\(\)\.length > 0;/u,
  );

  // Both sweeps report it: the one-off on registration and the library pass.
  const app = read('App.tsx');
  assert.equal((app.match(/hasCustomAudio: Boolean\(card\.audioUri\),/gu) ?? []).length, 2);
});

// ── On the card ──────────────────────────────────────────────────────────────

test('the voice button draws the same glyph whatever it will play', () => {
  const button = read('src/components/WordCardVoiceButton.tsx');

  // One icon pair for both sources: a word with its own recording looks exactly
  // like one without, so the card reads identically either way.
  assert.match(button, /name=\{playing \? 'volume-high' : 'volume-medium-outline'\}/u);
  assert.doesNotMatch(button, /musical-notes|SOURCE_ICONS/u, 'no second glyph pair');
  assert.equal((button.match(/size=\{17\}/gu) ?? []).length, 1, 'one icon, one size');

  // The source still reaches the button, because it is the only cue assistive
  // tech gets — there is no icon difference for a screen reader to describe.
  assert.match(button, /source = 'tts',/u);
  assert.match(button, /source === 'custom' \? 'Play custom audio' : 'Play pronunciation'/u);
});

test('every front-side voice button is told which source it plays', () => {
  // One answer, computed in the hook from the same predicate the player uses.
  const playback = read('src/hooks/useWordCardVoicePlayback.ts');
  assert.match(playback, /const wordVoiceSource = resolveCardVoiceSource\(item, 'word'\);/u);
  assert.match(playback, /return \{ voiceState, playWord, playMeaning, stopVoice, wordVoiceSource \};/u);

  for (const path of [
    'src/components/FlipCardBrowser.tsx',
    'src/components/TestModeScreen.tsx',
  ]) {
    const source = read(path);
    const destructured = source.slice(0, source.indexOf('useWordCardVoicePlayback({'));
    assert.match(
      destructured.slice(-200),
      /wordVoiceSource/u,
      `${path} must take the source from the hook`,
    );
    assert.match(source, /source=\{wordVoiceSource\}/u, `${path} front face must pass it`);
  }

  // The list card's corner button serves both sides, so it picks per side.
  const swipeable = read('src/components/SwipeableCard.tsx');
  assert.match(swipeable, /source=\{isFlipped && !showFullCard \? 'tts' : wordVoiceSource\}/u);
});

test('the meaning side is left at the default source', () => {
  // Custom Voice is attached to the word, so the meaning side has no file of its
  // own and must never be announced as playing one.
  const swipeable = read('src/components/SwipeableCard.tsx');
  const meaningRow = swipeable.slice(swipeable.indexOf('styles.expandMeaningRow'));
  const button = meaningRow.slice(meaningRow.indexOf('<WordCardVoiceButton'), meaningRow.indexOf('/>'));
  assert.doesNotMatch(button, /source=/u);

  const flip = read('src/components/FlipCardBrowser.tsx');
  const backFace = flip.slice(flip.indexOf('onPress={playMeaning}'));
  assert.doesNotMatch(backFace.slice(0, 300), /source=/u);
});
