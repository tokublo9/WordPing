import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasNoNotifiableWords,
  isNotifCandidate,
  notifiableCards,
  notifiesAllWords,
} from '../../src/features/notifications/notificationCandidates';
import type { FolderNotifSettings, WordCard } from '../../src/types';

const NOW = Date.parse('2026-09-03T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function word(id: string, extra: Partial<WordCard> = {}): WordCard {
  return { id, word: id, meaning: id, note: '', ...extra };
}

const LIST_ONLY: FolderNotifSettings = { intervalSeconds: 3600, displayOnlyWord: false };
const ALL_WORDS: FolderNotifSettings = { ...LIST_ONLY, notifyAllWords: true };
const NOTIFS_OFF: FolderNotifSettings = { intervalSeconds: 0, displayOnlyWord: false };

const PICKED = word('picked', { notifCandidate: true });
const NOT_PICKED = word('not-picked');
const FOLDER_WORDS = [PICKED, NOT_PICKED];

// ── The default ──────────────────────────────────────────────────────────────

test('a newly registered word is not on the list', () => {
  assert.equal(isNotifCandidate(word('fresh')), false);
  assert.equal(isNotifCandidate(word('off', { notifCandidate: false })), false);
  assert.equal(isNotifCandidate(PICKED), true);
});

test('"Notify All Words" is off unless the folder turned it on', () => {
  assert.equal(notifiesAllWords(undefined), false, 'a folder with no settings at all');
  assert.equal(notifiesAllWords(LIST_ONLY), false, 'settings from before the switch existed');
  assert.equal(notifiesAllWords(ALL_WORDS), true);
});

test('by default only the words the user added are eligible', () => {
  assert.deepEqual(
    notifiableCards(FOLDER_WORDS, LIST_ONLY, NOW).map(c => c.id),
    ['picked'],
    'the rest of the folder is not included',
  );
});

// ── The switch ───────────────────────────────────────────────────────────────

test('with the switch on the whole folder is eligible', () => {
  assert.deepEqual(
    notifiableCards(FOLDER_WORDS, ALL_WORDS, NOW).map(c => c.id),
    ['picked', 'not-picked'],
  );
});

test('the switch is per folder, so one folder says nothing about the next', () => {
  const listFolder = notifiableCards(FOLDER_WORDS, LIST_ONLY, NOW).map(c => c.id);
  const allFolder = notifiableCards(FOLDER_WORDS, ALL_WORDS, NOW).map(c => c.id);
  assert.deepEqual(listFolder, ['picked']);
  assert.deepEqual(allFolder, ['picked', 'not-picked']);
});

test('a word resting inside its grade’s hide is out either way', () => {
  const resting = word('resting', {
    notifCandidate: true,
    testLevel: 'unknown',
    testNextReview: NOW + HOUR,
    hiddenUntil: NOW + HOUR,
  });
  assert.deepEqual(notifiableCards([resting], LIST_ONLY, NOW).map(c => c.id), []);
  assert.deepEqual(notifiableCards([resting], ALL_WORDS, NOW).map(c => c.id), []);
  // And it returns on its own when the hide runs out, with nothing written.
  assert.deepEqual(notifiableCards([resting], LIST_ONLY, NOW + HOUR + 1).map(c => c.id), ['resting']);
});

// ── The empty case ───────────────────────────────────────────────────────────

test('an empty list never falls back to the whole folder', () => {
  const noneChosen = [word('a'), word('b'), word('c')];
  assert.deepEqual(
    notifiableCards(noneChosen, LIST_ONLY, NOW),
    [],
    'nothing is scheduled rather than everything',
  );
  assert.equal(hasNoNotifiableWords(noneChosen, LIST_ONLY, NOW), true, 'and the sheet is told');
});

test('the warning fires only when the folder is actually trying to notify', () => {
  const noneChosen = [word('a')];
  assert.equal(hasNoNotifiableWords(noneChosen, NOTIFS_OFF, NOW), false, 'interval 0 is not a problem');
  assert.equal(hasNoNotifiableWords(noneChosen, undefined, NOW), false, 'nor is no settings at all');
  assert.equal(hasNoNotifiableWords(noneChosen, ALL_WORDS, NOW), false, 'nor is the switch on');
  assert.equal(hasNoNotifiableWords(FOLDER_WORDS, LIST_ONLY, NOW), false, 'nor is a list with a word on it');
});

test('a folder whose only chosen word is resting reports as empty', () => {
  // Nothing will arrive until the hide elapses, and the user should be told the
  // list is not currently producing anything rather than left in silence.
  const resting = word('resting', { notifCandidate: true, hiddenUntil: NOW + HOUR });
  assert.equal(hasNoNotifiableWords([resting], LIST_ONLY, NOW), true);
  assert.equal(hasNoNotifiableWords([resting], LIST_ONLY, NOW + HOUR + 1), false);
});

// ── What it does not touch ───────────────────────────────────────────────────

test('reading eligibility writes nothing to a card', () => {
  const graded = word('graded', {
    notifCandidate: true,
    testLevel: 'good',
    testNextReview: NOW + 72 * HOUR,
    hideWord: true,
  });
  const before = JSON.stringify(graded);
  notifiableCards([graded], LIST_ONLY, NOW);
  notifiableCards([graded], ALL_WORDS, NOW);
  hasNoNotifiableWords([graded], LIST_ONLY, NOW);
  assert.equal(JSON.stringify(graded), before, 'grade, interval and Hide Front Word are untouched');
});

test('a word that left the folder cannot be picked', () => {
  // Ownership is the caller's filter, and it runs over the live card array — so
  // a word moved to another folder is simply not in the list handed over, and a
  // deleted one is not in `cards` at all.
  const moved = word('moved', { notifCandidate: true, folderId: 'other' });
  const stayed = word('stayed', { notifCandidate: true, folderId: 'this' });
  const owned = [moved, stayed].filter(c => c.folderId === 'this');
  assert.deepEqual(notifiableCards(owned, LIST_ONLY, NOW).map(c => c.id), ['stayed']);
});
