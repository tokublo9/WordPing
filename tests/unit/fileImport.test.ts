import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectDelimiter,
  mergeNote,
  parseCsv,
  parseDelimitedRows,
  parseImportFile,
  parseJson,
  resolveColumn,
} from '../../src/features/cards/fileImport';
import {
  createBulkImportBatch,
  fileImportDrafts,
  planFileImport,
  resolveImportFolderId,
} from '../../src/features/cards/bulkImport';
import type { Folder, WordCard } from '../../src/types';

/** Minimal card, so each case states only the fields it is about. */
function card(word: string, folderId?: string): WordCard {
  return { id: `id-${word}-${folderId ?? 'none'}`, word, meaning: '', note: '', ...(folderId ? { folderId } : {}) };
}

const FOLDERS: Folder[] = [
  { id: 'f-en', name: 'English', createdAt: 1 },
  { id: 'f-jp', name: '日本語', createdAt: 2 },
];

// ── CSV ──────────────────────────────────────────────────────────────────────

test('a quoted CSV keeps delimiters and line breaks inside a field', () => {
  const rows = parseDelimitedRows('a,"b,c","line\nbreak"\n', ',');
  assert.deepEqual(rows, [['a', 'b,c', 'line\nbreak']]);
});

test('an escaped quote inside a quoted field survives', () => {
  assert.deepEqual(parseDelimitedRows('"say ""hi""",x', ','), [['say "hi"', 'x']]);
});

test('CRLF, bare CR and a missing final newline all end a row', () => {
  assert.deepEqual(parseDelimitedRows('a,b\r\nc,d\re,f', ','), [['a', 'b'], ['c', 'd'], ['e', 'f']]);
});

test('the delimiter is detected from the header', () => {
  assert.equal(detectDelimiter('front,back\nx,y'), ',');
  assert.equal(detectDelimiter('front\tback\nx\ty'), '\t');
  assert.equal(detectDelimiter('front;back\nx;y'), ';');
});

test('column aliases are matched after trimming and lower-casing', () => {
  for (const name of ['front', ' Word ', 'TERM']) assert.equal(resolveColumn(name), 'word');
  for (const name of ['back', 'Meaning', 'DEFINITION']) assert.equal(resolveColumn(name), 'meaning');
  for (const name of ['note', 'Notes']) assert.equal(resolveColumn(name), 'note');
  for (const name of ['example', 'exampleSentence', 'Example Sentence']) {
    assert.equal(resolveColumn(name), 'example');
  }
  for (const name of ['folder', 'folderName']) assert.equal(resolveColumn(name), 'folder');
  for (const name of ['label', 'Labels']) assert.equal(resolveColumn(name), 'label');
  assert.equal(resolveColumn('something else'), null);
});

test('a valid CSV imports, including Japanese text and empty optional fields', () => {
  const result = parseCsv([
    'front,back,note,folder',
    'example,例,,English',
    '自発的,spontaneous,朝の光,日本語',
    '"quoted, word","meaning with, comma",,',
  ].join('\n'));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.rows.map(row => [row.word, row.meaning, row.note, row.folderName]), [
    ['example', '例', '', 'English'],
    ['自発的', 'spontaneous', '朝の光', '日本語'],
    ['quoted, word', 'meaning with, comma', '', ''],
  ]);
  assert.deepEqual(result.value.errors, []);
});

test('an example column is folded into the note rather than dropped or invented', () => {
  assert.equal(mergeNote('', 'She waited.'), 'She waited.');
  assert.equal(mergeNote('a note', 'She waited.'), 'a note\nShe waited.');
  assert.equal(mergeNote('a note', ''), 'a note');

  const result = parseCsv('word,note,example\nwait,my note,She waited.');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.rows[0].note, 'my note\nShe waited.');
});

test('a row with no word is reported by number instead of crashing the file', () => {
  const result = parseCsv(['front,back', 'good,fine', ',orphaned meaning', 'also good,ok'].join('\n'));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.rows.map(row => row.word), ['good', 'also good']);
  // Row 3 as a person counts it: the header is row 1.
  assert.deepEqual(result.value.errors, [{ rowNumber: 3, reason: 'missing_word' }]);
});

test('a label column is reported as ignored, never persisted', () => {
  const result = parseCsv('word,labels\nhello,verb;greeting');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.ignoredColumns, ['labels']);
  assert.equal(Object.prototype.hasOwnProperty.call(result.value.rows[0], 'labels'), false);
});

test('a CSV with no recognisable word column is refused with a reason', () => {
  const result = parseCsv('colour,size\nred,large');
  assert.deepEqual(result, { ok: false, error: 'no_columns' });
});

test('an empty file is refused rather than importing nothing silently', () => {
  assert.deepEqual(parseCsv('   \n  '), { ok: false, error: 'empty_file' });
});

test('a blank trailing line is not counted as an invalid row', () => {
  const result = parseCsv('front,back\na,b\n\n');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.rows.length, 1);
  assert.deepEqual(result.value.errors, []);
});

// ── JSON ─────────────────────────────────────────────────────────────────────

test('a top-level array of word objects imports', () => {
  const result = parseJson(JSON.stringify([
    { front: 'example', back: '例', folder: 'English' },
    { word: 'second', definition: 'meaning' },
  ]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.rows.map(row => [row.word, row.meaning, row.folderName]), [
    ['example', '例', 'English'],
    ['second', 'meaning', ''],
  ]);
});

test('an object wrapping a words array imports', () => {
  const result = parseJson(JSON.stringify({ words: [{ term: 'wrapped', back: 'ok' }] }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.rows.map(row => row.word), ['wrapped']);
});

test('malformed JSON entries are reported per row, not thrown', () => {
  const result = parseJson(JSON.stringify([
    { front: 'fine' },
    'not an object',
    { back: 'no word here' },
    null,
  ]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.rows.map(row => row.word), ['fine']);
  assert.deepEqual(result.value.errors, [
    { rowNumber: 2, reason: 'malformed' },
    { rowNumber: 3, reason: 'missing_word' },
    { rowNumber: 4, reason: 'malformed' },
  ]);
});

test('invalid JSON and an unusable shape are distinguished', () => {
  assert.deepEqual(parseJson('{ not json'), { ok: false, error: 'invalid_json' });
  assert.deepEqual(parseJson('{"other":[]}'), { ok: false, error: 'unsupported_shape' });
});

test('the format follows the file name, then the content', () => {
  assert.equal(parseImportFile('[{"word":"a"}]', 'words.json').ok, true);
  assert.equal(parseImportFile('front,back\na,b', 'words.csv').ok, true);
  // No usable extension: JSON announces itself with its opening bracket.
  const sniffed = parseImportFile('[{"word":"a"}]', 'download');
  assert.equal(sniffed.ok && sniffed.value.format, 'json');
});

// ── Planning and commit ──────────────────────────────────────────────────────

test('a folder column routes to an existing folder and never creates one', () => {
  assert.deepEqual(resolveImportFolderId('English', FOLDERS, 'f-jp'), {
    folderId: 'f-en', routedFolderName: 'English',
  });
  // Case and spacing are normalised the same way words are.
  assert.deepEqual(resolveImportFolderId('  english ', FOLDERS, 'f-jp').folderId, 'f-en');
  // An unknown name falls back to the destination rather than inventing a folder.
  assert.deepEqual(resolveImportFolderId('Nonexistent', FOLDERS, 'f-jp'), {
    folderId: 'f-jp', routedFolderName: '',
  });
  assert.deepEqual(resolveImportFolderId('', FOLDERS, null), { folderId: null, routedFolderName: '' });
});

test('the plan separates new rows, stored duplicates and repeats inside the file', () => {
  const parsed = parseCsv([
    'front,back',
    'fresh,new',
    'Stored,already here',      // differs only by case from an existing card
    'fresh,repeat of row 2',    // repeat within the file
    ',no word',
  ].join('\n'));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const plan = planFileImport({
    rows: parsed.value.rows,
    errors: parsed.value.errors,
    existingCards: [card('stored', 'f-en')],
    folders: FOLDERS,
    destinationFolderId: 'f-en',
  });

  assert.deepEqual(plan.items.map(item => item.status), ['valid', 'duplicate_existing', 'duplicate_file']);
  assert.equal(plan.validCount, 1);
  assert.equal(plan.duplicateCount, 2);
  // The word-less row was rejected by the parser and is counted through errors.
  assert.equal(plan.invalidCount, 1);
});

test('duplicates are judged per destination folder, not across the library', () => {
  const parsed = parseCsv('front,folder\nexample,English');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  // The same word exists, but in the other folder — so this row is still new.
  const plan = planFileImport({
    rows: parsed.value.rows,
    errors: [],
    existingCards: [card('example', 'f-jp')],
    folders: FOLDERS,
    destinationFolderId: 'f-jp',
  });
  assert.equal(plan.items[0].status, 'valid');
  assert.equal(plan.items[0].folderId, 'f-en');
  assert.equal(plan.routedElsewhereCount, 1);
});

test('committing writes only the accepted rows, with their fields', () => {
  const parsed = parseCsv('front,back,note,folder\nexample,例,a note,English');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const plan = planFileImport({
    rows: parsed.value.rows,
    errors: [],
    existingCards: [],
    folders: FOLDERS,
    destinationFolderId: 'f-jp',
  });
  let next = 0;
  const batch = createBulkImportBatch({
    drafts: fileImportDrafts(plan),
    existingCards: [],
    destinationFolderId: 'f-jp',
    firstCreatedAt: 1_000,
    createId: () => `new-${next++}`,
  });

  assert.equal(batch.cards.length, 1);
  assert.deepEqual(
    { ...batch.cards[0], id: 'x' },
    { id: 'x', createdAt: 1_000, word: 'example', meaning: '例', note: 'a note', folderId: 'f-en' },
  );
});

test('the commit re-checks duplicates rather than trusting the preview', () => {
  const drafts = [{ id: 'r1', text: 'example', meaning: '', note: '', folderId: 'f-en' }];
  // The plan was built when the folder was empty; by commit time the word exists.
  const batch = createBulkImportBatch({
    drafts,
    existingCards: [card('Example', 'f-en')],
    destinationFolderId: 'f-en',
    firstCreatedAt: 1,
    createId: () => 'new',
  });
  assert.deepEqual(batch.cards, []);
  assert.equal(batch.duplicatesSkipped, 1);
});
