import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASIC_VOICE_CARD_LIMIT,
  resolveBasicVoiceCardLimit,
} from '../../src/dev/basicVoiceCardLimit';
import { allocateBasicVoiceCards } from '../../src/features/voice/cardVoicePolicy';

test('a development limit of five exercises the Word List boundary', () => {
  const cards = Array.from({ length: 7 }, (_, index) => ({ id: `card-${index}`, createdAt: 7 - index }));
  const limit = resolveBasicVoiceCardLimit(10, 5, true);
  const selected = allocateBasicVoiceCards(cards, [], limit);
  assert.equal(limit, 5);
  assert.deepEqual(selected, ['card-0', 'card-1', 'card-2', 'card-3', 'card-4']);
  assert.deepEqual(allocateBasicVoiceCards([{ id: 'new' }], selected, limit), selected);
});

test('a release build keeps the server grant even when the development file is changed', () => {
  assert.equal(BASIC_VOICE_CARD_LIMIT, 10);
  assert.equal(resolveBasicVoiceCardLimit(10, 5, false), 10);
  assert.equal(resolveBasicVoiceCardLimit(10, 500, true), 10);
  assert.equal(resolveBasicVoiceCardLimit(10, 0, true), 10);
});
