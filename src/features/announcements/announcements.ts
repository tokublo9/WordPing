/**
 * In-app announcements.
 *
 * Local and static by design: there is no backend, no fetch and no cache. To
 * publish an announcement, add an entry to ANNOUNCEMENTS below and ship a build.
 * That keeps the app's "works entirely offline" guarantee intact — the screen
 * renders the same whether or not the device has a connection.
 *
 * No react-native or expo imports, so the list and its helpers stay testable.
 */

import type { TranslationKey } from '../../i18n';

export interface Announcement {
  /** Stable id. Also the React list key, so it must never be reused. */
  id: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  /** ISO date (YYYY-MM-DD) the announcement was published. */
  publishedAt: string;
}

/** Stable forever: persisted read state is keyed by this value. */
export const WELCOME_ANNOUNCEMENT_ID = 'welcome-first-install.v1';

/** Must remain false for release. Production ignores this flag entirely. */
export const FORCE_SHOW_WELCOME_ANNOUNCEMENT = false;

/** AsyncStorage key for read announcement ids. Kept outside backup data. */
export const ANNOUNCEMENT_READ_STATE_KEY = 'wordping_announcement_read_ids_v1';

/**
 * Entries are written newest-first for readability, but `sortAnnouncements`
 * is what the screen actually orders by, so the literal order does not matter.
 */
export const ANNOUNCEMENTS: readonly Announcement[] = [{
  id: WELCOME_ANNOUNCEMENT_ID,
  titleKey: 'announcement_welcome_title',
  bodyKey: 'announcement_welcome_body',
  publishedAt: '2026-09-08',
}];

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * True for a present, non-empty string.
 *
 * `titleKey` and `bodyKey` are declared `TranslationKey`, a union of string
 * literals that does not include `''`, so comparing one to `''` at the call
 * site is a comparison TypeScript proves can never hold (TS2367). The check is
 * still worth making at runtime: an entry is hand-written, and a typo that
 * leaves a key blank is exactly what this validator exists to catch — the type
 * only describes what the author intended, not what they typed.
 *
 * Taking `unknown` is what makes the comparison legal, and it is a widening
 * every caller satisfies for free. No cast, no suppression, and the declared
 * `TranslationKey` typing of the fields is untouched.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/**
 * Drops malformed and duplicate entries rather than rendering a broken row.
 * A typo in a hand-written entry should cost that one announcement, not the
 * whole screen.
 */
export function validAnnouncements(
  announcements: readonly Announcement[] = ANNOUNCEMENTS,
): Announcement[] {
  const seen = new Set<string>();
  return announcements.filter(item => {
    if (!item || typeof item !== 'object') return false;
    if (!isNonEmptyString(item.id)) return false;
    if (!isNonEmptyString(item.titleKey)) return false;
    if (!isNonEmptyString(item.bodyKey)) return false;
    if (typeof item.publishedAt !== 'string' || !isValidDate(item.publishedAt)) return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Newest first, with a stable tiebreak so equal dates keep a fixed order. */
export function sortAnnouncements(announcements: readonly Announcement[]): Announcement[] {
  return [...announcements].sort((a, b) =>
    a.publishedAt === b.publishedAt
      ? a.id.localeCompare(b.id)
      : b.publishedAt.localeCompare(a.publishedAt));
}

/** What the screen renders: validated, then ordered. */
export function visibleAnnouncements(
  announcements: readonly Announcement[] = ANNOUNCEMENTS,
): Announcement[] {
  return sortAnnouncements(validAnnouncements(announcements));
}

function isStoredReadState(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      && parsed.every(id => typeof id === 'string' && id !== '');
  } catch {
    return false;
  }
}

/** Invalid or missing storage is treated as an empty set. */
export function parseReadAnnouncementIds(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id !== ''));
  } catch {
    return new Set();
  }
}

export function serializeReadAnnouncementIds(ids: ReadonlySet<string>): string {
  return JSON.stringify([...ids].sort());
}

/**
 * A build update must not make the welcome item look new to an existing install.
 * A genuine first install instead starts with the item unread and stores that
 * empty baseline, so relaunching cannot reinterpret the install as an update.
 */
export function initialReadAnnouncementIds(
  stored: string | null,
  isFirstLaunch: boolean,
): Set<string> {
  const ids = parseReadAnnouncementIds(stored);
  // A valid stored [] is the first-install baseline and must stay unread after
  // a relaunch. Missing or malformed state on an existing install cannot prove
  // that provenance, so it safely treats the one-time welcome as already read.
  if (!isFirstLaunch && !isStoredReadState(stored)) ids.add(WELCOME_ANNOUNCEMENT_ID);
  return ids;
}

export function unreadAnnouncementIds(
  readIds: ReadonlySet<string>,
  forceWelcomeUnread: boolean,
  announcements: readonly Announcement[] = ANNOUNCEMENTS,
): Set<string> {
  return new Set(visibleAnnouncements(announcements)
    .filter(item => !readIds.has(item.id)
      || (forceWelcomeUnread && item.id === WELCOME_ANNOUNCEMENT_ID))
    .map(item => item.id));
}
