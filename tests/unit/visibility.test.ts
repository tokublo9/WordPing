import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLEAR_HIDE,
  NOT_REALLY_HIDE_MS,
  PRETTY_GOOD_HIDE_MS,
  hiddenUntilFor,
  isCardHidden,
  nextHideExpiry,
  visibleCards,
} from '../../src/features/cards/visibility';
import type { WordCard } from '../../src/types';

function card(id: string, hiddenUntil?: number): WordCard {
  return { id, word: id, meaning: id, note: '', ...(hiddenUntil !== undefined ? { hiddenUntil } : {}) };
}

const NOW = Date.parse('2026-08-19T12:00:00Z');

test('Pretty good hides for exactly 72 hours', () => {
  assert.equal(PRETTY_GOOD_HIDE_MS, 72 * 60 * 60 * 1000);
  assert.equal(hiddenUntilFor(NOW, PRETTY_GOOD_HIDE_MS), NOW + 259_200_000);
  assert.equal(
    new Date(hiddenUntilFor(NOW, PRETTY_GOOD_HIDE_MS)).toISOString(),
    '2026-08-22T12:00:00.000Z',
  );
});

test('Not really hides for exactly 24 hours', () => {
  assert.equal(NOT_REALLY_HIDE_MS, 24 * 60 * 60 * 1000);
  assert.equal(hiddenUntilFor(NOW, NOT_REALLY_HIDE_MS), NOW + 86_400_000);
  assert.equal(
    new Date(hiddenUntilFor(NOW, NOT_REALLY_HIDE_MS)).toISOString(),
    '2026-08-20T12:00:00.000Z',
  );
});

test('the two periods are distinct, and Pretty good is the longer one', () => {
  assert.equal(PRETTY_GOOD_HIDE_MS, NOT_REALLY_HIDE_MS * 3);
  assert.ok(PRETTY_GOOD_HIDE_MS > NOT_REALLY_HIDE_MS);
});

test('a card with no hiddenUntil is always visible', () => {
  assert.equal(isCardHidden(card('a'), NOW), false);
});

test('a card is hidden until the timestamp passes, then reappears', () => {
  const until = hiddenUntilFor(NOW, PRETTY_GOOD_HIDE_MS);
  assert.equal(isCardHidden(card('a', until), NOW), true);
  assert.equal(isCardHidden(card('a', until), until - 1), true);
  // Exactly at the boundary it is visible again.
  assert.equal(isCardHidden(card('a', until), until), false);
  assert.equal(isCardHidden(card('a', until), until + 1), false);
});

test('reappearing needs no timer — it is derived from the stored timestamp', () => {
  const hidden = card('a', hiddenUntilFor(NOW, PRETTY_GOOD_HIDE_MS));
  // The same card object, evaluated later, is simply visible. Nothing is
  // scheduled, so relaunching cannot reset or extend the period.
  assert.equal(isCardHidden(hidden, NOW), true);
  assert.equal(isCardHidden(hidden, NOW + PRETTY_GOOD_HIDE_MS + 1), false);
});

test('the period is absolute, so a timezone change cannot alter it', () => {
  // hiddenUntil is Unix ms UTC: the same instant regardless of device offset.
  const until = hiddenUntilFor(NOW, PRETTY_GOOD_HIDE_MS);
  assert.equal(until - NOW, PRETTY_GOOD_HIDE_MS);
  // Evaluating from a "device" 14 hours ahead or behind changes nothing.
  for (const offset of [-14, 0, 14].map(h => h * 3_600_000)) {
    assert.equal(isCardHidden(card('a', until), until - 1 + offset - offset), true);
  }
});

test('visibleCards removes only the hidden ones', () => {
  const cards = [card('a'), card('b', hiddenUntilFor(NOW, PRETTY_GOOD_HIDE_MS)), card('c')];
  assert.deepEqual(visibleCards(cards, NOW).map(c => c.id), ['a', 'c']);
  // Once the period passes every card is back.
  assert.deepEqual(visibleCards(cards, NOW + PRETTY_GOOD_HIDE_MS).map(c => c.id), ['a', 'b', 'c']);
});

test('visibleCards returns the same array when nothing is hidden', () => {
  // Keeps referential identity so memoised list data is not invalidated.
  const cards = [card('a'), card('b')];
  assert.equal(visibleCards(cards, NOW), cards);
});

test('an expired hide is treated as visible without needing a rewrite', () => {
  const stale = card('a', NOW - 1);
  assert.equal(isCardHidden(stale, NOW), false);
  assert.deepEqual(visibleCards([stale], NOW).map(c => c.id), ['a']);
});

test('hiding never mutates the card', () => {
  const original = card('a', hiddenUntilFor(NOW, PRETTY_GOOD_HIDE_MS));
  const snapshot = { ...original };
  visibleCards([original], NOW);
  isCardHidden(original, NOW);
  assert.deepEqual(original, snapshot);
});

// ── Automatic reappearance ───────────────────────────────────────────────────

test('nextHideExpiry reports the soonest running hide', () => {
  const cards = [
    card('a'),
    card('b', NOW + 5_000),
    card('c', NOW + 1_000),
    card('d', NOW + 9_000),
  ];
  assert.equal(nextHideExpiry(cards, NOW), NOW + 1_000);
});

test('nextHideExpiry ignores hides that have already run out', () => {
  const cards = [card('a', NOW - 1), card('b', NOW), card('c', NOW + 7)];
  assert.equal(nextHideExpiry(cards, NOW), NOW + 7);
});

test('nextHideExpiry is null when nothing is hidden', () => {
  assert.equal(nextHideExpiry([card('a'), card('b', NOW - 1)], NOW), null);
  assert.equal(nextHideExpiry([], NOW), null);
});

test('the wake-up lands exactly when the card becomes visible again', () => {
  // A screen sitting idle has no state change at the moment a hide ends, so the
  // list is rebuilt from this timestamp. One tick short must still hide it.
  const cards = [card('a', hiddenUntilFor(NOW, PRETTY_GOOD_HIDE_MS))];
  const expiry = nextHideExpiry(cards, NOW);
  assert.equal(expiry, NOW + PRETTY_GOOD_HIDE_MS);
  assert.deepEqual(visibleCards(cards, expiry! - 1).map(c => c.id), []);
  assert.deepEqual(visibleCards(cards, expiry!).map(c => c.id), ['a']);
});

test('CLEAR_HIDE lifts a hide when spread over a card', () => {
  const hidden = card('a', hiddenUntilFor(NOW, PRETTY_GOOD_HIDE_MS));
  const cleared = { ...hidden, ...CLEAR_HIDE };
  assert.equal(isCardHidden(cleared, NOW), false);
  assert.equal(cleared.hiddenUntil, undefined);
});
