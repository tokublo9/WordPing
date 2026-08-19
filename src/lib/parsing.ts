import type { Folder, WordCard } from '../types';

/**
 * Defensive parsers for data that was written by an older build of the app.
 *
 * Anything read from local storage or from a user-supplied backup goes through
 * here first. The rule throughout is: an unrecognised or corrupt field is
 * dropped, never guessed at, and a bad record never aborts the whole load.
 *
 * This module is intentionally free of react-native and expo imports so that it
 * can be exercised directly by the test suite.
 */

/** JSON.parse that returns null instead of throwing. The caller picks the fallback. */
export function safeParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseCard(value: unknown): WordCard | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== 'string' || !c.id || typeof c.word !== 'string' || typeof c.meaning !== 'string') {
    return null;
  }

  const card: WordCard = {
    id: c.id,
    word: c.word,
    meaning: c.meaning,
    note: typeof c.note === 'string' ? c.note : '',
  };
  if (typeof c.createdAt === 'number' && Number.isFinite(c.createdAt) && c.createdAt >= 0) {
    card.createdAt = c.createdAt;
  }
  if (typeof c.notifOff === 'boolean') card.notifOff = c.notifOff;
  if (typeof c.folderId === 'string') card.folderId = c.folderId;
  if (typeof c.testMastered === 'boolean') card.testMastered = c.testMastered;
  if (typeof c.testNextReview === 'number' && Number.isFinite(c.testNextReview)) {
    card.testNextReview = c.testNextReview;
  }
  if (c.testLevel === 'perfect' || c.testLevel === 'good' || c.testLevel === 'slightly' || c.testLevel === 'unknown') {
    card.testLevel = c.testLevel;
  }
  if (Array.isArray(c.reviewHistory)) {
    card.reviewHistory = c.reviewHistory.flatMap(entry => {
      if (!entry || typeof entry !== 'object') return [];
      const review = entry as Record<string, unknown>;
      const rating = review.rating;
      if (typeof review.ts !== 'number' || !Number.isFinite(review.ts)) return [];
      if (rating !== 'perfect' && rating !== 'good' && rating !== 'slightly' && rating !== 'unknown') return [];
      return [{ ts: review.ts, rating }];
    });
  }
  if (typeof c.wordLang === 'string') card.wordLang = c.wordLang;
  if (typeof c.meaningLang === 'string') card.meaningLang = c.meaningLang;
  if (typeof c.audioUri === 'string') card.audioUri = c.audioUri;
  if (typeof c.audioSpeed === 'number' && Number.isFinite(c.audioSpeed)) card.audioSpeed = c.audioSpeed;
  if (typeof c.audioVolume === 'number' && Number.isFinite(c.audioVolume)) card.audioVolume = c.audioVolume;
  return card;
}

export function parseCardArray(raw: unknown): WordCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(value => {
    const card = parseCard(value);
    return card ? [card] : [];
  });
}

export function parseFolder(value: unknown): Folder | null {
  if (!value || typeof value !== 'object') return null;
  const f = value as Record<string, unknown>;
  if (typeof f.id !== 'string' || !f.id || typeof f.name !== 'string' ||
      typeof f.createdAt !== 'number' || !Number.isFinite(f.createdAt)) return null;

  const folder: Folder = { id: f.id, name: f.name, createdAt: f.createdAt };
  if (typeof f.icon === 'string') folder.icon = f.icon;
  if (typeof f.color === 'string') folder.color = f.color;
  if (f.notifSettings && typeof f.notifSettings === 'object') {
    const settings = f.notifSettings as Record<string, unknown>;
    if (typeof settings.intervalSeconds === 'number' && Number.isFinite(settings.intervalSeconds) &&
        typeof settings.displayOnlyWord === 'boolean') {
      folder.notifSettings = {
        intervalSeconds: Math.max(0, settings.intervalSeconds),
        displayOnlyWord: settings.displayOnlyWord,
      };
    }
  }
  return folder;
}

export function parseFolderArray(raw: unknown): Folder[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(value => {
    const folder = parseFolder(value);
    return folder ? [folder] : [];
  });
}

/**
 * Drops duplicate ids, keeping the first occurrence.
 *
 * SQLite enforces uniqueness that a JSON array never did, so a legacy file with
 * a duplicated id must be reconciled before it reaches the database.
 */
export function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
