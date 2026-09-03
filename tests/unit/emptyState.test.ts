import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_COMPLETE_COPY_KEYS,
  resolveWordListEmptyState,
} from '../../src/features/cards/emptyState';
import { countCardsByResult } from '../../src/features/cards/levels';
import { cardsForVisibility } from '../../src/features/cards/visibility';
import { translate } from '../../src/i18n';
import type { WordCard } from '../../src/types';

const NOW = Date.parse('2026-08-20T12:00:00Z');

/**
 * `hiddenUntil` keeps a card out of the list; `testNextReview` keeps it resting
 * under its colour. Grading writes both at once, so fixtures that stand for a
 * graded card set both.
 */
function card(
  id: string,
  testLevel?: WordCard['testLevel'],
  hiddenUntil?: number,
  testNextReview: number | undefined = hiddenUntil,
): WordCard {
  return {
    id,
    word: id,
    meaning: id,
    note: '',
    ...(testLevel === undefined ? {} : { testLevel }),
    ...(hiddenUntil === undefined ? {} : { hiddenUntil }),
    ...(testNextReview === undefined ? {} : { testNextReview }),
  };
}

test('an actually empty folder gets the first-word state', () => {
  assert.equal(resolveWordListEmptyState({
    allCardCount: 0,
    visibleCardCount: 0,
  }), 'generic');
});

test('a folder whose words are all inside a hide reports the finished review', () => {
  // Every word graded, so every word is hidden and the list draws nothing. The
  // words are still there and come back on their own, so "No words yet" would be
  // a lie: this is the end of a review, not an empty folder.
  const cards = [
    card('blue', 'good', NOW + 72 * 60 * 60 * 1000),
    card('yellow', 'slightly', NOW + 24 * 60 * 60 * 1000),
    card('red', 'unknown', NOW + 60 * 60 * 1000),
  ];
  const visible = cardsForVisibility(cards, NOW);

  assert.equal(visible.length, 0);
  assert.equal(resolveWordListEmptyState({
    allCardCount: cards.length,
    visibleCardCount: visible.length,
  }), 'session-complete');

  // One hide expiring is enough to end it: the list has something to show again.
  const later = NOW + 61 * 60 * 1000;
  const visibleLater = cardsForVisibility(cards, later);
  assert.equal(visibleLater.length, 1);
  assert.equal(resolveWordListEmptyState({
    allCardCount: cards.length,
    visibleCardCount: visibleLater.length,
  }), 'none');
});

test('words on screen mean no empty state at all', () => {
  const cards = [card('blue', 'good'), card('gray')];
  assert.equal(resolveWordListEmptyState({
    allCardCount: cards.length,
    visibleCardCount: cardsForVisibility(cards, NOW).length,
  }), 'none');
});

test('empty-state resolution leaves counts and card data unchanged', () => {
  const cards = [
    card('blue', 'good'),
    card('yellow', 'slightly', NOW + 24 * 60 * 60 * 1000),
    card('red', 'unknown'),
    card('gray'),
  ];
  const cardsBefore = JSON.stringify(cards);
  const countsBefore = countCardsByResult(cards, NOW);

  resolveWordListEmptyState({ allCardCount: cards.length, visibleCardCount: 0 });

  assert.deepEqual(countCardsByResult(cards, NOW), countsBefore);
  assert.equal(JSON.stringify(cards), cardsBefore);
});

test('the finished-review copy is the same wording Test Mode used to show', () => {
  assert.deepEqual(SESSION_COMPLETE_COPY_KEYS, {
    title: 'test_complete_title',
    hint: 'test_complete_hint',
  });
  assert.equal(translate('en-US', 'test_complete_title'), 'Session Complete!');
  assert.equal(translate('en-US', 'test_complete_hint'), 'Come back later to review more words.');
  assert.equal(translate('ja', 'test_complete_title'), 'セッション完了！');
  assert.equal(translate('ja', 'test_complete_hint'), '後でまた復習しよう。');
});

test('the first-word copy is still there for a folder with nothing in it', () => {
  assert.equal(translate('en-US', 'no_words_title'), 'No words yet');
  assert.equal(translate('en-US', 'no_words_hint'), 'Tap + to add your first word');
  assert.equal(translate('ja', 'no_words_title'), '単語がありません');
  assert.equal(translate('ja', 'no_words_hint'), '＋をタップして最初の単語を追加しましょう');
});
