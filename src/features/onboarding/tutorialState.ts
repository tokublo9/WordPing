import type { WordCard } from '../../types';

/**
 * One-time tutorial state.
 *
 * Two things live here: the Test Mode introduction — three popups, in order,
 * each shown once ever — and the rule that decides when the result-colour
 * filters appear.
 *
 * Pure — no react-native or expo import. The AsyncStorage reads and writes live
 * with the other UI preferences in `useAppPersistence` / `useAppBootstrap`, and
 * for the Test introduction in `hooks/useTestIntro.ts`.
 */

/**
 * The old result-filter tutorial's dismissal flag.
 *
 * Nothing sets it any more: the popup it belonged to — raised on leaving Test
 * Mode after the first answer — is gone, replaced by the three-step
 * introduction below. It is still *read*, because it is what already-migrated
 * and already-taught users carry, and dropping it would take the filters away
 * from everyone who earned them before this release.
 */
export const RESULT_FILTER_TUTORIAL_KEY = 'wordping_tutorial_result_filter_seen';
/** Set the first time any card is graded. Now also what reveals the filters. */
export const FIRST_TEST_ANSWER_KEY = 'wordping_first_test_answer';
/**
 * Records that the one-time check for pre-existing Test Mode results has run.
 *
 * Kept separate from the tutorial flag so "this user was migrated" and "this
 * user dismissed the tutorial" stay distinguishable, and so the check cannot
 * re-run later — by then a genuinely new user has results of their own and
 * would be wrongly treated as an existing one.
 */
export const RESULT_FILTER_MIGRATION_KEY = 'wordping_result_filter_migrated';

/** Anything that is not exactly 'true' means "not yet". */
export function parseTutorialFlag(raw: string | null | undefined): boolean {
  return raw === 'true';
}

export function serializeTutorialFlag(seen: boolean): string {
  return seen ? 'true' : 'false';
}

/**
 * Does this library already contain Test Mode results?
 *
 * The migration rule for users who tested before this release existed. Their
 * words already carry levels, so the filters are already meaningful to them and
 * hiding them would take away something they have been using. Any stored grade
 * — a level, a mastered flag, a scheduled review, or review history — counts.
 */
export function hasExistingTestResults(cards: readonly WordCard[]): boolean {
  return cards.some(card =>
    card.testLevel !== undefined
    || card.testMastered === true
    || card.testNextReview !== undefined
    || (card.reviewHistory?.length ?? 0) > 0,
  );
}

export interface ResultFilterVisibilityInput {
  /** Stored value of RESULT_FILTER_TUTORIAL_KEY: an already-taught user. */
  hasSeenResultFilterTutorial: boolean;
  /** Stored value of FIRST_TEST_ANSWER_KEY: at least one card has been graded. */
  hasCompletedFirstTestAnswer: boolean;
}

/**
 * Whether the result-colour filter chips may be rendered.
 *
 * Either condition is enough, and they are two eras of the same rule: nobody
 * sees the chips before they have been told what the colours mean.
 *
 * The first answer is what says so now — the third Test introduction popup
 * explains the coloured sections at that exact moment, so the chips and their
 * explanation arrive together. The old flag is still honoured because it means
 * the same thing for everyone who was taught the previous way: they dismissed
 * the tutorial, or they were migrated as an existing user with results. Reading
 * both is what keeps this release from taking the filters back off them.
 */
export function shouldShowResultFilters(input: ResultFilterVisibilityInput): boolean {
  return input.hasSeenResultFilterTutorial || input.hasCompletedFirstTestAnswer;
}

// ── The Test Mode introduction ───────────────────────────────────────────────

/**
 * Three popups, in this order, each shown once for the lifetime of the install.
 *
 * `opened`   — on entering Test Mode: what the card is for.
 * `revealed` — the first time the answers are uncovered: the same explanation
 *              the Info button opens, so there is one description of the four
 *              results rather than two that can disagree.
 * `answered` — after the first answer is applied: where the word just went.
 *
 * Each has its own key, and each is written when the popup is *dismissed*
 * rather than when it is triggered. Quitting mid-step therefore resumes at that
 * same step, which is what the alternative — writing on the trigger — would
 * silently lose.
 */
export type TestIntroStep = 'opened' | 'revealed' | 'answered';

export const TEST_INTRO_STEPS: readonly TestIntroStep[] = ['opened', 'revealed', 'answered'];

export const TEST_INTRO_KEYS: Readonly<Record<TestIntroStep, string>> = {
  opened:   'wordping_tutorial_test_opened',
  revealed: 'wordping_tutorial_test_revealed',
  answered: 'wordping_tutorial_test_answered',
};

export type TestIntroSeen = Readonly<Record<TestIntroStep, boolean>>;

export const NO_TEST_INTRO_SEEN: TestIntroSeen = {
  opened: false, revealed: false, answered: false,
};

export interface TestIntroInput {
  seen: TestIntroSeen;
  /** The stored flags have been read. Nothing is shown before that. */
  loaded: boolean;
  /** A card is on screen, so there is something the first popup can point at. */
  hasCard: boolean;
  /** The card has been turned over and the four answers are on screen. */
  hasRevealedAnswers: boolean;
  /** An answer has been applied and the test has moved on from it. */
  hasAnswered: boolean;
  /** Something the user opened themselves owns the screen. */
  isScreenBusy: boolean;
}

/**
 * The one popup to show right now, or null.
 *
 * A single answer rather than three booleans, so two introduction popups can
 * never be on screen together — there is no state in which this returns more
 * than one thing.
 *
 * Order is structural, not a convention: an unseen step stops the search, so a
 * later step can never overtake an earlier one even if its own trigger has
 * already happened. That also makes the resume rule fall out for free — after a
 * force-quit the first unseen step is simply the next one returned.
 *
 * Being derived from state rather than fired from an effect is what makes it
 * safe against re-renders, repeated taps and Strict Mode's double invocation:
 * there is no "show" event to run twice, only a value that is or is not this
 * step.
 */
export function nextTestIntroStep(input: TestIntroInput): TestIntroStep | null {
  if (!input.loaded || input.isScreenBusy) return null;
  if (!input.seen.opened)   return input.hasCard ? 'opened' : null;
  if (!input.seen.revealed) return input.hasRevealedAnswers ? 'revealed' : null;
  if (!input.seen.answered) return input.hasAnswered ? 'answered' : null;
  return null;
}

/**
 * Adds one step. Returns the same object when nothing changed, so a repeated
 * dismissal is a no-op rather than a second render and a second write.
 *
 * Written out rather than spread with a computed key: three named fields cannot
 * be widened into an index signature by inference, and the one thing this must
 * never do is let a step outside the three exist.
 */
export function markTestIntroSeen(seen: TestIntroSeen, step: TestIntroStep): TestIntroSeen {
  if (seen[step]) return seen;
  return {
    opened:   seen.opened   || step === 'opened',
    revealed: seen.revealed || step === 'revealed',
    answered: seen.answered || step === 'answered',
  };
}

export interface ResultFilterMigrationInput {
  /** Stored value of RESULT_FILTER_MIGRATION_KEY. */
  alreadyMigrated: boolean;
  /** Stored value of RESULT_FILTER_TUTORIAL_KEY, before any migration. */
  hasSeenResultFilterTutorial: boolean;
  /** Whether the library already carries Test Mode results. */
  hasHistoricalResults: boolean;
}

export interface ResultFilterMigration {
  /** Whether to write RESULT_FILTER_MIGRATION_KEY now. */
  shouldMarkMigrated: boolean;
  /**
   * Whether to initialise RESULT_FILTER_TUTORIAL_KEY to true.
   *
   * True only for a user who already had results when this feature arrived.
   * They are not taught a feature they have been using, and their filters never
   * disappear — but nothing about their results is read for any other purpose,
   * and nothing is modified or deleted.
   */
  shouldMarkTutorialSeen: boolean;
}

/**
 * The one-time check that decides whether this install predates the feature.
 *
 * Runs once, on the first launch after upgrading, and then never again: a
 * genuinely new user who later earns results must not be reclassified as an
 * existing one, which is exactly what re-running this would do.
 */
export function resolveResultFilterMigration(
  input: ResultFilterMigrationInput,
): ResultFilterMigration {
  if (input.alreadyMigrated) {
    return { shouldMarkMigrated: false, shouldMarkTutorialSeen: false };
  }
  return {
    shouldMarkMigrated: true,
    // A stored `true` is left alone rather than rewritten.
    shouldMarkTutorialSeen: input.hasHistoricalResults && !input.hasSeenResultFilterTutorial,
  };
}

/*
 * Swipe and long-press are explained by one of the seeded tutorial cards, not by
 * a tutorial popup — see DEFAULT_CARDS in lib/db.ts and WELCOME_CARD_TEXTS in
 * features/onboarding/welcomeContent.ts. There is deliberately no state here for
 * it: a card the user can read, keep or delete needs none.
 */
