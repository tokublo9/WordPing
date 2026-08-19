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
export const CURRENT_SCHEMA_VERSION = 1;

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
