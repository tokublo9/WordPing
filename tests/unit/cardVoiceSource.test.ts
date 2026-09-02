import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasCustomWordVoice,
  resolveCardVoiceSource,
  type CardVoiceTarget,
} from '../../src/features/voice/cardVoiceSource';

/**
 * Which audio a card side plays.
 *
 * One predicate, read by both the player and the card's voice icon, so a word
 * cannot show a custom glyph and then speak generated audio, or the reverse.
 */

const TARGETS: CardVoiceTarget[] = ['word', 'meaning'];

test('a registered file makes the word side custom', () => {
  assert.equal(
    resolveCardVoiceSource({ audioUri: 'file:///audio/word-1.m4a' }, 'word'),
    'custom',
  );
  assert.equal(hasCustomWordVoice({ audioUri: 'file:///audio/word-1.m4a' }), true);
});

test('a word with no file uses the ordinary TTS path', () => {
  assert.equal(resolveCardVoiceSource({}, 'word'), 'tts');
  assert.equal(resolveCardVoiceSource({ audioUri: undefined }, 'word'), 'tts');
  assert.equal(hasCustomWordVoice({}), false);
});

test('an empty or blank uri is not a file', () => {
  // A stored blank would otherwise route playback at a URI that cannot load,
  // and draw a custom icon for audio that does not exist.
  for (const audioUri of ['', '   ', '\t', '\n']) {
    assert.equal(resolveCardVoiceSource({ audioUri }, 'word'), 'tts', JSON.stringify(audioUri));
    assert.equal(hasCustomWordVoice({ audioUri }), false);
  }
});

test('the meaning side is always TTS, file or no file', () => {
  // Custom Voice is attached to the word. The meaning is different text with
  // nothing recorded for it, so it can never resolve to the custom source.
  assert.equal(resolveCardVoiceSource({ audioUri: 'file:///audio/a.m4a' }, 'meaning'), 'tts');
  assert.equal(resolveCardVoiceSource({}, 'meaning'), 'tts');
});

test('a missing card resolves to TTS rather than throwing', () => {
  // The Flip screen has no centred card while a folder is empty, and Test Mode
  // has none once the queue is finished.
  for (const target of TARGETS) {
    assert.equal(resolveCardVoiceSource(null, target), 'tts');
    assert.equal(resolveCardVoiceSource(undefined, target), 'tts');
  }
  assert.equal(hasCustomWordVoice(null), false);
  assert.equal(hasCustomWordVoice(undefined), false);
});

test('the rule reads the file alone, never the plan', () => {
  // Entitlement is checked separately, so a downgraded user still sees the
  // custom icon on a word that has one — and tapping it explains the lock
  // rather than silently speaking something else.
  const card = { audioUri: 'file:///audio/word-1.m4a' };
  assert.equal(resolveCardVoiceSource(card, 'word'), 'custom');
  // There is no second argument for a plan, so no caller can pass one.
  assert.equal(resolveCardVoiceSource.length, 2);
});
