import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateSchema } from '../../src/lib/sqlite/schema';
import {
  hasMigratedLegacyStorage,
  migrateLegacyStorage,
  MIGRATION_MARKER_KEY,
  type LegacyStorageKeys,
} from '../../src/lib/sqlite/legacyMigration';
import {
  readFolders,
  readSettingValues,
  readWords,
  writeSnapshot,
} from '../../src/lib/sqlite/repositories';
import type { SqlDatabase } from '../../src/lib/sqlite/types';
import type { Folder, WordCard } from '../../src/types';
import { MemoryKeyValueStore, openTestDatabase } from './support/sqljs';

const KEYS: LegacyStorageKeys = {
  cards: 'vocabulary_cards',
  folders: 'wordping_folders',
  themeColor: 'theme_color',
  appearance: 'appearance',
  skinId: 'theme_skin',
  language: 'app_language',
  aiVoice: 'ai_voice',
};

const LEGACY_FOLDERS: Folder[] = [
  { id: 'f-verbs', name: 'Verbs', createdAt: 1700000000000, icon: 'book', color: '#ff0000' },
  {
    id: 'f-nouns', name: 'Nouns', createdAt: 1700000001000,
    notifSettings: { intervalSeconds: 3600, displayOnlyWord: true },
  },
];

/**
 * A card as the AsyncStorage era wrote it: `notifOff`, the mute that
 * `notifCandidate` replaced, instead of the notification list.
 */
type LegacyCard = WordCard & { notifOff?: boolean };

/** The legacy shape minus the field the new model does not store. */
function withoutNotifOff(card: LegacyCard): WordCard {
  const { notifOff: _notifOff, ...rest } = card;
  return rest;
}

const LEGACY_CARDS: LegacyCard[] = [
  {
    id: 'w-run', createdAt: 1700000002000, word: 'run', meaning: 'to move quickly',
    note: 'irregular verb', folderId: 'f-verbs', wordLang: 'en-US', meaningLang: 'ja',
    testLevel: 'good', testNextReview: 1800000000000, testMastered: true,
    reviewHistory: [{ ts: 10, rating: 'unknown' }, { ts: 20, rating: 'good' }],
    audioUri: 'file:///audio/run.mp3', audioSpeed: 1.25, audioVolume: 0.8,
  },
  {
    id: 'w-apple', createdAt: 1700000003000, word: 'apple', meaning: 'a fruit',
    note: '', folderId: 'f-nouns', notifOff: true,
    // The mute `notifCandidate` replaced: this word was silenced, so it does not
    // join the notification list.
  },
  { id: 'w-loose', createdAt: 1700000004000, word: 'loose', meaning: 'not tight', note: '' },
];

async function seededStore(overrides: Record<string, string> = {}): Promise<MemoryKeyValueStore> {
  const store = new MemoryKeyValueStore();
  await store.setItem(KEYS.cards, JSON.stringify(LEGACY_CARDS));
  await store.setItem(KEYS.folders, JSON.stringify(LEGACY_FOLDERS));
  await store.setItem(KEYS.themeColor, '#7C6BF8');
  await store.setItem(KEYS.appearance, 'dark');
  await store.setItem(KEYS.language, 'ja');
  await store.setItem(KEYS.aiVoice, 'nova');
  for (const [key, value] of Object.entries(overrides)) await store.setItem(key, value);
  return store;
}

async function freshDatabase(): Promise<SqlDatabase> {
  const db = await openTestDatabase();
  await migrateSchema(db);
  return db;
}

test('migration imports words, folders and settings', async () => {
  const db = await freshDatabase();
  const store = await seededStore();

  const outcome = await migrateLegacyStorage(db, store, KEYS);
  assert.deepEqual(outcome, { status: 'migrated', words: 3, folders: 2, settings: 4 });

  const words = await readWords(db);
  const folders = await readFolders(db);
  assert.equal(words.length, 3);
  assert.equal(folders.length, 2);

  const settings = await readSettingValues(db);
  assert.equal(settings.get(KEYS.themeColor), '#7C6BF8');
  assert.equal(settings.get(KEYS.appearance), 'dark');
  assert.equal(settings.get(KEYS.language), 'ja');
  assert.equal(settings.get(KEYS.aiVoice), 'nova');
});

test('migration preserves ids, timestamps, ordering and every field', async () => {
  const db = await freshDatabase();
  await migrateLegacyStorage(db, await seededStore(), KEYS);

  const words = await readWords(db);
  assert.deepEqual(words.map(word => word.id), ['w-run', 'w-apple', 'w-loose']);

  const [run, apple, loose] = words;
  // `notifOff` is converted to `notifCandidate` on the way in — a word that was
  // not muted was notifying, so it lands on the new list and the user's reminders
  // survive the upgrade. `notifOff` itself is not stored, so it does not come back.
  assert.deepEqual(run, { ...withoutNotifOff(LEGACY_CARDS[0]), notifCandidate: true });
  assert.deepEqual(apple, withoutNotifOff(LEGACY_CARDS[1]), 'a muted word stays off the list');
  assert.deepEqual(loose, { ...withoutNotifOff(LEGACY_CARDS[2]), notifCandidate: true });

  const folders = await readFolders(db);
  assert.deepEqual(folders, LEGACY_FOLDERS);
});

test('migration preserves folder relationships', async () => {
  const db = await freshDatabase();
  await migrateLegacyStorage(db, await seededStore(), KEYS);

  const rows = await db.getAllAsync<{ id: string; folder_id: string | null }>(
    'SELECT id, folder_id FROM words ORDER BY position',
  );
  assert.deepEqual(rows, [
    { id: 'w-run', folder_id: 'f-verbs' },
    { id: 'w-apple', folder_id: 'f-nouns' },
    { id: 'w-loose', folder_id: null },
  ]);
});

test('migration preserves review state in the relational tables', async () => {
  const db = await freshDatabase();
  await migrateLegacyStorage(db, await seededStore(), KEYS);

  const progress = await db.getAllAsync<{ word_id: string; level_id: string; next_review_at: number; mastered: number }>(
    'SELECT word_id, level_id, next_review_at, mastered FROM learning_progress',
  );
  assert.deepEqual(progress, [
    { word_id: 'w-run', level_id: 'level:good', next_review_at: 1800000000000, mastered: 1 },
  ]);

  const history = await db.getAllAsync<{ rated_at: number; rating: string }>(
    'SELECT rated_at, rating FROM review_history WHERE word_id = ? ORDER BY rated_at',
    ['w-run'],
  );
  assert.deepEqual(history, [
    { rated_at: 10, rating: 'unknown' },
    { rated_at: 20, rating: 'good' },
  ]);
});

test('migration is idempotent and never duplicates data', async () => {
  const db = await freshDatabase();
  const store = await seededStore();

  assert.equal((await migrateLegacyStorage(db, store, KEYS)).status, 'migrated');
  assert.equal((await migrateLegacyStorage(db, store, KEYS)).status, 'already-migrated');
  assert.equal((await migrateLegacyStorage(db, store, KEYS)).status, 'already-migrated');

  assert.equal((await readWords(db)).length, 3);
  assert.equal((await readFolders(db)).length, 2);

  const noteRows = await db.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM notes');
  const historyRows = await db.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM review_history');
  assert.equal(noteRows[0]?.count, 1);
  assert.equal(historyRows[0]?.count, 2);
});

test('a second migration never overwrites edits made after the first', async () => {
  const db = await freshDatabase();
  const store = await seededStore();
  await migrateLegacyStorage(db, store, KEYS);

  // The user renames a word after upgrading.
  const words = await readWords(db);
  const edited = words.map(word => (word.id === 'w-run' ? { ...word, meaning: 'edited meaning' } : word));
  await writeSnapshot(db, { cards: edited });

  await migrateLegacyStorage(db, store, KEYS);

  const after = await readWords(db);
  assert.equal(after.find(word => word.id === 'w-run')?.meaning, 'edited meaning');
});

test('migration never deletes or rewrites the legacy source', async () => {
  const db = await freshDatabase();
  const store = await seededStore();
  const before = store.snapshot();

  await migrateLegacyStorage(db, store, KEYS);

  assert.deepEqual(store.snapshot(), before);
});

test('a first install is marked as migrated without inventing data', async () => {
  const db = await freshDatabase();
  const store = new MemoryKeyValueStore();

  assert.deepEqual(await migrateLegacyStorage(db, store, KEYS), { status: 'nothing-to-migrate' });
  assert.equal(await hasMigratedLegacyStorage(db), true);
  assert.equal((await readWords(db)).length, 0);
  assert.equal((await readFolders(db)).length, 0);

  assert.equal((await migrateLegacyStorage(db, store, KEYS)).status, 'already-migrated');
});

test('corrupt legacy JSON is skipped rather than aborting the migration', async () => {
  const db = await freshDatabase();
  const store = new MemoryKeyValueStore();
  await store.setItem(KEYS.cards, '{ this is not json');
  await store.setItem(KEYS.folders, JSON.stringify(LEGACY_FOLDERS));
  await store.setItem(KEYS.language, 'ko');

  const outcome = await migrateLegacyStorage(db, store, KEYS);
  assert.equal(outcome.status, 'migrated');
  assert.equal((await readWords(db)).length, 0);
  assert.equal((await readFolders(db)).length, 2);
  assert.equal((await readSettingValues(db)).get(KEYS.language), 'ko');
});

test('individually malformed records are dropped, valid neighbours survive', async () => {
  const db = await freshDatabase();
  const store = new MemoryKeyValueStore();
  await store.setItem(
    KEYS.cards,
    JSON.stringify([
      { id: 'ok', word: 'valid', meaning: 'fine', note: '' },
      { id: 'missing-meaning', word: 'broken' },
      null,
      'not an object',
      { word: 'no id', meaning: 'x' },
    ]),
  );

  await migrateLegacyStorage(db, store, KEYS);
  const words = await readWords(db);
  assert.deepEqual(words.map(word => word.id), ['ok']);
});

test('duplicate legacy ids collapse to the first occurrence', async () => {
  const db = await freshDatabase();
  const store = new MemoryKeyValueStore();
  await store.setItem(
    KEYS.cards,
    JSON.stringify([
      { id: 'dup', word: 'first', meaning: 'kept', note: '' },
      { id: 'dup', word: 'second', meaning: 'dropped', note: '' },
      { id: 'other', word: 'other', meaning: 'kept', note: '' },
    ]),
  );

  await migrateLegacyStorage(db, store, KEYS);
  const words = await readWords(db);
  assert.deepEqual(words.map(word => word.word), ['first', 'other']);
});

test('a card pointing at a missing folder keeps the word and drops the link', async () => {
  const db = await freshDatabase();
  const store = new MemoryKeyValueStore();
  await store.setItem(
    KEYS.cards,
    JSON.stringify([{ id: 'w1', word: 'orphan', meaning: 'no folder', note: '', folderId: 'gone' }]),
  );
  await store.setItem(KEYS.folders, JSON.stringify([]));

  await migrateLegacyStorage(db, store, KEYS);

  const words = await readWords(db);
  assert.equal(words.length, 1);
  assert.equal(words[0]?.word, 'orphan');
  assert.equal(words[0]?.folderId, undefined);
});

test('the marker row is written inside the same transaction as the data', async () => {
  const db = await freshDatabase();
  await migrateLegacyStorage(db, await seededStore(), KEYS);

  const marker = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [MIGRATION_MARKER_KEY],
  );
  assert.ok(marker);
  assert.ok(Number(marker.value) > 0);
});
