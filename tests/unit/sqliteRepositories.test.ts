import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateSchema } from '../../src/lib/sqlite/schema';
import {
  forgetAudioCacheEntry,
  readAudioCacheEntries,
  readFolders,
  readSettingValues,
  readWords,
  recordAudioCacheEntry,
  touchAudioCacheEntry,
  writeSnapshot,
} from '../../src/lib/sqlite/repositories';
import type { SqlDatabase } from '../../src/lib/sqlite/types';
import type { Folder, WordCard } from '../../src/types';
import { openTestDatabase } from './support/sqljs';

async function freshDatabase(): Promise<SqlDatabase> {
  const db = await openTestDatabase();
  await migrateSchema(db);
  return db;
}

const FOLDER: Folder = { id: 'f1', name: 'Verbs', createdAt: 100 };

test('a word round-trips through every optional field', async () => {
  const db = await freshDatabase();
  const card: WordCard = {
    id: 'w1', createdAt: 42, word: 'run', meaning: 'move fast', note: 'irregular',
    notifOff: true, folderId: 'f1', testMastered: true, testNextReview: 999,
    testLevel: 'slightly', reviewHistory: [{ ts: 1, rating: 'unknown' }],
    wordLang: 'en-US', meaningLang: 'ja',
    audioUri: 'file:///a.mp3', audioSpeed: 0.75, audioVolume: 0.5,
  };

  await writeSnapshot(db, { folders: [FOLDER], cards: [card] });
  assert.deepEqual(await readWords(db), [card]);
});

test('a minimal word round-trips without gaining empty fields', async () => {
  const db = await freshDatabase();
  const card: WordCard = { id: 'w1', word: 'apple', meaning: 'fruit', note: '' };

  await writeSnapshot(db, { cards: [card] });
  assert.deepEqual(await readWords(db), [card]);
});

test('folder notification settings and styling round-trip', async () => {
  const db = await freshDatabase();
  const folders: Folder[] = [
    { id: 'f1', name: 'Plain', createdAt: 1 },
    {
      id: 'f2', name: 'Styled', createdAt: 2, icon: 'star', color: '#00ff00',
      notifSettings: { intervalSeconds: 0, displayOnlyWord: false },
    },
  ];

  await writeSnapshot(db, { folders });
  assert.deepEqual(await readFolders(db), folders);
});

test('ordering is preserved by position, not by id or insertion order', async () => {
  const db = await freshDatabase();
  const cards: WordCard[] = ['zebra', 'apple', 'mango'].map((word, index) => ({
    id: `w${index}`, word, meaning: word, note: '',
  }));

  await writeSnapshot(db, { cards });
  assert.deepEqual((await readWords(db)).map(card => card.word), ['zebra', 'apple', 'mango']);

  const reordered = [cards[2]!, cards[0]!, cards[1]!];
  await writeSnapshot(db, { cards: reordered });
  assert.deepEqual((await readWords(db)).map(card => card.word), ['mango', 'zebra', 'apple']);
});

test('updating a word replaces its fields rather than accumulating rows', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, {
    cards: [{ id: 'w1', word: 'run', meaning: 'old', note: 'old note', testLevel: 'good' }],
  });

  await writeSnapshot(db, {
    cards: [{ id: 'w1', word: 'run', meaning: 'new', note: '', testLevel: 'perfect' }],
  });

  const words = await readWords(db);
  assert.equal(words.length, 1);
  assert.equal(words[0]?.meaning, 'new');
  assert.equal(words[0]?.note, '');
  assert.equal(words[0]?.testLevel, 'perfect');

  const notes = await db.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM notes');
  assert.equal(notes[0]?.count, 0, 'an emptied note should not leave a row behind');
});

test('clearing review state removes the progress row', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, {
    cards: [{ id: 'w1', word: 'run', meaning: 'x', note: '', testLevel: 'good', testNextReview: 5 }],
  });
  await writeSnapshot(db, { cards: [{ id: 'w1', word: 'run', meaning: 'x', note: '' }] });

  const rows = await db.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM learning_progress');
  assert.equal(rows[0]?.count, 0);
  assert.equal((await readWords(db))[0]?.testLevel, undefined);
});

test('review history is rewritten, not appended, when the caller trims it', async () => {
  const db = await freshDatabase();
  const history = [{ ts: 1, rating: 'good' as const }, { ts: 2, rating: 'perfect' as const }];
  await writeSnapshot(db, { cards: [{ id: 'w1', word: 'run', meaning: 'x', note: '', reviewHistory: history }] });

  await writeSnapshot(db, {
    cards: [{ id: 'w1', word: 'run', meaning: 'x', note: '', reviewHistory: [history[1]!] }],
  });

  assert.deepEqual((await readWords(db))[0]?.reviewHistory, [history[1]]);
});

test('deleting a word removes only that word', async () => {
  const db = await freshDatabase();
  const cards: WordCard[] = [
    { id: 'w1', word: 'keep', meaning: 'a', note: 'note a' },
    { id: 'w2', word: 'drop', meaning: 'b', note: 'note b' },
  ];
  await writeSnapshot(db, { cards });

  await writeSnapshot(db, { cards: [cards[0]!] });

  assert.deepEqual((await readWords(db)).map(card => card.id), ['w1']);
  const notes = await db.getAllAsync<{ word_id: string }>('SELECT word_id FROM notes');
  assert.deepEqual(notes, [{ word_id: 'w1' }]);
});

test('writing folders and words together satisfies the foreign key', async () => {
  const db = await freshDatabase();
  const result = await writeSnapshot(db, {
    folders: [{ id: 'new-folder', name: 'Brand new', createdAt: 1 }],
    cards: [{ id: 'w1', word: 'first', meaning: 'x', note: '', folderId: 'new-folder' }],
  });

  assert.deepEqual(result.orphanedCardIds, []);
  assert.equal((await readWords(db))[0]?.folderId, 'new-folder');
});

test('a card referencing an unknown folder is reported and detached, not lost', async () => {
  const db = await freshDatabase();
  const result = await writeSnapshot(db, {
    cards: [
      { id: 'w1', word: 'fine', meaning: 'x', note: '' },
      { id: 'w2', word: 'orphan', meaning: 'y', note: '', folderId: 'ghost' },
    ],
  });

  assert.deepEqual(result.orphanedCardIds, ['w2']);
  assert.equal((await readWords(db)).length, 2);
});

test('settings upsert without clearing unrelated keys', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, { settings: new Map([['theme_color', '#111111'], ['app_language', 'ja']]) });
  await writeSnapshot(db, { settings: new Map([['theme_color', '#222222']]) });

  const values = await readSettingValues(db);
  assert.equal(values.get('theme_color'), '#222222');
  assert.equal(values.get('app_language'), 'ja');
});

test('audio cache metadata records, touches and forgets entries', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, { cards: [{ id: 'w1', word: 'run', meaning: 'x', note: '' }] });

  await recordAudioCacheEntry(db, {
    cacheKey: 'marin:hash1', wordId: 'w1', fileUri: 'file:///cache/a.wav',
    voice: 'marin', byteSize: 2048, createdAt: 100, lastUsedAt: 100,
  });
  assert.deepEqual(await readAudioCacheEntries(db), [{
    cacheKey: 'marin:hash1', wordId: 'w1', fileUri: 'file:///cache/a.wav',
    voice: 'marin', byteSize: 2048, createdAt: 100, lastUsedAt: 100,
  }]);

  await touchAudioCacheEntry(db, 'marin:hash1', 500);
  assert.equal((await readAudioCacheEntries(db))[0]?.lastUsedAt, 500);

  await forgetAudioCacheEntry(db, 'marin:hash1');
  assert.deepEqual(await readAudioCacheEntries(db), []);
});

test('deleting a word drops its cached audio bookkeeping', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, { cards: [{ id: 'w1', word: 'run', meaning: 'x', note: '' }] });
  await recordAudioCacheEntry(db, {
    cacheKey: 'marin:hash1', wordId: 'w1', fileUri: 'file:///cache/a.wav',
    createdAt: 1, lastUsedAt: 1,
  });

  await writeSnapshot(db, { cards: [] });
  assert.deepEqual(await readAudioCacheEntries(db), []);
});

test('an empty snapshot clears everything without error', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, { folders: [FOLDER], cards: [{ id: 'w1', word: 'a', meaning: 'b', note: '' }] });

  await writeSnapshot(db, { folders: [], cards: [] });

  assert.deepEqual(await readWords(db), []);
  assert.deepEqual(await readFolders(db), []);
});
