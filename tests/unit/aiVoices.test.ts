import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_VOICES,
  DEFAULT_AI_VOICE,
  RETIRED_AI_VOICES,
  getAIVoiceDescriptionKey,
  getAIVoiceNameKey,
  isAIVoice,
} from '../../src/lib/aiVoices';

test('the app offers Marin and Cedar, and nothing else', () => {
  assert.deepEqual([...AI_VOICES], ['marin', 'cedar']);
  assert.equal(DEFAULT_AI_VOICE, 'marin');
});

test('a stored voice the app no longer offers falls back to the default', () => {
  for (const retired of RETIRED_AI_VOICES) {
    assert.equal(isAIVoice(retired), false, `${retired} must not survive a reload`);
  }
  // db.ts reads `isAIVoice(stored) ? stored : DEFAULT_AI_VOICE`, so rejecting the
  // value is what puts an existing user on Marin.
  assert.equal(isAIVoice('marin'), true);
  assert.equal(isAIVoice('cedar'), true);
  assert.equal(isAIVoice(undefined), false);
  assert.equal(isAIVoice(''), false);
});

test('retired and offered voices are disjoint, so a purge cannot reach a live clip', () => {
  for (const voice of AI_VOICES) {
    assert.equal(RETIRED_AI_VOICES.has(voice), false, `${voice} is still offered`);
  }
});

test('every offered voice has its own copy, and appears once', () => {
  assert.equal(new Set(AI_VOICES).size, AI_VOICES.length, 'no voice is listed twice');
  // The copy itself lives in the dictionaries now; what must stay true here is
  // that each voice points at its own key, so no two voices can share a line.
  const descriptionKeys = AI_VOICES.map(getAIVoiceDescriptionKey);
  for (const key of descriptionKeys) assert.match(key, /\S/u);
  assert.equal(new Set(descriptionKeys).size, descriptionKeys.length, 'each voice reads differently');
});

test('each voice resolves to its own display name, not the other one', () => {
  // Called for its result rather than read out of the source: a swapped pair
  // still looks well-formed to a structural check, and would put Cedar's name
  // on Marin in every language. The internal values are the ones stored, sent
  // to the Worker and used in the cache key, so only the mapping is asserted
  // here — nothing about it may rename `marin` or `cedar`.
  assert.equal(getAIVoiceNameKey('marin'), 'voice_name_marin');
  assert.equal(getAIVoiceNameKey('cedar'), 'voice_name_cedar');
});
