import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESULT_FILTER_EMPTY_COPY_KEYS,
  resolveWordListEmptyState,
  resultFilterEmptyCopyKeys,
} from '../../src/features/cards/emptyState';
import { countCardsByResult } from '../../src/features/cards/levels';
import { cardsForVisibility } from '../../src/features/cards/visibility';
import { translate } from '../../src/i18n';
import type { WordCard } from '../../src/types';

const NOW = Date.parse('2026-08-20T12:00:00Z');

function card(id: string, testLevel?: WordCard['testLevel'], hiddenUntil?: number): WordCard {
  return {
    id,
    word: id,
    meaning: id,
    note: '',
    ...(testLevel === undefined ? {} : { testLevel }),
    ...(hiddenUntil === undefined ? {} : { hiddenUntil }),
  };
}

test('an actually empty folder preserves the generic empty state', () => {
  assert.equal(resolveWordListEmptyState({
    allCardCount: 0,
    visibleCardCount: 0,
    activeResultFilter: null,
  }), 'generic');
  // A stale saved filter must not replace the first-word onboarding state.
  assert.equal(resolveWordListEmptyState({
    allCardCount: 0,
    visibleCardCount: 0,
    activeResultFilter: 'good',
  }), 'generic');
});

test('each empty colorful filter resolves to its own authoritative copy', () => {
  const expectations = {
    good: ['empty_filter_good_title', 'empty_filter_good_description'],
    slightly: ['empty_filter_slightly_title', 'empty_filter_slightly_description'],
    unknown: ['empty_filter_unknown_title', 'empty_filter_unknown_description'],
    none: ['empty_filter_none_title', 'empty_filter_none_description'],
  } as const;

  for (const activeResultFilter of Object.keys(expectations) as Array<keyof typeof expectations>) {
    const [title, description] = expectations[activeResultFilter];
    assert.equal(resolveWordListEmptyState({
      allCardCount: 4,
      visibleCardCount: 0,
      activeResultFilter,
    }), 'result-filter');
    assert.deepEqual(resultFilterEmptyCopyKeys(activeResultFilter), { title, description });
  }
  assert.equal(resultFilterEmptyCopyKeys(null), null);
});

test('matching filtered cards render normally instead of an empty state', () => {
  const allCards = [card('blue', 'good')];
  const filteredCards = cardsForVisibility(allCards, {
    now: NOW,
    activeResultFilter: 'good',
  });

  assert.equal(filteredCards.length, 1);
  assert.equal(resolveWordListEmptyState({
    allCardCount: allCards.length,
    visibleCardCount: filteredCards.length,
    activeResultFilter: 'good',
  }), 'none');
});

test('temporarily hidden cards remain existing data and matching filters reveal them', () => {
  const hiddenCard = card('hidden-blue', 'good', NOW + 3 * 24 * 60 * 60 * 1000);
  const allCards = [hiddenCard];
  const snapshot = JSON.stringify(allCards);

  assert.equal(cardsForVisibility(allCards, {
    now: NOW,
    activeResultFilter: null,
  }).length, 0);

  const filteredCards = cardsForVisibility(allCards, {
    now: NOW,
    activeResultFilter: 'good',
  });
  assert.deepEqual(filteredCards, [hiddenCard]);
  assert.equal(resolveWordListEmptyState({
    allCardCount: allCards.length,
    visibleCardCount: filteredCards.length,
    activeResultFilter: 'good',
  }), 'none');
  assert.equal(allCards.length, 1);
  assert.equal(JSON.stringify(allCards), snapshot);
});

test('empty-state resolution leaves filter counts and card data unchanged', () => {
  const cards = [
    card('blue', 'good'),
    card('yellow', 'slightly', NOW + 24 * 60 * 60 * 1000),
    card('red', 'unknown'),
    card('gray'),
  ];
  const cardsBefore = JSON.stringify(cards);
  const countsBefore = countCardsByResult(cards);

  resolveWordListEmptyState({
    allCardCount: cards.length,
    visibleCardCount: 0,
    activeResultFilter: 'unknown',
  });

  assert.deepEqual(countCardsByResult(cards), countsBefore);
  assert.equal(JSON.stringify(cards), cardsBefore);
});

test('complete English and Japanese empty-state copy is available', () => {
  const expected = {
    good: {
      en: [
        'No “Pretty good” words yet',
        'Words you rate “Pretty good” in Test Mode will appear here. They’ll be hidden from the regular Word List and Flip Mode, then shown again after 3 days.',
      ],
      ja: [
        '「まあまあ」の単語はまだありません',
        'テストモードで「まあまあ」と評価した単語がここに表示されます。通常の単語リストとフリップモードでは一時的に非表示になり、3日後に再表示されます。',
      ],
    },
    slightly: {
      en: [
        'No “Not really” words yet',
        'Words you rate “Not really” in Test Mode will appear here. They’ll be hidden from the regular Word List and Flip Mode, then shown again after 1 day.',
      ],
      ja: [
        '「微妙...」の単語はまだありません',
        'テストモードで「微妙...」と評価した単語がここに表示されます。通常の単語リストとフリップモードでは一時的に非表示になり、1日後に再表示されます。',
      ],
    },
    unknown: {
      en: [
        'No “Don’t know” words yet',
        'Words you rate “Don’t know” in Test Mode will appear here and remain available for review.',
      ],
      ja: [
        '「わからない」の単語はまだありません',
        'テストモードで「わからない」と評価した単語がここに表示され、引き続き復習できます。',
      ],
    },
    none: {
      en: [
        'No untested words',
        'New words and words reset in Test Mode will appear here until you rate them.',
      ],
      ja: [
        '未テストの単語はありません',
        '新しく追加した単語や、テスト結果をリセットした単語は、評価されるまでここに表示されます。',
      ],
    },
  } as const;

  for (const level of Object.keys(expected) as Array<keyof typeof expected>) {
    const keys = RESULT_FILTER_EMPTY_COPY_KEYS[level];
    assert.deepEqual(
      [translate('en-US', keys.title), translate('en-US', keys.description)],
      expected[level].en,
    );
    assert.deepEqual(
      [translate('ja', keys.title), translate('ja', keys.description)],
      expected[level].ja,
    );
  }
  assert.equal(translate('en-US', 'no_words_title'), 'No words yet');
  assert.equal(translate('en-US', 'no_words_hint'), 'Tap + to add your first word');
  assert.equal(translate('ja', 'no_words_title'), '単語がありません');
  assert.equal(translate('ja', 'no_words_hint'), '＋をタップして最初の単語を追加しましょう');
});
