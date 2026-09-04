import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_SCHEMA_VERSION, migrateSchema } from '../../src/lib/sqlite/schema';
import { readFolders, readWords } from '../../src/lib/sqlite/repositories';
import type { SqlDatabase } from '../../src/lib/sqlite/types';
import { openTestDatabase } from './support/sqljs';

/**
 * Migration 5, which turns notifications opt-in.
 *
 * It is the one migration in the list that cannot assume it has never run
 * before: version 4 was consumed twice during development, so a database that
 * has 4 recorded may have its columns, may have a reverted draft's columns, or
 * may have neither. These are the four states it has to survive — the third is
 * the one that crashed bootstrap with "no such column: notif_candidate", because
 * the runner skipped the recorded version and `readWords` then queried a column
 * that had never been created.
 */

async function columns(db: SqlDatabase, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map(row => row.name));
}

/** A word row written the way a build before this migration wrote it. */
async function insertLegacyWord(db: SqlDatabase, id: string, notifOff: 0 | 1): Promise<void> {
  await db.runAsync(
    'INSERT INTO words (id, word, meaning, position, notif_off) VALUES (?, ?, ?, ?, ?)',
    [id, id, id, 0, notifOff],
  );
}

/** Rewinds a fully migrated database to the state named, without touching rows. */
async function rewindTo(db: SqlDatabase, options: {
  recordedVersions: number[];
  dropColumns: boolean;
}): Promise<void> {
  await db.runAsync('DELETE FROM schema_migrations WHERE version >= 4');
  for (const version of options.recordedVersions) {
    await db.runAsync('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [version, 1]);
  }
  if (options.dropColumns) {
    await db.execAsync('ALTER TABLE words DROP COLUMN notif_candidate');
    await db.execAsync('ALTER TABLE folders DROP COLUMN notif_notify_all_words');
  }
}

// ── 3. Fresh installation ────────────────────────────────────────────────────

test('a fresh install ends up with both columns and nothing on the list', async () => {
  const db = await openTestDatabase();
  assert.equal(await migrateSchema(db), CURRENT_SCHEMA_VERSION);

  assert.ok((await columns(db, 'words')).has('notif_candidate'));
  assert.ok((await columns(db, 'folders')).has('notif_notify_all_words'));
  assert.deepEqual(await readWords(db), [], 'and no words to be on it');
});

// ── 1. An existing user still on notif_off ───────────────────────────────────

test('a released install upgrades from version 3 and keeps its reminders', async () => {
  const db = await openTestDatabase();
  await migrateSchema(db);
  // Exactly what a shipped device looks like: version 3 is the last release.
  await rewindTo(db, { recordedVersions: [], dropColumns: true });

  await insertLegacyWord(db, 'notifying', 0);
  await insertLegacyWord(db, 'muted', 1);
  await db.runAsync(
    `INSERT INTO folders (
       id, name, created_at, notif_interval_seconds, notif_display_only_word, position
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    ['enabled-folder', 'Enabled', 1, 3600, 1, 0],
  );

  assert.equal(await migrateSchema(db), CURRENT_SCHEMA_VERSION);

  const byId = new Map((await readWords(db)).map(word => [word.id, word]));
  assert.equal(byId.size, 2, 'no word was lost');
  assert.equal(
    byId.get('notifying')!.notifCandidate,
    true,
    'a word that was firing yesterday is on the new list',
  );
  assert.equal(
    byId.get('muted')!.notifCandidate,
    undefined,
    'a word the user had muted stays off it',
  );
  assert.deepEqual(
    (await readFolders(db))[0]?.notifSettings,
    { intervalSeconds: 3600, displayOnlyWord: true },
    'the migration does not replace a saved folder schedule with the new default',
  );
});

// ── 2a. Version 4 recorded, columns never created ────────────────────────────

test('a database that recorded version 4 without its columns is repaired', async () => {
  // The crash. A development database ran a draft numbered 4, so the runner
  // skips 4 forever — nothing put there can reach it, and the repair has to
  // arrive as a version that database has not seen.
  const db = await openTestDatabase();
  await migrateSchema(db);
  await rewindTo(db, { recordedVersions: [4], dropColumns: true });
  await insertLegacyWord(db, 'w1', 0);

  await assert.rejects(readWords(db), 'precondition: this is the state that failed');

  assert.equal(await migrateSchema(db), CURRENT_SCHEMA_VERSION);
  assert.ok((await columns(db, 'words')).has('notif_candidate'));
  assert.ok((await columns(db, 'folders')).has('notif_notify_all_words'));
  assert.equal((await readWords(db))[0]!.notifCandidate, true, 'and it is backfilled');
  assert.deepEqual(await readFolders(db), [], 'folders read again too');
});

// ── 2b. The columns are already there ────────────────────────────────────────

test('re-running over existing columns neither fails nor re-backfills', async () => {
  const db = await openTestDatabase();
  await migrateSchema(db);

  // A word the user has deliberately taken off the list: it was notifying once,
  // so `notif_off` is still 0, but `notif_candidate` is 0 because they removed it.
  await db.runAsync(
    'INSERT INTO words (id, word, meaning, position, notif_off, notif_candidate) VALUES (?, ?, ?, ?, ?, ?)',
    ['removed', 'removed', 'removed', 0, 0, 0],
  );

  // The columns survive, only the marker is missing — a migration interrupted
  // after its DDL, or a database carrying a later draft's columns.
  await rewindTo(db, { recordedVersions: [4], dropColumns: false });
  assert.equal(await migrateSchema(db), CURRENT_SCHEMA_VERSION, 'it runs without error');

  assert.equal(
    (await readWords(db))[0]!.notifCandidate,
    undefined,
    'the backfill did not put back a word the user removed',
  );
});

test('the whole runner stays idempotent afterwards', async () => {
  const db = await openTestDatabase();
  await migrateSchema(db);
  await migrateSchema(db);
  await migrateSchema(db);

  const rows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  assert.deepEqual(rows.map(row => row.version), [1, 2, 3, 4, 5]);
  assert.equal(rows.length, CURRENT_SCHEMA_VERSION, 'one row per version, no duplicates');
});

// ── 4. Restored backups and old AsyncStorage records ─────────────────────────
//
// Covered where those paths live: backupWordIsNotifCandidate in
// tests/unit/backup.test.ts and parseCard in tests/unit/sqliteMigration.test.ts.
// Both convert a record with no `notifCandidate` the same way this migration
// does, so a restore and an upgrade agree about what the word was doing.
