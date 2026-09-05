import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NO_TEST_INTRO_SEEN,
  TEST_INTRO_KEYS,
  TEST_INTRO_STEPS,
  hasExistingTestResults,
  markTestIntroSeen,
  nextTestIntroStep,
  parseTutorialFlag,
  resolveResultFilterMigration,
  serializeTutorialFlag,
  shouldShowResultFilters,
  type TestIntroInput,
  type TestIntroStep,
} from '../../src/features/onboarding/tutorialState';
import { gradeCard } from '../../src/features/cards/grading';
import { shouldShowCard } from '../../src/features/cards/visibility';
import { matchesResultFilter } from '../../src/features/cards/testSchedule';
import { ALL_LEVEL_KEYS, countCardsByResult } from '../../src/features/cards/levels';
import type { WordCard } from '../../src/types';

function card(overrides: Partial<WordCard> = {}): WordCard {
  return { id: 'a', word: 'example', meaning: '', note: '', ...overrides };
}

/**
 * The Test Mode introduction, and the rule that reveals the result filters.
 *
 * The introduction is three popups shown once each, in a fixed order. The rule
 * under test is that `nextTestIntroStep` answers with at most one of them, that
 * the order cannot be jumped, and that an interrupted run resumes where it
 * stopped rather than skipping ahead.
 */

/** In Test Mode with a card on screen, nothing seen and nothing done yet. */
const FRESH: TestIntroInput = {
  seen: NO_TEST_INTRO_SEEN,
  loaded: true,
  hasCard: true,
  hasRevealedAnswers: false,
  hasAnswered: false,
  isScreenBusy: false,
};

function seenUpTo(...steps: TestIntroStep[]) {
  return steps.reduce(markTestIntroSeen, NO_TEST_INTRO_SEEN);
}

test('an absent or malformed flag means "not seen"', () => {
  for (const raw of [null, undefined, '', 'TRUE', '1', 'yes', 'seen']) {
    assert.equal(parseTutorialFlag(raw), false, `${String(raw)} must not count as seen`);
  }
  assert.equal(parseTutorialFlag('true'), true);
  assert.equal(parseTutorialFlag(serializeTutorialFlag(true)), true);
  assert.equal(parseTutorialFlag(serializeTutorialFlag(false)), false);
});

// ── The three-step introduction ──────────────────────────────────────────────

test('1. opening Test Mode raises the first popup, and nothing else', () => {
  assert.equal(nextTestIntroStep(FRESH), 'opened');
  // It says to tap the card; it must not be conditional on the card having been
  // tapped, flipped, or answered.
  assert.equal(nextTestIntroStep({ ...FRESH, hasRevealedAnswers: true }), 'opened');
  assert.equal(nextTestIntroStep({ ...FRESH, hasAnswered: true }), 'opened');
});

test('2. with no card there is nothing to point at, so nothing is shown', () => {
  // An empty queue opens straight onto the completion screen. The step stays
  // unseen, so the first real session still gets it.
  assert.equal(nextTestIntroStep({ ...FRESH, hasCard: false }), null);
});

test('3. the second popup waits for the answers to be uncovered', () => {
  const afterFirst = { ...FRESH, seen: seenUpTo('opened') };
  assert.equal(nextTestIntroStep(afterFirst), null, 'the card has not been turned over');
  assert.equal(nextTestIntroStep({ ...afterFirst, hasRevealedAnswers: true }), 'revealed');
});

test('4. the third popup waits for an answer to have been applied', () => {
  const afterSecond = { ...FRESH, seen: seenUpTo('opened', 'revealed'), hasRevealedAnswers: true };
  assert.equal(nextTestIntroStep(afterSecond), null, 'nothing has been answered yet');
  assert.equal(nextTestIntroStep({ ...afterSecond, hasAnswered: true }), 'answered');
});

test('5. the order holds even when a later trigger has already happened', () => {
  // Everything has happened at once. The first unseen step still wins, so the
  // three can never arrive out of order or two at a time.
  const everything = { ...FRESH, hasRevealedAnswers: true, hasAnswered: true };
  assert.equal(nextTestIntroStep(everything), 'opened');
  assert.equal(nextTestIntroStep({ ...everything, seen: seenUpTo('opened') }), 'revealed');
  assert.equal(
    nextTestIntroStep({ ...everything, seen: seenUpTo('opened', 'revealed') }),
    'answered',
  );
  assert.equal(
    nextTestIntroStep({ ...everything, seen: seenUpTo('opened', 'revealed', 'answered') }),
    null,
  );
});

test('6. quitting part-way resumes at the step that was not finished', () => {
  // The user dismissed the first popup, revealed the answers, then force-quit
  // before acknowledging the second. Relaunching finds the same step waiting.
  const resumed = {
    ...FRESH,
    seen: seenUpTo('opened'),
    hasRevealedAnswers: false,
    hasAnswered: false,
  };
  assert.equal(nextTestIntroStep(resumed), null, 'not until the answers are uncovered again');
  assert.equal(nextTestIntroStep({ ...resumed, hasRevealedAnswers: true }), 'revealed');
});

test('7. a dismissed step never returns, whatever else is true', () => {
  const allSeen = seenUpTo('opened', 'revealed', 'answered');
  for (const extra of [
    {}, { hasRevealedAnswers: true }, { hasAnswered: true }, { hasCard: false },
  ]) {
    assert.equal(nextTestIntroStep({ ...FRESH, seen: allSeen, ...extra }), null);
  }
});

test('8. nothing is shown before the stored flags have been read', () => {
  assert.equal(nextTestIntroStep({ ...FRESH, loaded: false }), null);
});

test('9. nothing is shown while something the user opened owns the screen', () => {
  assert.equal(nextTestIntroStep({ ...FRESH, isScreenBusy: true }), null);
});

test('10. each step has its own key, and marking one leaves the others alone', () => {
  assert.deepEqual([...TEST_INTRO_STEPS], ['opened', 'revealed', 'answered']);
  assert.equal(new Set(Object.values(TEST_INTRO_KEYS)).size, TEST_INTRO_STEPS.length);
  for (const step of TEST_INTRO_STEPS) {
    const marked = markTestIntroSeen(NO_TEST_INTRO_SEEN, step);
    assert.equal(marked[step], true);
    for (const other of TEST_INTRO_STEPS) {
      if (other !== step) assert.equal(marked[other], false, `${step} disturbed ${other}`);
    }
  }
});

test('11. marking is idempotent, so a repeated dismissal writes nothing new', () => {
  const once = markTestIntroSeen(NO_TEST_INTRO_SEEN, 'opened');
  assert.equal(markTestIntroSeen(once, 'opened'), once, 'same object, no change');
  assert.notEqual(markTestIntroSeen(once, 'revealed'), once);
  // The source of truth is untouched by any of it.
  assert.deepEqual(NO_TEST_INTRO_SEEN, { opened: false, revealed: false, answered: false });
});

// ── What reveals the result-colour filters ───────────────────────────────────

test('12. a new user sees no filters before answering anything', () => {
  assert.equal(
    shouldShowResultFilters({
      hasSeenResultFilterTutorial: false,
      hasCompletedFirstTestAnswer: false,
    }),
    false,
  );
});

test('13. the first answer reveals them — the same moment they are explained', () => {
  assert.equal(
    shouldShowResultFilters({
      hasSeenResultFilterTutorial: false,
      hasCompletedFirstTestAnswer: true,
    }),
    true,
  );
});

test('14. a user taught the previous way keeps them', () => {
  // The old tutorial's flag, and the one the bootstrap migration grants to an
  // install that already had results. Neither is set by anything new, and
  // dropping either would take the filters back off those users.
  assert.equal(
    shouldShowResultFilters({
      hasSeenResultFilterTutorial: true,
      hasCompletedFirstTestAnswer: false,
    }),
    true,
  );
});

// ── 10: existing-user migration ──────────────────────────────────────────────

test('15. an existing user with results keeps their filters, untaught', () => {
  const migration = resolveResultFilterMigration({
    alreadyMigrated: false,
    hasSeenResultFilterTutorial: false,
    hasHistoricalResults: true,
  });
  assert.deepEqual(migration, { shouldMarkMigrated: true, shouldMarkTutorialSeen: true });

  // After migration the ordinary rule applies, and comes out right.
  assert.equal(
    shouldShowResultFilters({
      hasSeenResultFilterTutorial: true,
      hasCompletedFirstTestAnswer: false,
    }),
    true,
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
  // ...and it is under no chip's sheet either.
  for (const level of ALL_LEVEL_KEYS) {
    assert.equal(matchesResultFilter(card({ testLevel: 'perfect' }), level, 0), false, level);
  }
  // It is still an ordinary word in the list, though: finished, not removed.
  assert.equal(shouldShowCard(card({ testLevel: 'perfect' }), 0), true);
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
  // Every grade that keeps the card hides it while sync is on, and changes no
  // visibility state at all while it is off. Don't know is in this set now: it
  // hides for an hour rather than staying on screen.
  for (const kind of ['good', 'slightly', 'unknown'] as const) {
    const on = gradeCard(card(), kind, { now: 1_000, syncTestResults: true });
    const off = gradeCard(card(), kind, { now: 1_000, syncTestResults: false });
    assert.equal(on.action === 'update' && typeof on.patch.hiddenUntil, 'number');
    assert.equal(off.action === 'update' && 'hiddenUntil' in off.patch, false);
  }
  const unknown = gradeCard(card(), 'unknown', { now: 1_000, syncTestResults: true });
  assert.equal(unknown.action === 'update' && unknown.patch.hiddenUntil, 1_000 + 60 * 60 * 1000);
});

test('12. an untested card is the grey chip in both configurations', () => {
  assert.deepEqual(
    countCardsByResult([card()]),
    { good: 0, slightly: 0, unknown: 0, none: 1 },
  );
  assert.equal(matchesResultFilter(card(), 'none', 0), true);
  assert.equal(shouldShowCard(card(), 0), true);
});
