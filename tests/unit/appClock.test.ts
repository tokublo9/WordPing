import assert from 'node:assert/strict';
import test from 'node:test';

import { gradeCard } from '../../src/features/cards/grading';
import { appNowForEnvironment } from '../../src/lib/appClock';
import { isCardHidden } from '../../src/features/cards/visibility';
import type { WordCard } from '../../src/types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REAL_NOW = Date.parse('2026-08-20T15:00:00Z');

function card(id: string, extra: Partial<WordCard> = {}): WordCard {
  return { id, word: id, meaning: id, note: '', ...extra };
}

function developmentNow(offsetMs: number): number {
  return appNowForEnvironment(REAL_NOW, true, offsetMs);
}

test('card visibility changes immediately before, exactly at, and immediately after hiddenUntil', () => {
  const hidden = card('not-really', { hiddenUntil: REAL_NOW + DAY_MS });

  assert.equal(isCardHidden(hidden, developmentNow(DAY_MS - 1)), true);
  assert.equal(isCardHidden(hidden, developmentNow(DAY_MS)), false);
  assert.equal(isCardHidden(hidden, developmentNow(DAY_MS + 1)), false);
});

test('the one-day rule stays hidden at 23 hours and becomes visible at 24 hours', () => {
  const outcome = gradeCard(card('not-really'), 'slightly', {
    now: REAL_NOW,
    syncTestResults: true,
  });
  assert.ok(outcome.action === 'update');
  const graded = card('not-really', outcome.patch);

  assert.equal(isCardHidden(graded, developmentNow(23 * HOUR_MS)), true);
  assert.equal(isCardHidden(graded, developmentNow(DAY_MS)), false);
});

test('the three-day rule stays hidden at one day and becomes visible at three days', () => {
  const outcome = gradeCard(card('pretty-good'), 'good', {
    now: REAL_NOW,
    syncTestResults: true,
  });
  assert.ok(outcome.action === 'update');
  const graded = card('pretty-good', outcome.patch);

  assert.equal(isCardHidden(graded, developmentNow(DAY_MS)), true);
  assert.equal(isCardHidden(graded, developmentNow(3 * DAY_MS)), false);
});

test('production ignores a configured development offset', () => {
  assert.equal(appNowForEnvironment(REAL_NOW, false, 7 * DAY_MS), REAL_NOW);
});

test('simulated visibility never changes graded or persisted card timestamps', () => {
  const outcome = gradeCard(card('pretty-good'), 'good', {
    now: REAL_NOW,
    syncTestResults: true,
  });
  assert.ok(outcome.action === 'update');
  const graded = card('pretty-good', outcome.patch);
  const snapshot = structuredClone(graded);

  assert.equal(graded.reviewHistory?.[0]?.ts, REAL_NOW);
  assert.equal(graded.testNextReview, REAL_NOW + 3 * DAY_MS);
  assert.equal(graded.hiddenUntil, REAL_NOW + 3 * DAY_MS);
  assert.equal(isCardHidden(graded, developmentNow(7 * DAY_MS)), false);
  assert.deepEqual(graded, snapshot);
});
