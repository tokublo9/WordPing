import assert from 'node:assert/strict';
import test from 'node:test';
import { planFolderDeletion } from '../../src/features/folders/folderDeletion';
import type { Folder, WordCard } from '../../src/types';

const folders: Folder[] = [
  { id: 'a', name: 'A', createdAt: 1 },
  { id: 'b', name: 'B', createdAt: 2 },
];
const cards: WordCard[] = [
  { id: 'one', word: 'one', meaning: '1', note: '', folderId: 'a' },
  { id: 'two', word: 'two', meaning: '2', note: '', folderId: 'b' },
  { id: 'orphan', word: 'orphan', meaning: '3', note: '' },
];

test('deleting the final folder removes its cards and any hidden orphan cards', () => {
  const result = planFolderDeletion([folders[0]], [cards[0], cards[2]], new Set(['a']));
  assert.deepEqual(result?.folders, []);
  assert.deepEqual(result?.cards, []);
  assert.deepEqual(result?.deletedCards.map(card => card.id), ['one', 'orphan']);
});

test('selecting every folder removes every card', () => {
  const result = planFolderDeletion(folders, cards, new Set(['a', 'b']));
  assert.deepEqual(result?.cards, []);
  assert.equal(result?.deletedCards.length, 3);
});

test('deleting one of several folders deletes only its cards', () => {
  const result = planFolderDeletion(folders, cards, new Set(['a']));
  assert.deepEqual(result?.folders.map(folder => folder.id), ['b']);
  assert.deepEqual(result?.cards.map(card => card.id), ['two', 'orphan']);
  assert.deepEqual(result?.deletedCards.map(card => card.id), ['one']);
});
