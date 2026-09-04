import type { SqlDatabase } from './types';

/**
 * SQLite schema and migration runner.
 *
 * Every structured piece of vocabulary data lives here. Nothing in this file
 * touches the network: the database is the whole source of truth for words,
 * folders, notes, review state and settings, which is what makes the app work
 * fully offline.
 */

/** Bumped whenever a new entry is appended to MIGRATIONS. */
export const CURRENT_SCHEMA_VERSION = 5;

/** Identifiers of the built-in review levels, seeded into `labels`. */
export const LEVEL_LABEL_IDS = {
  perfect: 'level:perfect',
  good: 'level:good',
  slightly: 'level:slightly',
  unknown: 'level:unknown',
} as const;

export type LevelName = keyof typeof LEVEL_LABEL_IDS;

const LEVEL_BY_ID: ReadonlyMap<string, LevelName> = new Map(
  Object.entries(LEVEL_LABEL_IDS).map(([name, id]) => [id, name as LevelName]),
);

export function levelIdFor(level: LevelName): string {
  return LEVEL_LABEL_IDS[level];
}

export function levelFromId(id: string | null): LevelName | null {
  return id === null ? null : LEVEL_BY_ID.get(id) ?? null;
}

const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS folders (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  icon        TEXT,
  color       TEXT,
  -- NULL means "folder has no notification override"; 0 means "explicitly off".
  notif_interval_seconds  INTEGER,
  notif_display_only_word INTEGER,
  -- Preserves the user's manual folder ordering, which array order used to carry.
  position    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS labels (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  -- 'level' rows are the four built-in review levels seeded below. The table is
  -- open to other kinds, but nothing in the app writes them today.
  kind      TEXT NOT NULL,
  color     TEXT,
  position  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS words (
  id          TEXT    PRIMARY KEY,
  -- A deleted folder must never delete the user's words, so orphans are kept
  -- and surfaced in the "no folder" bucket rather than cascaded away.
  folder_id   TEXT    REFERENCES folders(id) ON DELETE SET NULL,
  word        TEXT    NOT NULL,
  meaning     TEXT    NOT NULL,
  created_at  INTEGER,
  position    INTEGER NOT NULL,
  notif_off   INTEGER NOT NULL DEFAULT 0,
  word_lang   TEXT,
  meaning_lang TEXT,
  audio_uri    TEXT,
  audio_speed  REAL,
  audio_volume REAL
);

CREATE TABLE IF NOT EXISTS notes (
  word_id TEXT PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
  body    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS word_labels (
  word_id  TEXT NOT NULL REFERENCES words(id)  ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (word_id, label_id)
);

CREATE TABLE IF NOT EXISTS learning_progress (
  word_id        TEXT PRIMARY KEY REFERENCES words(id)  ON DELETE CASCADE,
  -- The single source of truth for a word's review level.
  level_id       TEXT REFERENCES labels(id) ON DELETE SET NULL,
  next_review_at INTEGER,
  mastered       INTEGER NOT NULL DEFAULT 0
);
-- hidden_until is added by migration 2 rather than here, so an install created
-- at version 1 and one created today converge on the same schema.

CREATE TABLE IF NOT EXISTS review_history (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id  TEXT    NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  rated_at INTEGER NOT NULL,
  rating   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Index of the on-disk TTS audio cache. The audio itself stays on the
-- filesystem; only its bookkeeping lives here.
CREATE TABLE IF NOT EXISTS audio_cache_metadata (
  cache_key    TEXT PRIMARY KEY,
  word_id      TEXT REFERENCES words(id) ON DELETE CASCADE,
  file_uri     TEXT    NOT NULL,
  voice        TEXT,
  byte_size    INTEGER,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_words_folder_position   ON words(folder_id, position);
CREATE INDEX IF NOT EXISTS idx_words_created_at        ON words(created_at);
CREATE INDEX IF NOT EXISTS idx_word_labels_label       ON word_labels(label_id);
CREATE INDEX IF NOT EXISTS idx_learning_next_review    ON learning_progress(next_review_at);
CREATE INDEX IF NOT EXISTS idx_review_history_word     ON review_history(word_id, rated_at);
CREATE INDEX IF NOT EXISTS idx_audio_cache_word        ON audio_cache_metadata(word_id);
CREATE INDEX IF NOT EXISTS idx_audio_cache_last_used   ON audio_cache_metadata(last_used_at);
`;

const SEED_LEVEL_LABELS = `
INSERT OR IGNORE INTO labels (id, name, kind, position) VALUES
  ('${LEVEL_LABEL_IDS.perfect}',  'perfect',  'level', 0),
  ('${LEVEL_LABEL_IDS.good}',     'good',     'level', 1),
  ('${LEVEL_LABEL_IDS.slightly}', 'slightly', 'level', 2),
  ('${LEVEL_LABEL_IDS.unknown}',  'unknown',  'level', 3);
`;

interface Migration {
  version: number;
  up(db: SqlDatabase): Promise<void>;
}

/**
 * The columns a table currently has.
 *
 * A migration that adds a column is normally allowed to assume the column is
 * absent, because its version number is recorded in the same transaction and it
 * therefore runs exactly once. Migration 5 cannot assume that — see its note —
 * so it asks first. `table` is always a literal from this file; PRAGMA does not
 * take a bound parameter for it.
 */
async function tableColumns(db: SqlDatabase, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map(row => row.name));
}

/**
 * Append-only. Never edit or renumber an existing entry — a shipped device has
 * already recorded that version as applied and will skip it.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    async up(db) {
      await db.execAsync(INITIAL_SCHEMA);
      await db.execAsync(SEED_LEVEL_LABELS);
    },
  },
  {
    // "Sync with test results": a Pretty good grade hides the card for 72 hours.
    //
    // Unix milliseconds UTC, matching next_review_at, so a timezone change
    // cannot shorten or extend the period and no parsing happens per row.
    // NULL means visible, which is what every existing row gets — so the
    // feature starts off for everyone, as required.
    version: 2,
    async up(db) {
      await db.execAsync('ALTER TABLE learning_progress ADD COLUMN hidden_until INTEGER;');
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_learning_hidden_until ON learning_progress(hidden_until);',
      );
    },
  },
  {
    // "Hide Word": the word text is not drawn on this card's study faces.
    //
    // A per-word display preference, so it belongs on `words` rather than on
    // `learning_progress` — it is not a review outcome and no grade may clear
    // it. NOT NULL DEFAULT 0 gives every existing row "visible", which is what
    // an opt-in feature has to start at; SQLite backfills the default for rows
    // that already exist, so there is no second pass to write.
    version: 3,
    async up(db) {
      await db.execAsync('ALTER TABLE words ADD COLUMN hide_word INTEGER NOT NULL DEFAULT 0;');
    },
  },
  {
    // Retired, and deliberately empty.
    //
    // Version 4 was used twice during development, for two different features,
    // and neither reached a release. Development databases therefore disagree
    // about what having it recorded means: some have the columns a later draft
    // added, some have columns from a draft that was reverted, some have
    // neither. Because the runner skips any version already recorded, nothing
    // put here could reach the first group at all.
    //
    // So version 4 asserts nothing, and the work moved to version 5, which
    // checks the database rather than trusting the number. The entry stays
    // because the list is append-only: removing it would renumber 5 and repeat
    // the mistake.
    version: 4,
    async up() {},
  },
  {
    // Notifications become opt-in, per word.
    //
    // `notif_candidate` replaces `notif_off` and means the opposite: the user
    // put this word on the list, rather than took it off. A fresh word defaults
    // to 0 — nothing notifies until it is added, which is the point.
    //
    // `notif_notify_all_words` is the per-folder override: NULL for every
    // existing folder, which reads as off — the candidate list applies.
    //
    // Written defensively, unlike every migration above it. Each column is added
    // only if it is missing, because a development database may already have it
    // from the abandoned version 4 above, and re-adding a column is an error
    // that would fail the whole upgrade and leave the app unable to read its
    // own words. A released install has none of this ambiguity — it is at
    // version 3 and takes the plain path through both branches.
    //
    // The backfill is what keeps this from silently switching an upgrading
    // user's reminders off: every word that would have fired yesterday
    // (`notif_off = 0`) becomes a candidate, so the same words keep arriving and
    // the new list starts out describing the behaviour they already had. It runs
    // only where this migration created the column. A database that already had
    // it has already been through this, and re-running the backfill there would
    // put back every word the user has since taken off the list — a silent edit
    // to their data, which is worse than the reminder gap it would close.
    //
    // `notif_off` is left in place rather than dropped. Nothing reads or writes
    // it any more; keeping the column costs a byte per row and means the
    // backfill's source data still exists if it ever has to be re-examined,
    // which dropping it would make impossible.
    version: 5,
    async up(db) {
      const words = await tableColumns(db, 'words');
      if (!words.has('notif_candidate')) {
        await db.execAsync('ALTER TABLE words ADD COLUMN notif_candidate INTEGER NOT NULL DEFAULT 0;');
        // Guarded because the backfill reads a column rather than writing one:
        // `notif_off` is in the initial schema and so is always present, but a
        // migration that assumes its source exists fails destructively if that
        // ever stops being true.
        if (words.has('notif_off')) {
          await db.execAsync('UPDATE words SET notif_candidate = 1 WHERE notif_off = 0;');
        }
      }

      const folders = await tableColumns(db, 'folders');
      if (!folders.has('notif_notify_all_words')) {
        await db.execAsync('ALTER TABLE folders ADD COLUMN notif_notify_all_words INTEGER;');
      }
    },
  },
];

/**
 * Brings the database up to CURRENT_SCHEMA_VERSION.
 *
 * Each migration runs inside its own transaction and records its version in the
 * same transaction, so a failure part-way leaves the database at the previous
 * version rather than in a half-migrated state. Running this repeatedly is a
 * no-op once every version is present.
 */
export async function migrateSchema(db: SqlDatabase): Promise<number> {
  // Foreign keys are per-connection in SQLite and off by default, so this must
  // be set on every connection, not just at creation time.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations',
  );
  const appliedVersions = new Set(applied.map(row => row.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.runAsync('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
        migration.version,
        Date.now(),
      ]);
    });
  }

  const current = await db.getFirstAsync<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_migrations',
  );
  return current?.version ?? 0;
}

/** True when foreign-key enforcement is active on this connection. */
export async function foreignKeysEnabled(db: SqlDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  return row?.foreign_keys === 1;
}
