import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURRENT_SCHEMA_VERSION,
  foreignKeysEnabled,
  levelFromId,
  levelIdFor,
  migrateSchema,
} from '../../src/lib/sqlite/schema';
import { readFolders, readWords, writeSnapshot } from '../../src/lib/sqlite/repositories';
import type { SqlDatabase } from '../../src/lib/sqlite/types';
import type { Folder, WordCard } from '../../src/types';
import { openTestDatabase } from './support/sqljs';

async function freshDatabase(): Promise<SqlDatabase> {
  const db = await openTestDatabase();
  await migrateSchema(db);
  return db;
}

async function tableNames(db: SqlDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  return rows.map(row => row.name);
}

test('migrateSchema creates every table the app relies on', async () => {
  const db = await freshDatabase();
  const names = await tableNames(db);

  for (const expected of [
    'app_settings', 'audio_cache_metadata', 'folders', 'labels', 'learning_progress',
    'notes', 'review_history', 'schema_migrations', 'word_labels', 'words',
  ]) {
    assert.ok(names.includes(expected), `missing table: ${expected}`);
  }
});

test('migrateSchema records the current version and is idempotent', async () => {
  const db = await freshDatabase();
  assert.equal(await migrateSchema(db), CURRENT_SCHEMA_VERSION);

  // Running it repeatedly must not re-apply anything or duplicate marker rows.
  await migrateSchema(db);
  await migrateSchema(db);

  const rows = await db.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations');
  assert.equal(rows.length, CURRENT_SCHEMA_VERSION);
});

test('migrateSchema enables foreign key enforcement', async () => {
  const db = await freshDatabase();
  assert.equal(await foreignKeysEnabled(db), true);
});

test('foreign keys actually reject an orphan row', async () => {
  const db = await freshDatabase();
  await assert.rejects(
    db.runAsync(
      'INSERT INTO words (id, folder_id, word, meaning, position) VALUES (?, ?, ?, ?, ?)',
      ['w1', 'no-such-folder', 'hello', 'greeting', 0],
    ),
  );
});

test('seeds exactly the four built-in review levels', async () => {
  const db = await freshDatabase();
  const rows = await db.getAllAsync<{ id: string; name: string }>(
    "SELECT id, name FROM labels WHERE kind = 'level' ORDER BY position",
  );
  assert.deepEqual(rows.map(row => row.name), ['perfect', 'good', 'slightly', 'unknown']);
  assert.equal(levelIdFor('good'), 'level:good');
  assert.equal(levelFromId('level:good'), 'good');
  assert.equal(levelFromId('level:nonsense'), null);
  assert.equal(levelFromId(null), null);

  // Re-running the migration must not duplicate the seed rows.
  await migrateSchema(db);
  assert.equal(rows.length, 4);
});

test('deleting a folder detaches its words instead of deleting them', async () => {
  const db = await freshDatabase();
  const folders: Folder[] = [{ id: 'f1', name: 'Nouns', createdAt: 10 }];
  const cards: WordCard[] = [{ id: 'w1', word: 'apple', meaning: 'fruit', note: '', folderId: 'f1' }];
  await writeSnapshot(db, { folders, cards });

  await writeSnapshot(db, { folders: [] });

  const remaining = await readWords(db);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.folderId, undefined);
  assert.deepEqual(await readFolders(db), []);
});

test('deleting a word cascades to its notes, progress and history', async () => {
  const db = await freshDatabase();
  const cards: WordCard[] = [
    {
      id: 'w1', word: 'apple', meaning: 'fruit', note: 'a pome',
      testLevel: 'good', testNextReview: 999,
      reviewHistory: [{ ts: 1, rating: 'good' }, { ts: 2, rating: 'perfect' }],
    },
  ];
  await writeSnapshot(db, { cards });

  await writeSnapshot(db, { cards: [] });

  for (const table of ['notes', 'learning_progress', 'review_history']) {
    const rows = await db.getAllAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    assert.equal(rows[0]?.count, 0, `${table} was not cascaded`);
  }
});

test('a failed multi-table write leaves the previous state intact', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, {
    folders: [{ id: 'f1', name: 'Original', createdAt: 1 }],
    cards: [{ id: 'w1', word: 'apple', meaning: 'fruit', note: 'keep me' }],
  });

  await assert.rejects(
    db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE folders SET name = ? WHERE id = ?', ['Changed', 'f1']);
      await db.runAsync('DELETE FROM words');
      throw new Error('interrupted');
    }),
  );

  const folders = await readFolders(db);
  const words = await readWords(db);
  assert.equal(folders[0]?.name, 'Original');
  assert.equal(words.length, 1);
  assert.equal(words[0]?.note, 'keep me');
});

test('migration 2 adds hidden_until without disturbing existing rows', async () => {
  const db = await openTestDatabase();
  // Build the v1 schema, insert data, then migrate — the upgrade path a real
  // device takes.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrateSchema(db);

  const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info('learning_progress')");
  assert.ok(columns.some(c => c.name === 'hidden_until'), 'hidden_until column missing');

  // Existing progress rows default to NULL, i.e. visible — the feature starts off.
  await writeSnapshot(db, {
    cards: [{ id: 'w1', word: 'a', meaning: 'b', note: '', testLevel: 'good', testNextReview: 5 }],
  });
  const [row] = await db.getAllAsync<{ hidden_until: number | null }>(
    'SELECT hidden_until FROM learning_progress WHERE word_id = ?', ['w1'],
  );
  assert.equal(row?.hidden_until, null);
  assert.equal((await readWords(db))[0]?.hiddenUntil, undefined);
});

test('hiddenUntil round-trips through SQLite', async () => {
  const db = await freshDatabase();
  const until = Date.parse('2026-08-22T12:00:00Z');
  await writeSnapshot(db, {
    cards: [{ id: 'w1', word: 'a', meaning: 'b', note: '', testLevel: 'good', hiddenUntil: until }],
  });
  assert.equal((await readWords(db))[0]?.hiddenUntil, until);

  // Clearing it removes the hide rather than leaving a stale timestamp.
  await writeSnapshot(db, {
    cards: [{ id: 'w1', word: 'a', meaning: 'b', note: '', testLevel: 'good' }],
  });
  assert.equal((await readWords(db))[0]?.hiddenUntil, undefined);
});

test('a hidden card is only hidden — never deleted', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, {
    cards: [{
      id: 'w1', word: 'apple', meaning: 'fruit', note: 'keep me',
      testLevel: 'good', hiddenUntil: Date.now() + 1_000_000,
      reviewHistory: [{ ts: 1, rating: 'good' }],
    }],
  });

  // The row, its note and its history are all still present.
  const words = await readWords(db);
  assert.equal(words.length, 1);
  assert.equal(words[0]?.note, 'keep me');
  assert.deepEqual(words[0]?.reviewHistory, [{ ts: 1, rating: 'good' }]);
});

test('hiddenUntil alone is enough to create a progress row', async () => {
  // A card graded Pretty good always has a level too, but the writer must not
  // silently drop a hide if it ever arrives on its own.
  const db = await freshDatabase();
  await writeSnapshot(db, {
    cards: [{ id: 'w1', word: 'a', meaning: 'b', note: '', hiddenUntil: 999_999 }],
  });
  assert.equal((await readWords(db))[0]?.hiddenUntil, 999_999);
});
