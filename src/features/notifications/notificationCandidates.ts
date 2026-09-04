import type { FolderNotifSettings, WordCard } from '../../types';
import { appNow } from '../../lib/appClock';
import { isCardHidden } from '../cards/visibility';

/**
 * Which of a folder's words a notification may fire.
 *
 * Notifications are opt-in. A word is eligible because the user put it on the
 * list — `notifCandidate` — not because it happens to live in the folder. The
 * one exception is the folder's own "Notify All Words" switch, which drops the
 * list requirement and makes the whole folder eligible; it is off unless the
 * user turned it on, and it is per folder, so one folder answering "all" says
 * nothing about the next.
 *
 * There is deliberately no fallback. With the switch off and nothing on the
 * list the pool is empty and the folder schedules nothing, because quietly
 * reverting to "every word" would be indistinguishable from the setting not
 * working — and the Notification sheet says so rather than leaving the user to
 * infer it from silence.
 *
 * Eligibility is read from the live card array on every reschedule, so a word
 * that was deleted or moved to another folder is simply not there to be picked;
 * nothing has to be cleaned up after it. Reading it writes nothing: a grade, a
 * review interval and Hide Front Word are all untouched by adding or removing a
 * word here.
 */

type EligibleCard = Pick<WordCard, 'notifCandidate' | 'hiddenUntil' | 'testLevel' | 'testMastered' | 'testNextReview'>;

/** The user put this word on its folder's notification list. */
export function isNotifCandidate(card: Pick<WordCard, 'notifCandidate'>): boolean {
  return card.notifCandidate === true;
}

/** "Notify All Words" for a folder. Absent settings and absent flag both mean off. */
export function notifiesAllWords(settings: FolderNotifSettings | undefined): boolean {
  return settings?.notifyAllWords === true;
}

/**
 * The words a folder's notifications may draw from.
 *
 * `cards` is the folder's words — ownership is the caller's filter, because it
 * is the caller that knows which folder is being scheduled.
 */
export function notifiableCards<T extends EligibleCard>(
  cards: readonly T[],
  settings: FolderNotifSettings | undefined,
  now: number = appNow(),
): T[] {
  // A word inside the hide a grade gave it is out of rotation on every surface,
  // including this one, whether or not it is on the list.
  const available = cards.filter(card => !isCardHidden(card, now));
  return notifiesAllWords(settings) ? available : available.filter(isNotifCandidate);
}

/**
 * The folder is set to notify from its list, and the list is empty.
 *
 * True only when it matters — the folder has an interval set, so it is trying
 * to notify and cannot. A folder with notifications off is not a problem to
 * report.
 */
export function hasNoNotifiableWords<T extends EligibleCard>(
  cards: readonly T[],
  settings: FolderNotifSettings | undefined,
  now: number = appNow(),
): boolean {
  if (!settings || settings.intervalSeconds <= 0) return false;
  if (notifiesAllWords(settings)) return false;
  return notifiableCards(cards, settings, now).length === 0;
}
