import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasExistingTestResults,
  parseTutorialFlag,
  resolveResultFilterMigration,
  serializeTutorialFlag,
  shouldShowResultFilterTutorial,
  shouldShowResultFilters,
} from '../../src/features/onboarding/tutorialState';
import { gradeCard } from '../../src/features/cards/grading';
import { shouldShowCard } from '../../src/features/cards/visibility';
import { ALL_LEVEL_KEYS, countCardsByResult } from '../../src/features/cards/levels';
import type { WordCard } from '../../src/types';

function card(overrides: Partial<WordCard> = {}): WordCard {
  return { id: 'a', word: 'example', meaning: '', note: '', ...overrides };
}

/**
 * The state machine behind the result-colour filters.
 *
 * The single rule under test: the filters stay hidden until the user has
 * dismissed the tutorial. Answering a card makes the tutorial *due*; it does not
 * reveal anything by itself.
 */

/** A genuinely new user: nothing stored, nothing graded. */
const NEW_USER = {
  hasSeenResultFilterTutorial: false,
  hasCompletedFirstTestAnswer: false,
  isAppReady: true,
  isTestModeOpen: false,
  isScreenBusy: false,
};

test('an absent or malformed flag means "not seen"', () => {
  for (const raw of [null, undefined, '', 'TRUE', '1', 'yes', 'seen']) {
    assert.equal(parseTutorialFlag(raw), false, `${String(raw)} must not count as seen`);
  }
  assert.equal(parseTutorialFlag('true'), true);
  assert.equal(parseTutorialFlag(serializeTutorialFlag(true)), true);
  assert.equal(parseTutorialFlag(serializeTutorialFlag(false)), false);
});

// ── 1–6, 9: visibility follows the dismissal, and nothing else ────────────────

test('1. a new user sees no filters before answering anything', () => {
  assert.equal(shouldShowResultFilters({ hasSeenResultFilterTutorial: false }), false);
  assert.equal(shouldShowResultFilterTutorial(NEW_USER), false);
});

test('2. answering the first card leaves the filters hidden during the test', () => {
  const answered = { ...NEW_USER, hasCompletedFirstTestAnswer: true, isTestModeOpen: true };
  assert.equal(shouldShowResultFilters(answered), false, 'an answer alone reveals nothing');
  assert.equal(shouldShowResultFilterTutorial(answered), false, 'the test is not interrupted');
});

test('3. finishing the test shows the tutorial', () => {
  assert.equal(
    shouldShowResultFilterTutorial({
      ...NEW_USER, hasCompletedFirstTestAnswer: true, isTestModeOpen: false,
    }),
    true,
  );
});

test('4. quitting after answering shows the tutorial too', () => {
  // Finishing and quitting are the same state to this rule: Test Mode is closed
  // and a card has been graded. There is no separate "how it ended" flag.
  assert.equal(
    shouldShowResultFilterTutorial({
      ...NEW_USER, hasCompletedFirstTestAnswer: true, isTestModeOpen: false,
    }),
    true,
  );
});

test('5. the filters stay hidden while the tutorial is on screen', () => {
  const showing = { ...NEW_USER, hasCompletedFirstTestAnswer: true };
  assert.equal(shouldShowResultFilterTutorial(showing), true);
  assert.equal(shouldShowResultFilters(showing), false);
});

test('6. dismissing the tutorial is what reveals the filters', () => {
  const dismissed = {
    ...NEW_USER, hasCompletedFirstTestAnswer: true, hasSeenResultFilterTutorial: true,
  };
  assert.equal(shouldShowResultFilters(dismissed), true);
  assert.equal(shouldShowResultFilterTutorial(dismissed), false);
});

test('9. a dismissed tutorial never returns on its own', () => {
  for (const state of [
    { isTestModeOpen: true }, { isScreenBusy: true }, { isAppReady: false }, {},
  ]) {
    assert.equal(
      shouldShowResultFilterTutorial({
        ...NEW_USER,
        hasCompletedFirstTestAnswer: true,
        hasSeenResultFilterTutorial: true,
        ...state,
      }),
      false,
    );
  }
});

// ── 7–8: force-close recovery ────────────────────────────────────────────────

test('7. a force-close after answering shows the tutorial on the next launch', () => {
  // Nothing records how the previous session ended, and nothing needs to: the
  // stored answer flag plus an undismissed tutorial is the whole condition.
  assert.equal(
    shouldShowResultFilterTutorial({
      ...NEW_USER, hasCompletedFirstTestAnswer: true,
    }),
    true,
  );
});

test('8. the filters stay hidden after a force-close, until it is dismissed', () => {
  assert.equal(
    shouldShowResultFilters({ hasSeenResultFilterTutorial: false }),
    false,
    'an answered card must not reveal the filters across a restart',
  );
});

test('nothing appears before bootstrap has read the stored flags', () => {
  assert.equal(
    shouldShowResultFilterTutorial({
      ...NEW_USER, hasCompletedFirstTestAnswer: true, isAppReady: false,
    }),
    false,
  );
});

test('nothing appears while another modal owns the screen', () => {
  assert.equal(
    shouldShowResultFilterTutorial({
      ...NEW_USER, hasCompletedFirstTestAnswer: true, isScreenBusy: true,
    }),
    false,
  );
});

test('11. quitting without answering shows nothing', () => {
  assert.equal(shouldShowResultFilterTutorial({ ...NEW_USER, isTestModeOpen: false }), false);
});

test('a single-card test qualifies like any other: one answer is enough', () => {
  assert.equal(
    shouldShowResultFilterTutorial({ ...NEW_USER, hasCompletedFirstTestAnswer: true }),
    true,
  );
});

// ── 10: existing-user migration ──────────────────────────────────────────────

test('10. an existing user with results keeps their filters, untaught', () => {
  const migration = resolveResultFilterMigration({
    alreadyMigrated: false,
    hasSeenResultFilterTutorial: false,
    hasHistoricalResults: true,
  });
  assert.deepEqual(migration, { shouldMarkMigrated: true, shouldMarkTutorialSeen: true });

  // After migration the ordinary rules apply, and both come out right.
  const migrated = { ...NEW_USER, hasSeenResultFilterTutorial: true };
  assert.equal(shouldShowResultFilters(migrated), true);
  assert.equal(
    shouldShowResultFilterTutorial({ ...migrated, hasCompletedFirstTestAnswer: true }),
    false,
    'an experienced user is never taught a feature they already use',
  );
});

test('a new user is not migrated, so the tutorial still awaits them', () => {
  const migration = resolveResultFilterMigration({
    alreadyMigrated: false,
    hasSeenResultFilterTutorial: false,
    hasHistoricalResults: false,
  });
  assert.deepEqual(migration, { shouldMarkMigrated: true, shouldMarkTutorialSeen: false });
});

test('the migration check runs once and cannot reclassify a new user later', () => {
  // The same user, after earning results of their own. Without the marker this
  // would treat them as an existing user and skip the tutorial they are owed.
  const migration = resolveResultFilterMigration({
    alreadyMigrated: true,
    hasSeenResultFilterTutorial: false,
    hasHistoricalResults: true,
  });
  assert.deepEqual(migration, { shouldMarkMigrated: false, shouldMarkTutorialSeen: false });
});

test('a stored dismissal is never rewritten by the migration', () => {
  const migration = resolveResultFilterMigration({
    alreadyMigrated: false,
    hasSeenResultFilterTutorial: true,
    hasHistoricalResults: true,
  });
  assert.equal(migration.shouldMarkTutorialSeen, false);
  assert.equal(migration.shouldMarkMigrated, true);
});

test('any stored form of a past result counts as historical', () => {
  assert.equal(hasExistingTestResults([card()]), false);
  assert.equal(hasExistingTestResults([card({ testLevel: 'good' })]), true);
  assert.equal(hasExistingTestResults([card({ testMastered: true })]), true);
  assert.equal(hasExistingTestResults([card({ testNextReview: 1 })]), true);
  assert.equal(hasExistingTestResults([card({ reviewHistory: [{ ts: 1, rating: 'good' }] })]), true);
  assert.equal(hasExistingTestResults([card(), card({ testLevel: 'unknown' })]), true);
});

// ── 12: the mapping holds with sync on and off ───────────────────────────────

test('12. Perfect deletes only when sync is on; the level is stored otherwise', () => {
  const synced = gradeCard(card(), 'perfect', { now: 1_000, syncTestResults: true });
  assert.equal(synced.action, 'delete');

  const unsynced = gradeCard(card(), 'perfect', { now: 1_000, syncTestResults: false });
  assert.equal(unsynced.action, 'update');
  if (unsynced.action !== 'update') return;
  assert.equal(unsynced.patch.testLevel, 'perfect');
  assert.equal(unsynced.patch.testMastered, true);
});

test('12. Perfect has no chip in either configuration', () => {
  // Not in the filter list, so no chip can ever be set to it...
  assert.equal((ALL_LEVEL_KEYS as readonly string[]).includes('perfect'), false);
  // ...it is counted by no chip, including the untested one...
  const counts = countCardsByResult([card({ testLevel: 'perfect' })]);
  assert.deepEqual(counts, { good: 0, slightly: 0, unknown: 0, none: 0 });
  // ...and no active filter can select it.
  for (const level of ALL_LEVEL_KEYS) {
    assert.equal(
      shouldShowCard(card({ testLevel: 'perfect' }), { now: 0, activeResultFilter: level }),
      false,
    );
  }
});

test('12. the other three grades store the same level with sync on or off', () => {
  for (const kind of ['good', 'slightly', 'unknown'] as const) {
    for (const syncTestResults of [true, false]) {
      const outcome = gradeCard(card(), kind, { now: 1_000, syncTestResults });
      assert.equal(outcome.action, 'update');
      if (outcome.action !== 'update') return;
      assert.equal(outcome.patch.testLevel, kind, `${kind} with sync=${syncTestResults}`);
    }
  }
});

test('12. only the hide differs between the two configurations', () => {
  // Pretty good and Not really hide the card while sync is on, and change no
  // visibility state at all while it is off.
  for (const kind of ['good', 'slightly'] as const) {
    const on = gradeCard(card(), kind, { now: 1_000, syncTestResults: true });
    const off = gradeCard(card(), kind, { now: 1_000, syncTestResults: false });
    assert.equal(on.action === 'update' && typeof on.patch.hiddenUntil, 'number');
    assert.equal(off.action === 'update' && 'hiddenUntil' in off.patch, false);
  }
  // Don't know never hides, and clears any hide it inherited.
  const unknown = gradeCard(card(), 'unknown', { now: 1_000, syncTestResults: true });
  assert.equal(unknown.action === 'update' && unknown.patch.hiddenUntil, undefined);
});

test('12. an untested card is the grey chip in both configurations', () => {
  assert.deepEqual(
    countCardsByResult([card()]),
    { good: 0, slightly: 0, unknown: 0, none: 1 },
  );
  assert.equal(shouldShowCard(card(), { now: 0, activeResultFilter: 'none' }), true);
});
