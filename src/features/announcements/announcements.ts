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

export interface Announcement {
  /** Stable id. Also the React list key, so it must never be reused. */
  id: string;
  title: string;
  body: string;
  /** ISO date (YYYY-MM-DD) the announcement was published. */
  publishedAt: string;
}

/**
 * Currently empty — the screen shows its empty state.
 *
 * Entries are written newest-first for readability, but `sortAnnouncements`
 * is what the screen actually orders by, so the literal order does not matter.
 */
export const ANNOUNCEMENTS: readonly Announcement[] = [];

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(value));
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
    if (typeof item.id !== 'string' || item.id === '') return false;
    if (typeof item.title !== 'string' || item.title.trim() === '') return false;
    if (typeof item.body !== 'string' || item.body.trim() === '') return false;
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
