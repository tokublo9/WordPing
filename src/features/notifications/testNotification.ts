import type { FolderNotifSettings, WordCard } from '../../types';
import { appNow } from '../../lib/appClock';
import { isCardHidden } from '../cards/visibility';
import { notifiableCards } from './notificationCandidates';

/**
 * Which word a test notification fires.
 *
 * Send Test answers a different question from the scheduler. The scheduler is
 * the user's standing arrangement and obeys it exactly — nothing on the list
 * means nothing arrives. Send Test is a one-off "does this reach my phone?",
 * asked by someone who is still setting notifications up, and it has to be
 * answerable before any of that is arranged: with regular notifications off, no
 * interval chosen, and no word added to the list.
 *
 * So it falls back where the scheduler deliberately does not, and the ordering
 * says which of the two it is being: a real candidate first, so the preview is
 * the real thing when there is one to preview, and only then any saved word.
 *
 * Pure — no react-native import — so the fallback order is tested directly.
 * It reads the card array and nothing else: choosing a word here is not a
 * setting, and never writes `notifCandidate`, a grade or an interval.
 */

/** The fields a pick reads. `word` decides usability; the rest decide eligibility. */
type TestNotificationCard = Pick<
  WordCard,
  'word' | 'notifCandidate' | 'hiddenUntil' | 'testLevel' | 'testMastered' | 'testNextReview'
>;

/**
 * A word with nothing in it cannot be previewed — the notification would arrive
 * blank, which tells the user less than no notification at all. A card that was
 * deleted or moved out of the folder is already absent from the array this is
 * handed, so there is nothing else to exclude.
 */
function hasWordText(card: TestNotificationCard): boolean {
  return typeof card.word === 'string' && card.word.trim() !== '';
}

function randomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

/**
 * The word to preview, or `null` when the folder has no word to preview at all.
 *
 * `folderCards` is the scope the Notification sheet is already working in —
 * the current folder's words, hidden ones included. Nothing widens it: a test
 * fired from one folder must not show a word from another, which would be a
 * scope no other part of the sheet uses.
 *
 * The fallback tier keeps words inside a grade's hide window. That window is a
 * *scheduling* rule, and this is explicitly the button that works when the
 * schedule would not; excluding them would report "add a word first" to someone
 * whose folder is full of words.
 *
 * It does *order* that tier, though. The window not emptying the fallback and a
 * hidden word not being preferred over an available one are two different
 * claims, and both hold: a word outside its window is picked ahead of one inside
 * it, and a folder where every word is hidden still sends. So the tiers are
 * three — a real candidate, then any available saved word, then a hidden one —
 * and only the last is reached when there is nothing else at all.
 */
export function pickTestNotificationCard<T extends TestNotificationCard>(
  folderCards: readonly T[],
  settings: FolderNotifSettings | undefined,
  now: number = appNow(),
  pickIndex: (length: number) => number = randomIndex,
): T | null {
  const usable = folderCards.filter(hasWordText);
  const candidates = notifiableCards(usable, settings, now);
  const available = usable.filter(card => !isCardHidden(card, now));
  const pool = candidates.length > 0 ? candidates
    : available.length > 0 ? available
    : usable;
  if (pool.length === 0) return null;
  return pool[pickIndex(pool.length)] ?? null;
}
