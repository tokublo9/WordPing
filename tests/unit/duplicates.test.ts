import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FolderWordIndex,
  findDuplicateCard,
  findExistingDuplicateGroups,
  isDuplicateWord,
  normalizeWordKey,
  planFolderMove,
} from '../../src/features/cards/duplicates';
import type { WordCard } from '../../src/types';

function card(id: string, word: string, folderId?: string, meaning = ''): WordCard {
  return { id, word, meaning, note: '', ...(folderId ? { folderId } : {}) };
}

test('comparison trims, folds case and normalises Unicode', () => {
  assert.equal(normalizeWordKey('  Example  '), 'example');
  assert.equal(normalizeWordKey('EXAMPLE'), normalizeWordKey('example'));
  // Accented Latin: composed é and decomposed e + combining acute are one word.
  assert.equal(normalizeWordKey('café'), normalizeWordKey('café'));
  // Japanese: composed が and か + combining dakuten are one word.
  assert.equal(normalizeWordKey('が'), normalizeWordKey('が'));
  // Case folding is a no-op for scripts without case, and must not damage them.
  assert.equal(normalizeWordKey(' 自発的 '), '自発的');
});

test('a duplicate is scoped to its folder, so the same word can live in two', () => {
  const cards = [card('a', 'example', 'f1'), card('b', 'other', 'f2')];
  assert.equal(isDuplicateWord(cards, 'Example', 'f1'), true);
  assert.equal(isDuplicateWord(cards, 'example', 'f2'), false);
  // Unfiled words form their own bucket rather than matching every folder.
  assert.equal(isDuplicateWord(cards, 'example', undefined), false);
});

test('a different meaning alone does not make a new word', () => {
  const cards = [card('a', 'bank', 'f1', 'a place for money')];
  assert.equal(isDuplicateWord(cards, 'bank', 'f1'), true);
  assert.equal(findDuplicateCard(cards, 'bank', 'f1')?.id, 'a');
});

test('editing a card does not match it against itself', () => {
  const cards = [card('a', 'example', 'f1'), card('b', 'other', 'f1')];
  // Re-saving the same word on the card being edited is not a collision.
  assert.equal(findDuplicateCard(cards, 'example', 'f1', 'a'), null);
  // Renaming it onto a word another card already holds is.
  assert.equal(findDuplicateCard(cards, 'other', 'f1', 'a')?.id, 'b');
});

test('an empty or whitespace-only word is never a duplicate', () => {
  const cards = [card('a', 'example', 'f1')];
  assert.equal(findDuplicateCard(cards, '   ', 'f1'), null);
  assert.equal(new FolderWordIndex(cards).has('', 'f1'), false);
});

test('the index reports the first claim and rejects repeats', () => {
  const index = new FolderWordIndex([card('a', 'stored', 'f1')]);
  assert.equal(index.add('stored', 'f1'), false, 'already present');
  assert.equal(index.add('fresh', 'f1'), true);
  assert.equal(index.add('FRESH', 'f1'), false, 'same word, different case');
  assert.equal(index.add('fresh', 'f2'), true, 'other folder is a separate bucket');
});

test('existing duplicates are reported, never merged or deleted', () => {
  const cards = [
    card('a', 'example', 'f1'),
    card('b', 'Example', 'f1'),
    card('c', 'example', 'f2'),
    card('d', 'unique', 'f1'),
  ];
  const groups = findExistingDuplicateGroups(cards);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].cardIds, ['a', 'b']);
  assert.equal(groups[0].folderId, 'f1');
  // The audit is read-only: every card is still present and unchanged.
  assert.equal(cards.length, 4);
});

test('a move leaves behind only the words the target folder already has', () => {
  const cards = [
    card('a', 'example', 'f1'),
    card('b', 'unique', 'f1'),
    card('c', 'Example', 'f2'),
  ];
  const plan = planFolderMove(cards, ['a', 'b'], 'f2');
  assert.deepEqual(plan.movableIds, ['b']);
  assert.deepEqual(plan.blockedIds, ['a']);
});

test('a move batch cannot land two copies of the same word', () => {
  const cards = [card('a', 'example', 'f1'), card('b', 'EXAMPLE', 'f1')];
  const plan = planFolderMove(cards, ['a', 'b'], 'f2');
  assert.deepEqual(plan.movableIds, ['a']);
  assert.deepEqual(plan.blockedIds, ['b']);
});

test('a card already in the target folder is never blocked by itself', () => {
  const cards = [card('a', 'example', 'f2')];
  const plan = planFolderMove(cards, ['a'], 'f2');
  assert.deepEqual(plan.movableIds, ['a']);
  assert.deepEqual(plan.blockedIds, []);
});
