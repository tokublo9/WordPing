import type { WordCard } from '../../types';

/**
 * One-time tutorial state.
 *
 * Covers the result-colour filters: shown once, at the moment the user has just
 * earned it, and never again on a later launch.
 *
 * Pure — no react-native or expo import. The AsyncStorage reads and writes live
 * with the other UI preferences in `useAppPersistence` / `useAppBootstrap`.
 */

/** The result-colour filters, explained after the first Test Mode answer. */
export const RESULT_FILTER_TUTORIAL_KEY = 'wordping_tutorial_result_filter_seen';
/** Set the first time any card is graded, so the filter tutorial has a trigger. */
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
  /** Stored value of RESULT_FILTER_TUTORIAL_KEY: the user dismissed the tutorial. */
  hasSeenResultFilterTutorial: boolean;
}

/**
 * Whether the result-colour filter chips may be rendered.
 *
 * Dismissing the tutorial is the single gate. Answering a card is deliberately
 * *not* enough: the chips are the thing the tutorial explains, so revealing them
 * first would leave a user looking at four unexplained colours — which is the
 * situation this feature exists to prevent.
 *
 * Existing users are not a second condition here. They are handled once, at
 * migration, by initialising the same flag — see `resolveResultFilterMigration`.
 * Keeping one rule means there is no way for the two paths to disagree.
 */
export function shouldShowResultFilters(input: ResultFilterVisibilityInput): boolean {
  return input.hasSeenResultFilterTutorial;
}

export interface ResultFilterTutorialInput extends ResultFilterVisibilityInput {
  /** Stored value of FIRST_TEST_ANSWER_KEY: at least one card has been graded. */
  hasCompletedFirstTestAnswer: boolean;
  /** Bootstrap has finished, so the stored flags are the real ones. */
  isAppReady: boolean;
  /** Test Mode is on screen right now. */
  isTestModeOpen: boolean;
  /** Onboarding, a modal or a transient mode owns the screen. */
  isScreenBusy: boolean;
}

/**
 * Whether to show the filter tutorial now.
 *
 * One rule covers both the normal path and force-close recovery, because both
 * describe the same situation: a card has been answered, the tutorial has not
 * been dismissed, and the user is somewhere it can safely appear. Finishing a
 * test, quitting one, and relaunching the app after a force-close all arrive
 * here identically — there is no separate "was closed" flag that a crash could
 * lose.
 *
 * `isTestModeOpen` keeps it off the results screen, an exit confirmation and the
 * dismissal animation. `isAppReady` keeps it from appearing before the stored
 * flags have been read, which would otherwise show it to someone who had
 * already dismissed it.
 */
export function shouldShowResultFilterTutorial(input: ResultFilterTutorialInput): boolean {
  if (!input.isAppReady) return false;
  if (input.hasSeenResultFilterTutorial) return false;
  if (!input.hasCompletedFirstTestAnswer) return false;
  return !input.isTestModeOpen && !input.isScreenBusy;
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
 * Swipe and long-press are explained by a seeded welcome card, not by a
 * tutorial popup — see DEFAULT_CARDS in lib/db.ts. There is deliberately no
 * state here for it: a card the user can read, keep or delete needs none.
 */
