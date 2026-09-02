import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_SCHEMA_VERSION, migrateSchema } from '../../src/lib/sqlite/schema';
import { readWords, writeSnapshot } from '../../src/lib/sqlite/repositories';
import { exportBackup } from '../../src/lib/backup/exportBackup';
import { importBackup } from '../../src/lib/backup/importBackup';
import { validateBackup } from '../../src/lib/backup/validate';
import type { SqlDatabase } from '../../src/lib/sqlite/types';
import type { Folder, WordCard } from '../../src/types';
import { openTestDatabase } from './support/sqljs';

/**
 * "Hide Word" — a per-word display preference.
 *
 * Stored on `words` rather than `learning_progress`: it is a choice the user
 * made about the card, not a review outcome, so no grade or reset may clear it.
 */

async function freshDatabase(): Promise<SqlDatabase> {
  const db = await openTestDatabase();
  await migrateSchema(db);
  return db;
}

const FOLDER: Folder = { id: 'f1', name: 'Deck', createdAt: 1 };

function card(overrides: Partial<WordCard> = {}): WordCard {
  return {
    id: 'w1', word: 'serendipity', meaning: '偶然の幸運', note: '', folderId: 'f1',
    ...overrides,
  };
}

async function columns(db: SqlDatabase, table: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map(row => row.name);
}

// ── Schema ───────────────────────────────────────────────────────────────────

test('the column is added by an appended migration, not by editing an old one', async () => {
  const db = await freshDatabase();
  assert.ok((await columns(db, 'words')).includes('hide_word'));
  // A shipped device has already recorded versions 1 and 2 as applied, so the
  // column can only arrive as a new entry — which is what bumps the version.
  assert.equal(CURRENT_SCHEMA_VERSION, 3);
  const applied = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  assert.deepEqual(applied.map(row => row.version), [1, 2, 3]);
});

test('an existing word survives the upgrade and defaults to visible', async () => {
  // A database that stopped at version 2, exactly like an installed app: the
  // column is gone and the row is written the way that build wrote it, through
  // raw SQL rather than today's repository.
  const db = await openTestDatabase();
  await migrateSchema(db);
  await db.runAsync('DELETE FROM schema_migrations WHERE version = 3');
  await db.runAsync('ALTER TABLE words DROP COLUMN hide_word');
  await db.runAsync(
    'INSERT INTO folders (id, name, created_at, position) VALUES (?, ?, ?, ?)',
    [FOLDER.id, FOLDER.name, FOLDER.createdAt, 0],
  );
  await db.runAsync(
    'INSERT INTO words (id, folder_id, word, meaning, position, notif_off) VALUES (?, ?, ?, ?, ?, ?)',
    ['w1', FOLDER.id, 'serendipity', '偶然の幸運', 0, 0],
  );

  // Upgrading adds the column and backfills the default for the existing row.
  assert.equal(await migrateSchema(db), CURRENT_SCHEMA_VERSION);
  const words = await readWords(db);
  assert.equal(words.length, 1, 'the word survives');
  assert.equal(words[0]!.word, 'serendipity');
  assert.equal(words[0]!.hideWord, undefined, 'an opt-in feature starts off');

  // And the upgraded row is writable again through the ordinary path.
  await writeSnapshot(db, { folders: [FOLDER], cards: [card({ hideWord: true })] });
  assert.equal((await readWords(db))[0]!.hideWord, true);
});

// ── Persistence ──────────────────────────────────────────────────────────────

test('the setting is saved and loaded per word', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, {
    folders: [FOLDER],
    cards: [
      card({ id: 'w1', word: 'hidden', hideWord: true }),
      card({ id: 'w2', word: 'shown' }),
      card({ id: 'w3', word: 'explicitly-shown', hideWord: false }),
    ],
  });

  const byId = new Map((await readWords(db)).map(w => [w.id, w]));
  assert.equal(byId.get('w1')!.hideWord, true);
  // Absent rather than `false`, matching every other optional card flag.
  assert.equal(byId.get('w2')!.hideWord, undefined);
  assert.equal(byId.get('w3')!.hideWord, undefined);
});

test('turning it off again is persisted, not just dropped', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, { folders: [FOLDER], cards: [card({ hideWord: true })] });
  assert.equal((await readWords(db))[0]!.hideWord, true);

  await writeSnapshot(db, { folders: [FOLDER], cards: [card({ hideWord: false })] });
  assert.equal((await readWords(db))[0]!.hideWord, undefined, 'the card shows its word again');
});

test('the preference is independent of the review state', async () => {
  // The two hides are different columns on different tables. Grading writes the
  // scheduled one; it must not touch this.
  const db = await freshDatabase();
  await writeSnapshot(db, {
    folders: [FOLDER],
    cards: [card({ hideWord: true, testLevel: 'good', testNextReview: 5_000, hiddenUntil: 9_000 })],
  });
  const [stored] = await readWords(db);
  assert.equal(stored!.hideWord, true);
  assert.equal(stored!.hiddenUntil, 9_000);

  // Clearing the review outcome leaves the display preference alone.
  await writeSnapshot(db, { folders: [FOLDER], cards: [card({ hideWord: true })] });
  const [afterReset] = await readWords(db);
  assert.equal(afterReset!.hideWord, true);
  assert.equal(afterReset!.hiddenUntil, undefined);
});

// ── Backup ───────────────────────────────────────────────────────────────────

test('the setting round-trips through an export and import', async () => {
  const source = await freshDatabase();
  await writeSnapshot(source, {
    folders: [FOLDER],
    cards: [card({ id: 'w1', word: 'hidden', hideWord: true }), card({ id: 'w2', word: 'shown' })],
  });

  const file = await exportBackup(source, { appVersion: '1.0.0', now: () => new Date(0) });
  const exported = new Map(file.data.words.map(w => [w.id, w]));
  assert.equal(exported.get('w1')!.hideWord, true);
  // Omitted when off, so the file does not grow a field per unaffected word.
  assert.equal('hideWord' in exported.get('w2')!, false);

  // It survives validation, which is what an import actually reads.
  const validated = validateBackup(JSON.parse(JSON.stringify(file)));
  assert.equal(validated.ok, true, JSON.stringify(validated));

  const target = await freshDatabase();
  await importBackup(target, file, { mode: 'replace' });
  const restored = new Map((await readWords(target)).map(w => [w.id, w]));
  assert.equal(restored.get('w1')!.hideWord, true);
  assert.equal(restored.get('w2')!.hideWord, undefined);
});

test('a backup written before the field existed still imports', async () => {
  const source = await freshDatabase();
  await writeSnapshot(source, { folders: [FOLDER], cards: [card({ hideWord: true })] });
  const file = await exportBackup(source, { appVersion: '1.0.0', now: () => new Date(0) });

  // Strip the field, as an older export would have.
  const older = JSON.parse(JSON.stringify(file));
  for (const word of older.data.words) delete word.hideWord;

  const validated = validateBackup(older);
  assert.equal(validated.ok, true, 'the field is optional, so its absence is valid');

  const target = await freshDatabase();
  await importBackup(target, older, { mode: 'replace' });
  assert.equal((await readWords(target))[0]!.hideWord, undefined, 'imports as visible');
});

test('a non-boolean value is rejected rather than coerced', async () => {
  const source = await freshDatabase();
  await writeSnapshot(source, { folders: [FOLDER], cards: [card()] });
  const file = await exportBackup(source, { appVersion: '1.0.0', now: () => new Date(0) });

  const tampered = JSON.parse(JSON.stringify(file));
  tampered.data.words[0].hideWord = 'yes';
  const validated = validateBackup(tampered);
  assert.equal(validated.ok, false);
  assert.match(JSON.stringify(validated), /hideWord must be a boolean/u);
});
