import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateSchema } from '../../src/lib/sqlite/schema';
import { readFolders, readSettingValues, readWords, writeSnapshot } from '../../src/lib/sqlite/repositories';
import { exportBackup, serializeBackup } from '../../src/lib/backup/exportBackup';
import { BackupImportError, importBackup } from '../../src/lib/backup/importBackup';
import { validateBackup } from '../../src/lib/backup/validate';
import { BACKUP_FORMAT_VERSION } from '../../src/lib/backup/format';
import { CURRENT_SCHEMA_VERSION } from '../../src/lib/sqlite/schema';
import type { SqlDatabase } from '../../src/lib/sqlite/types';
import type { Folder, WordCard } from '../../src/types';
import { openTestDatabase } from './support/sqljs';

const FOLDERS: Folder[] = [
  { id: 'f-verbs', name: 'Verbs', createdAt: 100, icon: 'book', color: '#ff0000' },
  { id: 'f-nouns', name: 'Nouns', createdAt: 200, notifSettings: { intervalSeconds: 3600, displayOnlyWord: true } },
];

const CARDS: WordCard[] = [
  {
    id: 'w-run', createdAt: 300, word: 'run', meaning: 'move fast', note: 'irregular',
    folderId: 'f-verbs', wordLang: 'en-US', meaningLang: 'ja', notifCandidate: true,
    testLevel: 'good', testNextReview: 999, testMastered: true,
    reviewHistory: [{ ts: 1, rating: 'unknown' }, { ts: 2, rating: 'good' }],
    audioSpeed: 1.25, audioVolume: 0.8,
  },
  { id: 'w-apple', createdAt: 400, word: 'apple', meaning: 'fruit', note: '', folderId: 'f-nouns' },
  { id: 'w-loose', createdAt: 500, word: 'loose', meaning: 'not tight', note: 'no folder' },
];

const EXPORT_OPTIONS = { appVersion: '1.0.0', now: () => new Date('2026-08-19T00:00:00.000Z') };

async function freshDatabase(): Promise<SqlDatabase> {
  const db = await openTestDatabase();
  await migrateSchema(db);
  return db;
}

async function populated(): Promise<SqlDatabase> {
  const db = await freshDatabase();
  await writeSnapshot(db, {
    folders: FOLDERS,
    cards: CARDS,
    settings: new Map([
      ['theme_color', '#7C6BF8'],
      ['app_language', 'ja'],
      ['ai_voice', 'nova'],
      // Device-local bookkeeping that must never leave the phone.
      ['wordping_seeded', '1700000000000'],
      ['migration:asyncstorage:v1', '1700000000000'],
    ]),
  });
  return db;
}

// ── Export ───────────────────────────────────────────────────────────────────

test('export produces a versioned, self-describing document', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);

  assert.equal(backup.kind, 'wordping-backup');
  assert.equal(backup.formatVersion, BACKUP_FORMAT_VERSION);
  assert.equal(backup.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(backup.appVersion, '1.0.0');
  assert.equal(backup.exportedAt, '2026-08-19T00:00:00.000Z');
});

test('export includes every relationship and preserves ids and timestamps', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);

  assert.deepEqual(backup.data.folders.map(folder => folder.id), ['f-verbs', 'f-nouns']);
  assert.deepEqual(backup.data.words.map(word => word.id), ['w-run', 'w-apple', 'w-loose']);
  assert.equal(backup.data.folders[0]?.createdAt, 100);
  assert.equal(backup.data.words[0]?.createdAt, 300);
  assert.equal(backup.data.words[0]?.folderId, 'f-verbs');
  assert.equal(backup.data.words[2]?.folderId, undefined);

  // Notes are exported ordered by word id, independent of word position.
  assert.deepEqual(backup.data.notes, [
    { wordId: 'w-loose', body: 'no folder' },
    { wordId: 'w-run', body: 'irregular' },
  ]);
  assert.deepEqual(backup.data.learningProgress, [
    { wordId: 'w-run', levelId: 'level:good', nextReviewAt: 999, mastered: true },
  ]);
  assert.deepEqual(backup.data.reviewHistory, [
    { wordId: 'w-run', ratedAt: 1, rating: 'unknown' },
    { wordId: 'w-run', ratedAt: 2, rating: 'good' },
  ]);
  assert.equal(backup.data.labels.length, 4);
});

test('export never includes device-local or credential-like values', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const serialized = serializeBackup(backup);

  assert.deepEqual(Object.keys(backup.data.settings).sort(), ['ai_voice', 'app_language', 'theme_color']);
  for (const forbidden of [
    'wordping_seeded', 'migration:asyncstorage', 'install', 'RCAnonymous',
    'revenuecat', 'sk-', 'token', 'audio_uri', 'audioUri',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `backup leaked "${forbidden}"`);
  }
});

test('a device-local audio path is excluded from the backup', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, {
    cards: [{ id: 'w1', word: 'a', meaning: 'b', note: '', audioUri: 'file:///private/var/a.mp3', audioSpeed: 2 }],
  });

  const backup = await exportBackup(db, EXPORT_OPTIONS);
  assert.equal(serializeBackup(backup).includes('/private/var'), false);
  // The playback preference is portable even though the file is not.
  assert.equal(backup.data.words[0]?.audioSpeed, 2);
});

test('export of an empty database is still a valid backup', async () => {
  const backup = await exportBackup(await freshDatabase(), EXPORT_OPTIONS);
  assert.equal(validateBackup(backup).ok, true);
  assert.deepEqual(backup.data.words, []);
});

// ── Validation ───────────────────────────────────────────────────────────────

test('validation rejects files that are not WordCore backups', () => {
  for (const input of [null, 42, 'a string', [], {}, { kind: 'other-app' }]) {
    assert.equal(validateBackup(input).ok, false);
  }
});

test('validation rejects an unsupported future format version', () => {
  const result = validateBackup({
    kind: 'wordping-backup', formatVersion: 99, schemaVersion: 1,
    appVersion: '9.0.0', exportedAt: 'x', data: {},
  });
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.errors[0]!, /format version 99 is not supported/u);
});

test('validation reports every structural problem, not just the first', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const broken = JSON.parse(JSON.stringify(backup)) as Record<string, any>;
  broken.data.words[0].id = '';
  broken.data.words[1].position = 'not a number';
  broken.data.folders[0].createdAt = null;

  const result = validateBackup(broken);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.errors.length >= 3, 'expected several errors');
});

test('validation rejects a dangling folder reference', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const broken = JSON.parse(JSON.stringify(backup)) as Record<string, any>;
  broken.data.folders = [];

  const result = validateBackup(broken);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.errors.join(' '), /references a folder that is not in the backup/u);
});

test('validation rejects orphaned notes, progress and history', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const broken = JSON.parse(JSON.stringify(backup)) as Record<string, any>;
  broken.data.notes.push({ wordId: 'ghost', body: 'x' });
  broken.data.reviewHistory.push({ wordId: 'ghost', ratedAt: 1, rating: 'good' });

  const result = validateBackup(broken);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.errors.join(' '), /missing word: ghost/u);
});

test('validation rejects duplicate ids', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const broken = JSON.parse(JSON.stringify(backup)) as Record<string, any>;
  broken.data.words.push({ ...broken.data.words[0] });

  const result = validateBackup(broken);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.errors.join(' '), /duplicate id/u);
});

test('validation rejects an unknown review rating', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const broken = JSON.parse(JSON.stringify(backup)) as Record<string, any>;
  broken.data.reviewHistory[0].rating = 'excellent';
  assert.equal(validateBackup(broken).ok, false);
});

// ── Import ───────────────────────────────────────────────────────────────────

test('a full round-trip reproduces the original data exactly', async () => {
  const source = await populated();
  const backup = await exportBackup(source, EXPORT_OPTIONS);

  const target = await freshDatabase();
  const summary = await importBackup(target, JSON.parse(serializeBackup(backup)), { mode: 'replace' });

  assert.equal(summary.words, 3);
  assert.equal(summary.folders, 2);
  assert.deepEqual(await readFolders(target), await readFolders(source));

  // audioUri is intentionally device-local and does not survive the trip.
  const expected = CARDS.map(({ audioUri: _unused, ...card }) => card);
  assert.deepEqual(await readWords(target), expected);
});

test('replace mode clears existing data before importing', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);

  const target = await freshDatabase();
  await writeSnapshot(target, {
    folders: [{ id: 'old-folder', name: 'Old', createdAt: 1 }],
    cards: [{ id: 'old-word', word: 'gone', meaning: 'x', note: '' }],
  });

  await importBackup(target, backup, { mode: 'replace' });

  const words = await readWords(target);
  assert.equal(words.some(word => word.id === 'old-word'), false);
  assert.equal(words.length, 3);
  assert.equal((await readFolders(target)).some(folder => folder.id === 'old-folder'), false);
});

test('merge mode keeps existing data and appends what is new', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);

  const target = await freshDatabase();
  await writeSnapshot(target, {
    folders: [{ id: 'mine', name: 'Mine', createdAt: 1 }],
    cards: [{ id: 'my-word', word: 'existing', meaning: 'kept', note: 'mine' }],
  });

  const summary = await importBackup(target, backup, { mode: 'merge' });
  assert.equal(summary.mode, 'merge');
  assert.equal(summary.words, 3);

  const words = await readWords(target);
  assert.deepEqual(words.map(word => word.id), ['my-word', 'w-run', 'w-apple', 'w-loose']);
  assert.equal(words[0]?.note, 'mine');
  assert.deepEqual((await readFolders(target)).map(folder => folder.id), ['mine', 'f-verbs', 'f-nouns']);
});

test('merge mode never overwrites a record the user already has', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);

  const target = await freshDatabase();
  await writeSnapshot(target, {
    folders: [{ id: 'f-verbs', name: 'My own name for it', createdAt: 1 }],
    cards: [{ id: 'w-run', word: 'run', meaning: 'my edited meaning', note: 'my note' }],
  });

  const summary = await importBackup(target, backup, { mode: 'merge' });
  assert.equal(summary.skippedExisting, 2);

  const words = await readWords(target);
  assert.equal(words.find(word => word.id === 'w-run')?.meaning, 'my edited meaning');
  assert.equal((await readFolders(target)).find(folder => folder.id === 'f-verbs')?.name, 'My own name for it');
});

test('merge preserves relationships for the records it does import', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const target = await freshDatabase();
  await importBackup(target, backup, { mode: 'merge' });

  const words = await readWords(target);
  assert.equal(words.find(word => word.id === 'w-run')?.folderId, 'f-verbs');
  assert.equal(words.find(word => word.id === 'w-apple')?.folderId, 'f-nouns');
  assert.equal(words.find(word => word.id === 'w-run')?.testLevel, 'good');
  assert.deepEqual(words.find(word => word.id === 'w-run')?.reviewHistory, [
    { ts: 1, rating: 'unknown' },
    { ts: 2, rating: 'good' },
  ]);
});

test('an invalid backup is rejected before anything is written', async () => {
  const target = await freshDatabase();
  await writeSnapshot(target, { cards: [{ id: 'keep', word: 'safe', meaning: 'x', note: '' }] });

  await assert.rejects(
    importBackup(target, { kind: 'wordping-backup', formatVersion: 1, data: { words: 'nope' } }, { mode: 'replace' }),
    (error: unknown) => error instanceof BackupImportError,
  );

  assert.deepEqual((await readWords(target)).map(word => word.id), ['keep']);
});

test('a failure part-way through an import rolls the whole thing back', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);

  const target = await freshDatabase();
  await writeSnapshot(target, {
    folders: [{ id: 'original', name: 'Original', createdAt: 1 }],
    cards: [{ id: 'original-word', word: 'safe', meaning: 'x', note: 'untouched' }],
  });

  // A duplicated primary key inside review_history's parent chain: the words
  // insert succeeds, then this collides and aborts the transaction.
  const corrupted = JSON.parse(serializeBackup(backup)) as Record<string, any>;
  corrupted.data.notes.push({ wordId: 'w-run', body: 'a second note for the same word' });

  await assert.rejects(importBackup(target, corrupted, { mode: 'replace' }));

  // Replace mode deleted rows first; the rollback must have restored them.
  const words = await readWords(target);
  assert.deepEqual(words.map(word => word.id), ['original-word']);
  assert.equal(words[0]?.note, 'untouched');
  assert.deepEqual((await readFolders(target)).map(folder => folder.id), ['original']);
});

test('settings import is allowlisted on the way in as well as out', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const tampered = JSON.parse(serializeBackup(backup)) as Record<string, any>;
  tampered.data.settings.wordping_seeded = '0';
  tampered.data.settings['migration:asyncstorage:v1'] = '0';
  tampered.data.settings.install_id = 'attacker-controlled';

  const target = await freshDatabase();
  await importBackup(target, tampered, { mode: 'replace' });

  const settings = await readSettingValues(target);
  assert.equal(settings.get('theme_color'), '#7C6BF8');
  assert.equal(settings.has('wordping_seeded'), false);
  assert.equal(settings.has('migration:asyncstorage:v1'), false);
  assert.equal(settings.has('install_id'), false);
});

test('settings can be skipped when merging someone else’s word list', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const target = await freshDatabase();
  await writeSnapshot(target, { settings: new Map([['theme_color', '#000000']]) });

  await importBackup(target, backup, { mode: 'merge', importSettings: false });

  assert.equal((await readSettingValues(target)).get('theme_color'), '#000000');
  assert.equal((await readWords(target)).length, 3);
});

test('importing the same backup twice in merge mode adds nothing the second time', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const target = await freshDatabase();

  const first = await importBackup(target, backup, { mode: 'merge' });
  const second = await importBackup(target, backup, { mode: 'merge' });

  assert.equal(first.words, 3);
  assert.equal(second.words, 0);
  assert.equal(second.skippedExisting, 5);
  assert.equal((await readWords(target)).length, 3);
});

test('an older but supported format version still imports', async () => {
  const backup = await exportBackup(await populated(), EXPORT_OPTIONS);
  const older = JSON.parse(serializeBackup(backup)) as Record<string, any>;
  // Version 1 is the oldest supported; a v1 file exported by an older build
  // may legitimately omit optional sections.
  older.data.wordLabels = [];
  delete older.data.settings;

  const target = await freshDatabase();
  const summary = await importBackup(target, older, { mode: 'replace' });
  assert.equal(summary.words, 3);
  assert.equal(summary.settings, 0);
});

test('a temporarily hidden card is exported and restored with its hide intact', async () => {
  const db = await freshDatabase();
  const until = Date.parse('2026-08-22T12:00:00Z');
  await writeSnapshot(db, {
    cards: [
      { id: 'w-hidden', word: 'apple', meaning: 'fruit', note: 'keep', testLevel: 'good', hiddenUntil: until },
      { id: 'w-visible', word: 'pear', meaning: 'fruit', note: '' },
    ],
  });

  const backup = await exportBackup(db, EXPORT_OPTIONS);
  // Hidden cards are user data: they must be in the backup, not filtered out.
  assert.deepEqual(backup.data.words.map(word => word.id), ['w-hidden', 'w-visible']);
  assert.equal(backup.data.learningProgress[0]?.hiddenUntil, until);

  const target = await freshDatabase();
  await importBackup(target, JSON.parse(serializeBackup(backup)), { mode: 'replace' });
  const restored = await readWords(target);
  assert.equal(restored.find(word => word.id === 'w-hidden')?.hiddenUntil, until);
  assert.equal(restored.find(word => word.id === 'w-visible')?.hiddenUntil, undefined);
});

test('a backup without hiddenUntil still imports', async () => {
  // Files written by an older build have no such field.
  const db = await freshDatabase();
  await writeSnapshot(db, { cards: [{ id: 'w1', word: 'a', meaning: 'b', note: '', testLevel: 'good' }] });
  const backup = JSON.parse(serializeBackup(await exportBackup(db, EXPORT_OPTIONS)));
  assert.equal(backup.data.learningProgress[0].hiddenUntil, undefined);

  const target = await freshDatabase();
  const summary = await importBackup(target, backup, { mode: 'replace' });
  assert.equal(summary.words, 1);
  assert.equal((await readWords(target))[0]?.hiddenUntil, undefined);
});

test('a deleted Perfect card is absent from later backups', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, {
    cards: [
      { id: 'kept', word: 'pear', meaning: 'fruit', note: '' },
      {
        id: 'deleted', word: 'apple', meaning: 'fruit', note: 'remove',
        testLevel: 'perfect', testMastered: true,
        reviewHistory: [{ ts: 1, rating: 'perfect' }],
      },
    ],
  });
  // The canonical app deletion flow removes the card from its persisted snapshot.
  await writeSnapshot(db, { cards: [{ id: 'kept', word: 'pear', meaning: 'fruit', note: '' }] });

  const backup = await exportBackup(db, EXPORT_OPTIONS);
  assert.deepEqual(backup.data.words.map(word => word.id), ['kept']);
  assert.equal(backup.data.learningProgress.some(entry => entry.wordId === 'deleted'), false);
  assert.equal(backup.data.reviewHistory.some(entry => entry.wordId === 'deleted'), false);
});

test('a malformed hiddenUntil is rejected by validation', async () => {
  const db = await freshDatabase();
  await writeSnapshot(db, { cards: [{ id: 'w1', word: 'a', meaning: 'b', note: '', testLevel: 'good' }] });
  const broken = JSON.parse(serializeBackup(await exportBackup(db, EXPORT_OPTIONS)));
  broken.data.learningProgress[0].hiddenUntil = 'three days';
  assert.equal(validateBackup(broken).ok, false);
});
