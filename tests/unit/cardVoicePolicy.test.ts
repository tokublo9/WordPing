import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateBasicVoiceCards, mayUseAIVoiceForCard, setCardVoicePolicy, useDeviceVoiceAfterBasicLimit } from '../../src/features/voice/cardVoicePolicy';

test('Basic selects ten cards by folder and Word List order, then keeps their slots', () => {
  const cards = Array.from({ length: 11 }, (_, i) => ({
    id: `card-${i}`, folderId: i < 3 ? 'second' : 'first', createdAt: 11 - i,
  }));
  const selected = allocateBasicVoiceCards(cards, [], 10, ['first', 'second']);
  assert.equal(selected.length, 10);
  assert.equal(selected[0], 'card-3');
  assert.equal(selected[8], 'card-0');
  assert.equal(selected.includes('card-2'), false);
  assert.deepEqual(allocateBasicVoiceCards([{ id: 'new', folderId: 'first' }], selected, 10, ['first', 'second']), selected);
  setCardVoicePolicy({ plan: 'basic', basicCardIds: selected, premiumBackVoice: true });
  assert.equal(mayUseAIVoiceForCard('card-3', 'word'), true);
  assert.equal(mayUseAIVoiceForCard('card-3', 'meaning'), false);
  assert.equal(mayUseAIVoiceForCard('card-2', 'word'), false);
});

test('Basic fills unused slots as new cards arrive and never gives an eleventh slot', () => {
  const first = Array.from({ length: 4 }, (_, index) => ({ id: `existing-${index}`, folderId: 'first' }));
  const initial = allocateBasicVoiceCards(first, [], 10, ['first']);
  assert.deepEqual(initial, first.map(card => card.id));
  const all = [...first, ...Array.from({ length: 7 }, (_, index) => ({ id: `added-${index}`, folderId: 'first' }))];
  const selected = allocateBasicVoiceCards(all, initial, 10, ['first']);
  assert.deepEqual(selected, [...initial, ...all.slice(4, 10).map(card => card.id)]);
  assert.equal(selected.includes('added-6'), false);
});

test('Premium defaults to front only and enables back when requested', () => {
  setCardVoicePolicy({ plan: 'premium', basicCardIds: [], premiumBackVoice: false });
  assert.equal(mayUseAIVoiceForCard('any', 'word'), true);
  assert.equal(mayUseAIVoiceForCard('any', 'meaning'), false);
  setCardVoicePolicy({ plan: 'premium', basicCardIds: [], premiumBackVoice: true });
  assert.equal(mayUseAIVoiceForCard('any', 'meaning'), true);
});

test('Basic usage refusals fall back silently while Premium retains limit messages', () => {
  for (const kind of ['voice_credits_exhausted', 'rate_limited', 'usage_limited', 'monthly_limit_reached'] as const) {
    assert.equal(useDeviceVoiceAfterBasicLimit('basic', kind), true);
    assert.equal(useDeviceVoiceAfterBasicLimit('premium', kind), false);
  }
  assert.equal(useDeviceVoiceAfterBasicLimit('basic', 'offline'), false);
  assert.equal(useDeviceVoiceAfterBasicLimit('basic', 'entitlement_unverified'), false);
});
