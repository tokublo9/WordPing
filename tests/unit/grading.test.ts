import assert from 'node:assert/strict';
import test from 'node:test';
import { gradeCard } from '../../src/features/cards/grading';
import {
  DONT_KNOW_HIDE_MS,
  NOT_REALLY_HIDE_MS,
  PRETTY_GOOD_HIDE_MS,
  cardsForVisibility,
  isCardHidden,
  visibleCards,
} from '../../src/features/cards/visibility';
import { mergeVisibleCardOrder, sortByRating } from '../../src/features/cards/cardSorting';
import { SYNC_WITH_TEST_RESULTS_ENABLED } from '../../src/features/flags';
import { migrateSchema } from '../../src/lib/sqlite/schema';
import { readWords, writeSnapshot } from '../../src/lib/sqlite/repositories';
import type { WordCard } from '../../src/types';
import { openTestDatabase } from './support/sqljs';

const NOW = Date.parse('2026-08-19T12:00:00Z');

function card(id: string, extra: Partial<WordCard> = {}): WordCard {
  return { id, word: id, meaning: id, note: '', folderId: 'f1', ...extra };
}

const SYNC_ON = { now: NOW, syncTestResults: true };
const SYNC_OFF = { now: NOW, syncTestResults: false };

/** Exactly what App.tsx's onUpdateCard does to the card in React state. */
function applyPatch(target: WordCard, patch: Partial<WordCard>): WordCard {
  return { ...target, ...patch };
}

// ── The grade → patch rule ───────────────────────────────────────────────────

test('the app-wide flag always selects the synced grading path', () => {
  assert.equal(SYNC_WITH_TEST_RESULTS_ENABLED, true);
  assert.equal(gradeCard(card('w1'), 'perfect', {
    now: NOW,
    syncTestResults: SYNC_WITH_TEST_RESULTS_ENABLED,
  }).action, 'delete');

  const good = gradeCard(card('w2'), 'good', {
    now: NOW,
    syncTestResults: SYNC_WITH_TEST_RESULTS_ENABLED,
  });
  assert.ok(good.action === 'update');
  assert.equal(good.patch.hiddenUntil, NOW + PRETTY_GOOD_HIDE_MS);
});

test('the four grades follow the sync table exactly', () => {
  // Perfect!    → delete
  // Pretty good → hide 72 h
  // Not really  → hide 24 h
  // Don't know  → hide 1 h
  const perfect = gradeCard(card('w1'), 'perfect', SYNC_ON);
  assert.equal(perfect.action, 'delete');

  const good = gradeCard(card('w1'), 'good', SYNC_ON);
  assert.ok(good.action === 'update');
  assert.equal(good.patch.hiddenUntil, NOW + PRETTY_GOOD_HIDE_MS);
  assert.equal(good.patch.hiddenUntil, NOW + 72 * 60 * 60 * 1000);

  const slightly = gradeCard(card('w1'), 'slightly', SYNC_ON);
  assert.ok(slightly.action === 'update');
  assert.equal(slightly.patch.hiddenUntil, NOW + NOT_REALLY_HIDE_MS);
  assert.equal(slightly.patch.hiddenUntil, NOW + 24 * 60 * 60 * 1000);

  const unknown = gradeCard(card('w1'), 'unknown', SYNC_ON);
  assert.ok(unknown.action === 'update');
  assert.equal(unknown.patch.hiddenUntil, NOW + DONT_KNOW_HIDE_MS);
  assert.equal(unknown.patch.hiddenUntil, NOW + 60 * 60 * 1000);
  // The postponement matches the hide, so the card cannot come back to Test
  // Mode while it is still invisible in the list it would be studied from.
  assert.equal(unknown.patch.testNextReview, unknown.patch.hiddenUntil);
});

test('Pretty good hides three times as long as Not really', () => {
  const good = gradeCard(card('w1'), 'good', SYNC_ON);
  const slightly = gradeCard(card('w1'), 'slightly', SYNC_ON);
  assert.ok(good.action === 'update' && slightly.action === 'update');
  assert.equal(
    (good.patch.hiddenUntil as number) - NOW,
    ((slightly.patch.hiddenUntil as number) - NOW) * 3,
  );
});

test('with the toggle off no sync-controlled visibility field is changed', () => {
  for (const kind of ['perfect', 'good', 'slightly', 'unknown'] as const) {
    const outcome = gradeCard(card('w1', { hiddenUntil: NOW + 10_000 }), kind, SYNC_OFF);
    assert.equal(outcome.action, 'update', kind);
    assert.ok(!('hiddenUntil' in outcome.patch), kind);
  }
  // And the existing scoring survives untouched.
  const good = gradeCard(card('w1'), 'good', SYNC_OFF);
  assert.ok(good.action === 'update');
  assert.equal(good.patch.testLevel, 'good');
  assert.equal(good.patch.testNextReview, NOW + 3 * 24 * 60 * 60 * 1000);

  const slightly = gradeCard(card('w1'), 'slightly', SYNC_OFF);
  assert.ok(slightly.action === 'update');
  assert.equal(slightly.patch.testLevel, 'slightly');
  assert.equal(slightly.patch.testNextReview, NOW + 24 * 60 * 60 * 1000);
});

test('the spaced-repetition schedule is unchanged by the hide', () => {
  // hiddenUntil governs the word list; testNextReview governs the test queue.
  // They are set independently, and the toggle only touches the former.
  const good = gradeCard(card('w1'), 'good', SYNC_ON);
  const slightly = gradeCard(card('w1'), 'slightly', SYNC_ON);
  assert.ok(good.action === 'update' && slightly.action === 'update');
  assert.equal(good.patch.testNextReview, NOW + 3 * 24 * 60 * 60 * 1000);
  assert.equal(slightly.patch.testNextReview, NOW + 24 * 60 * 60 * 1000);
});

test('Perfect deletes only with sync on', () => {
  assert.equal(gradeCard(card('w1'), 'perfect', SYNC_ON).action, 'delete');
  const retained = gradeCard(card('w1'), 'perfect', SYNC_OFF);
  assert.equal(retained.action, 'update');
  assert.ok(retained.action === 'update');
  assert.equal(retained.patch.testLevel, 'perfect');
  assert.equal(retained.patch.testMastered, true);
});

test('every grade appends one review-history entry', () => {
  const existing = card('w1', { reviewHistory: [{ ts: 1, rating: 'unknown' }] });
  const outcome = gradeCard(existing, 'good', SYNC_ON);
  assert.deepEqual(
    outcome.action === 'update' ? outcome.patch.reviewHistory : null,
    [{ ts: 1, rating: 'unknown' }, { ts: NOW, rating: 'good' }],
  );
  // The card it was graded from is never mutated.
  assert.deepEqual(existing.reviewHistory, [{ ts: 1, rating: 'unknown' }]);
});

// ── Grade → in-memory state → canonical selector ─────────────────────────────

test('a Pretty good card leaves the visible list immediately and returns after 72 h', () => {
  const outcome = gradeCard(card('w1'), 'good', SYNC_ON);
  assert.equal(outcome.action, 'update');
  const graded = applyPatch(card('w1'), outcome.action === 'update' ? outcome.patch : {});
  const folder = [card('w0'), graded, card('w2')];

  // The same expression useCards' folderCards memo evaluates.
  assert.deepEqual(visibleCards(folder, NOW).map(c => c.id), ['w0', 'w2']);
  assert.deepEqual(
    visibleCards(folder, NOW + PRETTY_GOOD_HIDE_MS - 1).map(c => c.id),
    ['w0', 'w2'],
  );
  assert.deepEqual(
    visibleCards(folder, NOW + PRETTY_GOOD_HIDE_MS).map(c => c.id),
    ['w0', 'w1', 'w2'],
  );
});

test('a graded card leaves the list, and nothing can bring it back early', () => {
  const goodOutcome = gradeCard(card('good'), 'good', SYNC_ON);
  const folder = [
    applyPatch(card('good'), goodOutcome.action === 'update' ? goodOutcome.patch : {}),
    card('slightly', { testLevel: 'slightly', hiddenUntil: NOW + NOT_REALLY_HIDE_MS }),
    card('unknown', { testLevel: 'unknown' }),
    card('ungraded'),
  ];

  // One rule decides the list: inside its hide, or not. There is no filter to
  // override it — the words resting under a result are reached through that
  // colour's own sheet, which lists them without changing the list underneath.
  assert.deepEqual(cardsForVisibility(folder, NOW).map(c => c.id), ['unknown', 'ungraded']);
  assert.deepEqual(
    cardsForVisibility(folder, NOW + NOT_REALLY_HIDE_MS).map(c => c.id),
    ['slightly', 'unknown', 'ungraded'],
  );
});

test('a Not really card leaves the visible list and returns after 24 h', () => {
  const outcome = gradeCard(card('w1'), 'slightly', SYNC_ON);
  assert.ok(outcome.action === 'update');
  const graded = applyPatch(card('w1'), outcome.patch);
  const folder = [card('w0'), graded];

  assert.deepEqual(visibleCards(folder, NOW).map(c => c.id), ['w0']);
  assert.deepEqual(visibleCards(folder, NOW + NOT_REALLY_HIDE_MS - 1).map(c => c.id), ['w0']);
  assert.deepEqual(visibleCards(folder, NOW + NOT_REALLY_HIDE_MS).map(c => c.id), ['w0', 'w1']);
  // Still hidden at the point a Pretty good card would only be halfway through.
  assert.deepEqual(visibleCards(folder, NOW + PRETTY_GOOD_HIDE_MS).map(c => c.id), ['w0', 'w1']);
});

test("a Don't know card leaves the visible list and returns after 1 h", () => {
  // Regraded down from Pretty good, so the long hide has to be replaced by the
  // short one rather than left in place or simply cleared.
  const original = card('w1', { testLevel: 'good', hiddenUntil: NOW + PRETTY_GOOD_HIDE_MS });
  const outcome = gradeCard(original, 'unknown', SYNC_ON);
  assert.ok(outcome.action === 'update');
  const graded = applyPatch(original, outcome.patch);

  assert.equal(isCardHidden(graded, NOW), true);
  assert.deepEqual(visibleCards([graded], NOW).map(c => c.id), []);
  assert.deepEqual(visibleCards([graded], NOW + DONT_KNOW_HIDE_MS - 1).map(c => c.id), []);
  assert.deepEqual(visibleCards([graded], NOW + DONT_KNOW_HIDE_MS).map(c => c.id), ['w1']);
});

test('Not really hides 24 times as long as Don\'t know', () => {
  const slightly = gradeCard(card('w1'), 'slightly', SYNC_ON);
  const unknown = gradeCard(card('w1'), 'unknown', SYNC_ON);
  assert.ok(slightly.action === 'update' && unknown.action === 'update');
  assert.equal(
    (slightly.patch.hiddenUntil as number) - NOW,
    ((unknown.patch.hiddenUntil as number) - NOW) * 24,
  );
});

test('regrading refreshes each retained hide from the latest grading time', () => {
  const previouslyHidden = card('w1', { hiddenUntil: NOW - 1 });
  const good = gradeCard(previouslyHidden, 'good', SYNC_ON);
  const slightly = gradeCard(previouslyHidden, 'slightly', SYNC_ON);
  assert.ok(good.action === 'update' && slightly.action === 'update');
  assert.equal(good.patch.hiddenUntil, NOW + PRETTY_GOOD_HIDE_MS);
  assert.equal(slightly.patch.hiddenUntil, NOW + NOT_REALLY_HIDE_MS);
});

test('with sync off the same grade leaves the card on screen', () => {
  const outcome = gradeCard(card('w1'), 'good', SYNC_OFF);
  const graded = applyPatch(card('w1'), outcome.action === 'update' ? outcome.patch : {});
  assert.deepEqual(visibleCards([graded], NOW).map(c => c.id), ['w1']);
});

// ── Ordering must not destroy hidden cards ───────────────────────────────────

test('sorting the visible list keeps the hidden card in state', () => {
  // replaceFolderOrder merges a sorted *visible* list back into the folder's
  // full contents. Without the merge the hidden card was dropped from state and
  // the next persist deleted its row.
  const hidden = card('w1', { hiddenUntil: NOW + PRETTY_GOOD_HIDE_MS, testLevel: 'good' });
  const inFolder = [card('w0', { testLevel: 'unknown' }), hidden, card('w2', { testLevel: 'perfect' })];
  const visible = visibleCards(inFolder, NOW) as WordCard[];
  const merged = mergeVisibleCardOrder(inFolder, sortByRating(visible, 'highest'));

  assert.deepEqual(merged.map(c => c.id).sort(), ['w0', 'w1', 'w2']);
  assert.ok(merged.some(c => c.id === 'w1' && isCardHidden(c, NOW)));
  // The hidden card keeps its own slot; only visible slots are reordered.
  assert.equal(merged[1]?.id, 'w1');
});

test('a drag that omits the hidden card cannot delete it', () => {
  const hidden = card('w1', { hiddenUntil: NOW + 1_000 });
  const inFolder = [card('w0'), hidden, card('w2')];
  const dragged = [card('w2'), card('w0')]; // user swapped the two visible rows
  const merged = mergeVisibleCardOrder(inFolder, dragged);
  assert.deepEqual(merged.map(c => c.id), ['w2', 'w1', 'w0']);
});

// ── Grade → SQLite → relaunch ────────────────────────────────────────────────

test('a Pretty good hide survives a write/read round trip', async () => {
  const db = await openTestDatabase();
  await migrateSchema(db);

  const outcome = gradeCard(card('w1'), 'good', SYNC_ON);
  const graded = applyPatch(card('w1'), outcome.action === 'update' ? outcome.patch : {});
  await writeSnapshot(db, {
    folders: [{ id: 'f1', name: 'Nouns', createdAt: 1 }],
    cards: [card('w0'), graded],
  });

  const reloaded = await readWords(db);
  const restored = reloaded.find(c => c.id === 'w1');
  assert.equal(restored?.hiddenUntil, NOW + PRETTY_GOOD_HIDE_MS);
  assert.equal(restored?.testLevel, 'good');
  assert.deepEqual(restored?.reviewHistory, [{ ts: NOW, rating: 'good' }]);
  // Still hidden after the relaunch, and nothing was deleted.
  assert.equal(reloaded.length, 2);
  assert.deepEqual(visibleCards(reloaded, NOW).map(c => c.id), ['w0']);
});

test('a synced Perfect result is removed from SQLite', async () => {
  const db = await openTestDatabase();
  await migrateSchema(db);
  await writeSnapshot(db, {
    folders: [{ id: 'f1', name: 'Nouns', createdAt: 1 }],
    cards: [card('w0'), card('w1')],
  });
  const outcome = gradeCard(card('w1'), 'perfect', SYNC_ON);
  assert.equal(outcome.action, 'delete');
  await writeSnapshot(db, { cards: [card('w0')] });
  const restored = await readWords(db);
  assert.deepEqual(restored.map(c => c.id), ['w0']);
});

test('clearing the test result un-hides the card in SQLite too', async () => {
  const db = await openTestDatabase();
  await migrateSchema(db);
  await writeSnapshot(db, {
    folders: [{ id: 'f1', name: 'Nouns', createdAt: 1 }],
    cards: [card('w1', { testLevel: 'good', hiddenUntil: NOW + PRETTY_GOOD_HIDE_MS })],
  });

  // What Test Mode's Reset and the word editor's "clear test result" now write.
  await writeSnapshot(db, { cards: [card('w1')] });

  const [restored] = await readWords(db);
  assert.equal(restored?.hiddenUntil, undefined);
  assert.equal(isCardHidden(restored!, NOW), false);
});
