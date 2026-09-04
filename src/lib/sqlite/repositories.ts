import type { Folder, ReviewEntry, TestLevel, WordCard } from '../../types';
import { levelFromId, levelIdFor, type LevelName } from './schema';
import type { SqlDatabase, SqlParam } from './types';

/**
 * The only module that writes SQL for vocabulary data.
 *
 * UI components and hooks call db.ts, which calls these functions. Nothing
 * above this layer builds a query, so the schema can change without touching a
 * screen.
 */

const VALID_LEVELS: ReadonlySet<string> = new Set(['perfect', 'good', 'slightly', 'unknown']);

function isTestLevel(value: unknown): value is TestLevel {
  return typeof value === 'string' && VALID_LEVELS.has(value);
}

// ── Folders ──────────────────────────────────────────────────────────────────

interface FolderRow {
  id: string;
  name: string;
  created_at: number;
  icon: string | null;
  color: string | null;
  notif_interval_seconds: number | null;
  notif_display_only_word: number | null;
  notif_notify_all_words: number | null;
}

function toFolder(row: FolderRow): Folder {
  const folder: Folder = { id: row.id, name: row.name, createdAt: row.created_at };
  if (row.icon !== null) folder.icon = row.icon;
  if (row.color !== null) folder.color = row.color;
  if (row.notif_interval_seconds !== null && row.notif_display_only_word !== null) {
    folder.notifSettings = {
      intervalSeconds: Math.max(0, row.notif_interval_seconds),
      displayOnlyWord: row.notif_display_only_word === 1,
    };
    // Set only when on. NULL — a folder from before this column existed — and 0
    // both mean off, and absent is how the rest of the app spells off, so an
    // untouched folder reads back exactly as it did before.
    if (row.notif_notify_all_words === 1) folder.notifSettings.notifyAllWords = true;
  }
  return folder;
}

export async function readFolders(db: SqlDatabase): Promise<Folder[]> {
  const rows = await db.getAllAsync<FolderRow>(
    `SELECT id, name, created_at, icon, color,
            notif_interval_seconds, notif_display_only_word, notif_notify_all_words
       FROM folders ORDER BY position ASC`,
  );
  return rows.map(toFolder);
}

function folderParams(folder: Folder, position: number): SqlParam[] {
  return [
    folder.id,
    folder.name,
    folder.createdAt,
    folder.icon ?? null,
    folder.color ?? null,
    folder.notifSettings ? folder.notifSettings.intervalSeconds : null,
    folder.notifSettings ? (folder.notifSettings.displayOnlyWord ? 1 : 0) : null,
    folder.notifSettings ? (folder.notifSettings.notifyAllWords === true ? 1 : 0) : null,
    position,
  ];
}

/**
 * Makes the stored folders exactly match `folders`, in the given order.
 *
 * Callers must already be inside a transaction — see `writeSnapshot`. Deleting
 * a folder sets its words' folder_id to NULL rather than removing them, per the
 * ON DELETE SET NULL in the schema.
 */
async function syncFolders(db: SqlDatabase, folders: readonly Folder[]): Promise<void> {
  const keep = folders.map(folder => folder.id);
  await db.runAsync(
    keep.length > 0
      ? `DELETE FROM folders WHERE id NOT IN (${keep.map(() => '?').join(',')})`
      : 'DELETE FROM folders',
    keep,
  );
  for (const [position, folder] of folders.entries()) {
    await db.runAsync(
      `INSERT INTO folders (id, name, created_at, icon, color,
                            notif_interval_seconds, notif_display_only_word,
                            notif_notify_all_words, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         created_at = excluded.created_at,
         icon = excluded.icon,
         color = excluded.color,
         notif_interval_seconds = excluded.notif_interval_seconds,
         notif_display_only_word = excluded.notif_display_only_word,
         notif_notify_all_words = excluded.notif_notify_all_words,
         position = excluded.position`,
      folderParams(folder, position),
    );
  }
}

// ── Words ────────────────────────────────────────────────────────────────────

interface WordRow {
  id: string;
  folder_id: string | null;
  word: string;
  meaning: string;
  created_at: number | null;
  notif_candidate: number;
  word_lang: string | null;
  meaning_lang: string | null;
  audio_uri: string | null;
  audio_speed: number | null;
  audio_volume: number | null;
  hide_word: number;
  note: string | null;
  level_id: string | null;
  next_review_at: number | null;
  mastered: number | null;
  hidden_until: number | null;
}

interface ReviewRow {
  word_id: string;
  rated_at: number;
  rating: string;
}

const WORD_SELECT = `
  SELECT w.id, w.folder_id, w.word, w.meaning, w.created_at, w.notif_candidate,
         w.word_lang, w.meaning_lang, w.audio_uri, w.audio_speed, w.audio_volume,
         w.hide_word,
         n.body AS note,
         p.level_id, p.next_review_at, p.mastered, p.hidden_until
    FROM words w
    LEFT JOIN notes             n ON n.word_id = w.id
    LEFT JOIN learning_progress p ON p.word_id = w.id
   ORDER BY w.position ASC
`;

function toWordCard(row: WordRow, history: ReviewEntry[] | undefined): WordCard {
  const card: WordCard = {
    id: row.id,
    word: row.word,
    meaning: row.meaning,
    note: row.note ?? '',
  };
  if (row.created_at !== null) card.createdAt = row.created_at;
  if (row.notif_candidate === 1) card.notifCandidate = true;
  if (row.folder_id !== null) card.folderId = row.folder_id;
  if (row.mastered === 1) card.testMastered = true;
  if (row.next_review_at !== null) card.testNextReview = row.next_review_at;
  if (row.hidden_until !== null) card.hiddenUntil = row.hidden_until;

  const level = levelFromId(row.level_id);
  if (level !== null) card.testLevel = level;

  if (history && history.length > 0) card.reviewHistory = history;
  if (row.word_lang !== null) card.wordLang = row.word_lang;
  if (row.meaning_lang !== null) card.meaningLang = row.meaning_lang;
  if (row.audio_uri !== null) card.audioUri = row.audio_uri;
  if (row.audio_speed !== null) card.audioSpeed = row.audio_speed;
  if (row.audio_volume !== null) card.audioVolume = row.audio_volume;
  if (row.hide_word === 1) card.hideWord = true;
  return card;
}

export async function readWords(db: SqlDatabase): Promise<WordCard[]> {
  const [rows, reviews] = await Promise.all([
    db.getAllAsync<WordRow>(WORD_SELECT),
    db.getAllAsync<ReviewRow>(
      'SELECT word_id, rated_at, rating FROM review_history ORDER BY word_id ASC, rated_at ASC, id ASC',
    ),
  ]);

  const historyByWord = new Map<string, ReviewEntry[]>();
  for (const review of reviews) {
    if (!isTestLevel(review.rating)) continue;
    const entries = historyByWord.get(review.word_id);
    const entry: ReviewEntry = { ts: review.rated_at, rating: review.rating };
    if (entries) entries.push(entry);
    else historyByWord.set(review.word_id, [entry]);
  }

  return rows.map(row => toWordCard(row, historyByWord.get(row.id)));
}

/**
 * Rewrites the word tables so they exactly match `cards`, in the given order.
 *
 * `knownFolderIds` is the set of folders that will exist once the surrounding
 * transaction commits. A card pointing at anything outside that set keeps its
 * row but loses the association, because dropping one link is recoverable while
 * aborting the whole save would lose the word itself.
 */
async function syncWords(
  db: SqlDatabase,
  cards: readonly WordCard[],
  knownFolderIds: ReadonlySet<string>,
): Promise<string[]> {
  const orphaned: string[] = [];
  const keep = cards.map(card => card.id);

  // ON DELETE CASCADE clears notes, progress, history and labels for these rows.
  await db.runAsync(
    keep.length > 0
      ? `DELETE FROM words WHERE id NOT IN (${keep.map(() => '?').join(',')})`
      : 'DELETE FROM words',
    keep,
  );

  for (const [position, card] of cards.entries()) {
    let folderId: string | null = card.folderId ?? null;
    if (folderId !== null && !knownFolderIds.has(folderId)) {
      orphaned.push(card.id);
      folderId = null;
    }

    await db.runAsync(
      `INSERT INTO words (id, folder_id, word, meaning, created_at, position, notif_candidate,
                          word_lang, meaning_lang, audio_uri, audio_speed, audio_volume,
                          hide_word)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         folder_id = excluded.folder_id,
         word = excluded.word,
         meaning = excluded.meaning,
         created_at = excluded.created_at,
         position = excluded.position,
         notif_candidate = excluded.notif_candidate,
         word_lang = excluded.word_lang,
         meaning_lang = excluded.meaning_lang,
         audio_uri = excluded.audio_uri,
         audio_speed = excluded.audio_speed,
         audio_volume = excluded.audio_volume,
         hide_word = excluded.hide_word`,
      [
        card.id,
        folderId,
        card.word,
        card.meaning,
        card.createdAt ?? null,
        position,
        card.notifCandidate === true ? 1 : 0,
        card.wordLang ?? null,
        card.meaningLang ?? null,
        card.audioUri ?? null,
        card.audioSpeed ?? null,
        card.audioVolume ?? null,
        card.hideWord === true ? 1 : 0,
      ],
    );

    if (card.note) {
      await db.runAsync(
        `INSERT INTO notes (word_id, body) VALUES (?, ?)
         ON CONFLICT(word_id) DO UPDATE SET body = excluded.body`,
        [card.id, card.note],
      );
    } else {
      await db.runAsync('DELETE FROM notes WHERE word_id = ?', [card.id]);
    }

    const levelId = card.testLevel ? levelIdFor(card.testLevel as LevelName) : null;
    const hasProgress = levelId !== null
      || card.testNextReview !== undefined
      || card.testMastered === true
      || card.hiddenUntil !== undefined;
    if (hasProgress) {
      await db.runAsync(
        `INSERT INTO learning_progress (word_id, level_id, next_review_at, mastered, hidden_until)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(word_id) DO UPDATE SET
           level_id = excluded.level_id,
           next_review_at = excluded.next_review_at,
           mastered = excluded.mastered,
           hidden_until = excluded.hidden_until`,
        [
          card.id, levelId, card.testNextReview ?? null,
          card.testMastered === true ? 1 : 0, card.hiddenUntil ?? null,
        ],
      );
    } else {
      await db.runAsync('DELETE FROM learning_progress WHERE word_id = ?', [card.id]);
    }

    // History is append-only in the UI but rewritten here, because the caller
    // owns the full array and may have trimmed it.
    await db.runAsync('DELETE FROM review_history WHERE word_id = ?', [card.id]);
    for (const entry of card.reviewHistory ?? []) {
      await db.runAsync(
        'INSERT INTO review_history (word_id, rated_at, rating) VALUES (?, ?, ?)',
        [card.id, entry.ts, entry.rating],
      );
    }
  }

  return orphaned;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function readSettingValues(db: SqlDatabase): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings',
  );
  return new Map(rows.map(row => [row.key, row.value]));
}

export async function writeSettingValues(
  db: SqlDatabase,
  values: ReadonlyMap<string, string>,
): Promise<void> {
  for (const [key, value] of values) {
    await db.runAsync(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }
}

// ── Snapshot write ───────────────────────────────────────────────────────────

export interface SnapshotWrite {
  folders?: readonly Folder[];
  cards?: readonly WordCard[];
  settings?: ReadonlyMap<string, string>;
}

export interface SnapshotWriteResult {
  /** Cards whose folder no longer existed and were detached instead of dropped. */
  orphanedCardIds: string[];
}

/**
 * The single atomic write path for vocabulary data.
 *
 * Folders are written before words so a word created alongside a brand-new
 * folder in the same render commit satisfies its foreign key. Everything runs
 * in one transaction: a failure anywhere leaves the previous state intact.
 */
export async function writeSnapshot(
  db: SqlDatabase,
  snapshot: SnapshotWrite,
): Promise<SnapshotWriteResult> {
  let orphanedCardIds: string[] = [];

  await db.withTransactionAsync(async () => {
    if (snapshot.folders) await syncFolders(db, snapshot.folders);

    if (snapshot.cards) {
      const knownFolderIds = new Set(
        snapshot.folders
          ? snapshot.folders.map(folder => folder.id)
          : (await db.getAllAsync<{ id: string }>('SELECT id FROM folders')).map(row => row.id),
      );
      orphanedCardIds = await syncWords(db, snapshot.cards, knownFolderIds);
    }

    if (snapshot.settings) await writeSettingValues(db, snapshot.settings);
  });

  return { orphanedCardIds };
}

// ── Audio cache metadata ─────────────────────────────────────────────────────

export interface AudioCacheEntry {
  cacheKey: string;
  fileUri: string;
  wordId?: string;
  voice?: string;
  byteSize?: number;
  createdAt: number;
  lastUsedAt: number;
}

interface AudioCacheRow {
  cache_key: string;
  word_id: string | null;
  file_uri: string;
  voice: string | null;
  byte_size: number | null;
  created_at: number;
  last_used_at: number;
}

function toAudioCacheEntry(row: AudioCacheRow): AudioCacheEntry {
  const entry: AudioCacheEntry = {
    cacheKey: row.cache_key,
    fileUri: row.file_uri,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
  if (row.word_id !== null) entry.wordId = row.word_id;
  if (row.voice !== null) entry.voice = row.voice;
  if (row.byte_size !== null) entry.byteSize = row.byte_size;
  return entry;
}

export async function recordAudioCacheEntry(db: SqlDatabase, entry: AudioCacheEntry): Promise<void> {
  await db.runAsync(
    `INSERT INTO audio_cache_metadata
       (cache_key, word_id, file_uri, voice, byte_size, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       file_uri = excluded.file_uri,
       voice = excluded.voice,
       byte_size = excluded.byte_size,
       last_used_at = excluded.last_used_at`,
    [
      entry.cacheKey,
      entry.wordId ?? null,
      entry.fileUri,
      entry.voice ?? null,
      entry.byteSize ?? null,
      entry.createdAt,
      entry.lastUsedAt,
    ],
  );
}

export async function touchAudioCacheEntry(
  db: SqlDatabase,
  cacheKey: string,
  usedAt: number,
): Promise<void> {
  await db.runAsync('UPDATE audio_cache_metadata SET last_used_at = ? WHERE cache_key = ?', [
    usedAt,
    cacheKey,
  ]);
}

export async function readAudioCacheEntries(db: SqlDatabase): Promise<AudioCacheEntry[]> {
  const rows = await db.getAllAsync<AudioCacheRow>(
    `SELECT cache_key, word_id, file_uri, voice, byte_size, created_at, last_used_at
       FROM audio_cache_metadata ORDER BY last_used_at DESC`,
  );
  return rows.map(toAudioCacheEntry);
}

export async function forgetAudioCacheEntry(db: SqlDatabase, cacheKey: string): Promise<void> {
  await db.runAsync('DELETE FROM audio_cache_metadata WHERE cache_key = ?', [cacheKey]);
}
