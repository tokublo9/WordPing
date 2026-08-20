import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_TEXT_FEATURES_ENABLED,
  AI_TEXT_FEATURE_KEYS,
  SYNC_WITH_TEST_RESULTS_ENABLED,
  TEXT_TO_SPEECH_ENABLED,
  filterAiTextEntries,
  filterTextToSpeechEntries,
  isAiTextFeatureKey,
} from '../../src/features/flags';

/**
 * The four GPT-backed text features are temporarily hidden. These tests pin
 * both halves of that: hidden while the flag is off, and fully restored the
 * moment it is on.
 */

interface Entry { key: string; aiText?: boolean }

const PAYWALL_SECTIONS: Entry[] = [
  { key: 'custom_voice' },
  { key: 'text_to_speech' },
  { key: 'meaning', aiText: true },
  { key: 'example', aiText: true },
  { key: 'translate', aiText: true },
  { key: 'breakdown', aiText: true },
  { key: 'priority' },
  { key: 'transfer' },
];

test('the AI text features are hidden for this release', () => {
  assert.equal(AI_TEXT_FEATURES_ENABLED, false);
});

test('standalone Text-to-Speech is hidden for this release', () => {
  assert.equal(TEXT_TO_SPEECH_ENABLED, false);
});

test('Sync with test results is always enabled internally', () => {
  assert.equal(SYNC_WITH_TEST_RESULTS_ENABLED, true);
});

test('the flag names exactly the four text features', () => {
  assert.deepEqual([...AI_TEXT_FEATURE_KEYS], ['meaning', 'example', 'translate', 'breakdown']);

  // Audio, TTS and subscription features must not be caught by the flag.
  for (const unrelated of ['custom_voice', 'text_to_speech', 'ai_voice_hq', 'priority', 'transfer', 'themes']) {
    assert.equal(isAiTextFeatureKey(unrelated), false, `${unrelated} must not be treated as AI text`);
  }
});

test('with the flag off, all four entries are removed', () => {
  const visible = filterAiTextEntries(PAYWALL_SECTIONS, entry => entry.aiText === true, false);
  assert.deepEqual(visible.map(entry => entry.key), [
    'custom_voice', 'text_to_speech', 'priority', 'transfer',
  ]);
  for (const key of AI_TEXT_FEATURE_KEYS) {
    assert.equal(visible.some(entry => entry.key === key), false, `${key} must not be visible`);
  }
});

test('with the flag on, the implementation is exposed again unchanged', () => {
  const visible = filterAiTextEntries(PAYWALL_SECTIONS, entry => entry.aiText === true, true);
  assert.deepEqual(visible.map(entry => entry.key), PAYWALL_SECTIONS.map(entry => entry.key));
  assert.equal(visible.length, 8);
});

test('filtering never removes unrelated features', () => {
  const audioOnly: Entry[] = [{ key: 'custom_voice' }, { key: 'text_to_speech' }, { key: 'ai_voice_hq' }];
  assert.deepEqual(
    filterAiTextEntries(audioOnly, entry => isAiTextFeatureKey(entry.key), false),
    audioOnly,
  );
});

test('filtering does not mutate the source list', () => {
  const source: Entry[] = [{ key: 'meaning', aiText: true }, { key: 'transfer' }];
  filterAiTextEntries(source, entry => entry.aiText === true, false);
  assert.equal(source.length, 2);
  // Enabled returns a copy too, so a caller cannot alias the definitions.
  const passthrough = filterAiTextEntries(source, entry => entry.aiText === true, true);
  assert.notEqual(passthrough, source);
  assert.deepEqual(passthrough, source);
});

test('an empty list is handled in both states', () => {
  assert.deepEqual(filterAiTextEntries([], () => true, false), []);
  assert.deepEqual(filterAiTextEntries([], () => true, true), []);
});

test('production callers get the flag when no override is passed', () => {
  const visible = filterAiTextEntries(PAYWALL_SECTIONS, entry => entry.aiText === true);
  assert.equal(visible.some(entry => entry.aiText === true), AI_TEXT_FEATURES_ENABLED);
});

test('the Text-to-Speech filter hides only that feature and can restore it', () => {
  const isTextToSpeech = (entry: Entry) => entry.key === 'text_to_speech';
  const hidden = filterTextToSpeechEntries(PAYWALL_SECTIONS, isTextToSpeech);

  assert.equal(hidden.some(isTextToSpeech), false);
  assert.deepEqual(
    hidden.map(entry => entry.key),
    PAYWALL_SECTIONS.filter(entry => !isTextToSpeech(entry)).map(entry => entry.key),
  );
  assert.deepEqual(
    filterTextToSpeechEntries(PAYWALL_SECTIONS, isTextToSpeech, true),
    PAYWALL_SECTIONS,
  );
  assert.equal(PAYWALL_SECTIONS.length, 8, 'the source definitions stay untouched');
});
