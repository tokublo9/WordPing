/**
 * Whether a card's text was written by the app rather than by the user.
 *
 * Used for one thing: deciding whether a card's front, back and note need to be
 * masked out of a Session Replay recording. The seeded tutorial cards say the
 * same eight sentences to everybody, so blacking them out hides nothing private
 * and costs the recording the very screens onboarding exists to show.
 *
 * The answer is a stored field, `words.built_in`, written at creation by the
 * two paths that actually know the provenance — `db.ts`'s first-launch seed and
 * `buildWelcomeCards` — and cleared for good by `useCards` the first time the
 * user edits the front, back or note. Because it is persisted and travels
 * through the ordinary save, an edited card stays classified as the user's
 * across a restart, a reinstall of the JS bundle, and every later render.
 *
 * WHY NOT THE ID. `WELCOME_CARD_IDS` was the obvious test and it is the wrong
 * one: those ids survive editing, so a card the user long ago overwrote with
 * their own word would still read as app-authored and its text would be legible
 * in a recording. An id proves where a card came from; it says nothing about
 * what is in it now. The id list still exists and is still what onboarding
 * rebuilds against — it is simply not a privacy signal.
 *
 * Deliberately NOT based on the displayed text, its translation, the card's
 * position, or its folder. Text and translation change per language and per
 * edit; position changes on every reorder; the welcome folder can be renamed
 * and can hold the user's own cards.
 *
 * ABSENT MEANS MASKED. A card from a database that predates the column, from a
 * backup, from a CSV import, or one built in memory with no flag at all, is
 * treated as the user's. That is the only direction a mistake is safe in, and
 * it is why migration 6 backfills nothing.
 *
 * Pure — no react-native import — so the rule is testable directly.
 */

/** The stored provenance flag. Only ever true on an unedited seeded card. */
export function isBuiltInTutorialCard(card: { builtIn?: boolean } | null | undefined): boolean {
  return card?.builtIn === true;
}

/**
 * The inverse, named for the question the render sites actually ask.
 *
 * Anything that is not provably the app's own copy is masked, including a null
 * card and one that carries no flag.
 */
export function needsUserContentMask(card: { builtIn?: boolean } | null | undefined): boolean {
  return !isBuiltInTutorialCard(card);
}
