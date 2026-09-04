import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_VOICES,
  DEFAULT_AI_VOICE,
  RETIRED_AI_VOICES,
  getAIVoiceDescription,
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
  const descriptions = AI_VOICES.map(getAIVoiceDescription);
  for (const description of descriptions) assert.match(description, /\S/u);
  assert.equal(new Set(descriptions).size, descriptions.length, 'each voice reads differently');
});
