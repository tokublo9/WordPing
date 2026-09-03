import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCardDueForTest,
  isCardWaitingForTest,
  matchesResultFilter,
  nextTestDueAt,
  type ScheduledCard,
} from '../../src/features/cards/testSchedule';
import { countCardsByResult, ALL_LEVEL_KEYS } from '../../src/features/cards/levels';

const NOW = Date.parse('2026-09-03T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const graded = (
  testLevel: 'good' | 'slightly' | 'unknown',
  dueIn: number,
): ScheduledCard => ({ testLevel, testNextReview: NOW + dueIn });

test('a word is due when it has never been tested', () => {
  assert.equal(isCardDueForTest({}, NOW), true);
  assert.equal(isCardWaitingForTest({}, NOW), false);
  // Reset writes 0 rather than removing the field; that is in the past.
  assert.equal(isCardDueForTest({ testNextReview: 0 }, NOW), true);
});

test('a graded word waits for its interval, then becomes due at the boundary', () => {
  const red = graded('unknown', HOUR);
  assert.equal(isCardWaitingForTest(red, NOW), true);
  assert.equal(isCardDueForTest(red, NOW), false);
  assert.equal(isCardWaitingForTest(red, NOW + HOUR - 1), true);
  // Exactly at the boundary it is due, and it is never both.
  assert.equal(isCardWaitingForTest(red, NOW + HOUR), false);
  assert.equal(isCardDueForTest(red, NOW + HOUR), true);
});

test('a finished word is neither due nor waiting', () => {
  for (const finished of [
    { testMastered: true, testLevel: 'perfect' } as ScheduledCard,
    { testMastered: true } as ScheduledCard,
    { testLevel: 'perfect' } as ScheduledCard,
  ]) {
    assert.equal(isCardDueForTest(finished, NOW), false);
    assert.equal(isCardWaitingForTest(finished, NOW), false);
    for (const key of ALL_LEVEL_KEYS) {
      assert.equal(matchesResultFilter(finished, key, NOW), false, key);
    }
  }
});

test('a colour is its result plus the unelapsed interval; grey is everything due', () => {
  const red = graded('unknown', HOUR);
  assert.equal(matchesResultFilter(red, 'unknown', NOW), true);
  assert.equal(matchesResultFilter(red, 'none', NOW), false);
  // The result on the card never changed — only the clock did.
  assert.equal(matchesResultFilter(red, 'unknown', NOW + HOUR), false);
  assert.equal(matchesResultFilter(red, 'none', NOW + HOUR), true);
  // A result never matches another colour's chip.
  assert.equal(matchesResultFilter(red, 'good', NOW), false);
  assert.equal(matchesResultFilter(red, 'slightly', NOW), false);
});

test('every word falls under exactly one chip, or none if it is finished', () => {
  const cards: ScheduledCard[] = [
    graded('good', 3 * DAY),
    graded('slightly', DAY),
    graded('unknown', HOUR),
    graded('unknown', -1),
    {},
    { testMastered: true, testLevel: 'perfect' },
  ];
  for (const card of cards) {
    const matched = ALL_LEVEL_KEYS.filter(key => matchesResultFilter(card, key, NOW));
    assert.ok(matched.length <= 1, JSON.stringify(card));
  }
  assert.deepEqual(countCardsByResult(cards, NOW), {
    good: 1, slightly: 1, unknown: 1, none: 2,
  });
});

test('the counts are a reading of the clock, not of a stored value', () => {
  const cards: ScheduledCard[] = [
    graded('good', 3 * DAY),
    graded('slightly', DAY),
    graded('unknown', HOUR),
  ];
  const snapshot = JSON.stringify(cards);

  assert.deepEqual(countCardsByResult(cards, NOW), {
    good: 1, slightly: 1, unknown: 1, none: 0,
  });
  // One hour on: red empties into grey, and nothing else has moved.
  assert.deepEqual(countCardsByResult(cards, NOW + HOUR), {
    good: 1, slightly: 1, unknown: 0, none: 1,
  });
  // A day on: yellow follows.
  assert.deepEqual(countCardsByResult(cards, NOW + DAY), {
    good: 1, slightly: 0, unknown: 0, none: 2,
  });
  // Three days on: everything is due again.
  assert.deepEqual(countCardsByResult(cards, NOW + 3 * DAY), {
    good: 0, slightly: 0, unknown: 0, none: 3,
  });
  // Not one card was written to in the process.
  assert.equal(JSON.stringify(cards), snapshot);
});

test('a chip count is always the number of words tapping it would show', () => {
  const cards: ScheduledCard[] = [
    graded('good', 3 * DAY),
    graded('unknown', HOUR),
    graded('unknown', -HOUR),
    {},
    { testMastered: true },
  ];
  for (const now of [NOW, NOW + HOUR, NOW + DAY, NOW + 4 * DAY]) {
    const counts = countCardsByResult(cards, now);
    for (const key of ALL_LEVEL_KEYS) {
      const shown = cards.filter(card => matchesResultFilter(card, key, now)).length;
      assert.equal(counts[key], shown, `${key} at ${now}`);
    }
  }
});

test('the wake-up is the soonest interval still running', () => {
  assert.equal(nextTestDueAt([], NOW), null);
  assert.equal(nextTestDueAt([{}, { testMastered: true }], NOW), null);
  // Elapsed intervals are behind us and schedule nothing.
  assert.equal(nextTestDueAt([graded('unknown', -HOUR)], NOW), null);
  assert.equal(
    nextTestDueAt([graded('good', 3 * DAY), graded('unknown', HOUR), graded('slightly', DAY)], NOW),
    NOW + HOUR,
  );
  // After the first one fires, the next is the following interval.
  assert.equal(
    nextTestDueAt([graded('good', 3 * DAY), graded('unknown', HOUR)], NOW + HOUR),
    NOW + 3 * DAY,
  );
});
