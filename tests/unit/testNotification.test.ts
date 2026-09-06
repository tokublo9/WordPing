import assert from 'node:assert/strict';
import test from 'node:test';
import { pickTestNotificationCard } from '../../src/features/notifications/testNotification';
import type { FolderNotifSettings, WordCard } from '../../src/types';

/**
 * Which word Send Test previews.
 *
 * The scheduler's rule is covered by notificationCandidates.test.ts. What is
 * covered here is the one place Send Test deliberately parts company with it:
 * the button has to answer "does a notification reach my phone?" for someone
 * who has not set notifications up yet, so it falls back where the schedule
 * stops. The ordering is the whole contract — a real candidate first, any saved
 * word second, and nothing at all only when there is genuinely nothing to send.
 */

const NOW = Date.parse('2026-09-05T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function word(id: string, extra: Partial<WordCard> = {}): WordCard {
  return { id, word: id, meaning: id, note: '', ...extra };
}

/** Deterministic in place of Math.random, so the tier is what is asserted. */
const first = () => 0;
const last = (length: number) => length - 1;

const LIST_ONLY: FolderNotifSettings = { intervalSeconds: 3600, displayOnlyWord: false };
const ALL_WORDS: FolderNotifSettings = { ...LIST_ONLY, notifyAllWords: true };
const NOTIFS_OFF: FolderNotifSettings = { intervalSeconds: 0, displayOnlyWord: false };

const PICKED = word('picked', { notifCandidate: true });
const NOT_PICKED = word('not-picked');

// ── The first tier: a real candidate ─────────────────────────────────────────

test('a word on the list is preferred, so the preview is the real thing', () => {
  const chosen = pickTestNotificationCard([NOT_PICKED, PICKED], LIST_ONLY, NOW, first);
  assert.equal(chosen, PICKED);
  // Both ends of the pool are reachable — the pick is over the candidates, not
  // a fixed one of them.
  assert.equal(
    pickTestNotificationCard([PICKED, word('also', { notifCandidate: true })], LIST_ONLY, NOW, last)?.id,
    'also',
  );
});

test('"Notify All Words" makes the whole folder the first tier', () => {
  assert.equal(pickTestNotificationCard([NOT_PICKED], ALL_WORDS, NOW, first), NOT_PICKED);
});

test('a candidate inside its hide window is not the first tier', () => {
  // Hidden by a grade: out of the schedule's rotation, so it is not what the
  // preview claims to be previewing.
  const hidden = word('hidden', { notifCandidate: true, hiddenUntil: NOW + HOUR });
  const chosen = pickTestNotificationCard([hidden, NOT_PICKED], LIST_ONLY, NOW, first);
  assert.equal(chosen, NOT_PICKED, 'it falls through to the saved-words tier');
});

// ── The second tier: any saved word ──────────────────────────────────────────

test('with nothing on the list it still sends, from every saved word', () => {
  const cards = [word('a'), word('b')];
  assert.equal(pickTestNotificationCard(cards, LIST_ONLY, NOW, first)?.id, 'a');
  assert.equal(pickTestNotificationCard(cards, LIST_ONLY, NOW, last)?.id, 'b');
});

test('no interval, no settings at all, and a folder set to Off all still send', () => {
  const cards = [word('a')];
  for (const settings of [undefined, NOTIFS_OFF, LIST_ONLY]) {
    assert.equal(
      pickTestNotificationCard(cards, settings, NOW, first)?.id,
      'a',
      `settings ${JSON.stringify(settings)} must not stop a test`,
    );
  }
});

test('the hide window does not empty the fallback tier', () => {
  // Every word is inside a grade's hide window. That is a scheduling rule, and
  // this is the button that works when the schedule would not — reporting "add
  // a word first" to someone whose folder is full of words would be a lie.
  const cards = [word('a', { hiddenUntil: NOW + HOUR }), word('b', { hiddenUntil: NOW + HOUR })];
  assert.equal(pickTestNotificationCard(cards, LIST_ONLY, NOW, first)?.id, 'a');
});

// ── Nothing to send ──────────────────────────────────────────────────────────

test('an empty folder sends nothing rather than an empty notification', () => {
  assert.equal(pickTestNotificationCard([], LIST_ONLY, NOW, first), null);
  assert.equal(pickTestNotificationCard([], ALL_WORDS, NOW, first), null);
});

test('a word with no text is never chosen, on either tier', () => {
  const blank = word('blank', { word: '   ', notifCandidate: true });
  assert.equal(pickTestNotificationCard([blank], LIST_ONLY, NOW, first), null);
  assert.equal(pickTestNotificationCard([blank], ALL_WORDS, NOW, first), null);
  assert.equal(pickTestNotificationCard([blank, NOT_PICKED], LIST_ONLY, NOW, first), NOT_PICKED);
});

// ── It decides nothing ───────────────────────────────────────────────────────

test('picking a word changes no card', () => {
  const cards = [word('a'), word('b')];
  const before = JSON.stringify(cards);
  pickTestNotificationCard(cards, LIST_ONLY, NOW, first);
  assert.equal(JSON.stringify(cards), before, 'a preview is not a setting');
});
