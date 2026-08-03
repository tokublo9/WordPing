const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScriptModule(path) {
  const source = fs.readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

const {
  analyzeBulkImport,
  BulkImportExecutionGuard,
  createBulkImportBatch,
  parseBulkImportText,
  resolveBulkImportDestination,
} = loadTypeScriptModule('src/features/cards/bulkImport.ts');
const { SUPPORTED_LANGUAGES, translate } = loadTypeScriptModule('src/i18n.ts');
const BULK_IMPORT_MAX_ITEMS = 50;
const BULK_IMPORT_MAX_ITEM_CHARS = 500;

const BULK_LABELS = {
  'en-US': 'Bulk Import', ja: '一括登録', ko: '일괄 등록', 'zh-CN': '批量导入',
  es: 'Importación masiva', fr: 'Import groupé', de: 'Massenimport',
  it: 'Importazione multipla', 'pt-BR': 'Importação em massa', ru: 'Массовый импорт',
  ar: 'استيراد جماعي', hi: 'एक साथ आयात', tr: 'Toplu İçe Aktar', nl: 'Bulkimport',
  vi: 'Nhập hàng loạt', th: 'นำเข้าหลายรายการ', id: 'Impor massal',
  pl: 'Import zbiorczy', el: 'Μαζική εισαγωγή', sv: 'Massimport',
};

test('Word List and Flip entry resolve the same captured current-folder destination', () => {
  const currentFolderId = 'folder-current';
  const fromWordList = resolveBulkImportDestination(currentFolderId);
  const fromFlip = resolveBulkImportDestination(currentFolderId);
  assert.equal(fromWordList, 'folder-current');
  assert.equal(fromFlip, 'folder-current');
  assert.equal(resolveBulkImportDestination(null), null);
});

test('parses one word or complete sentence per non-empty line without splitting sentences', () => {
  const drafts = parseBulkImportText([
    'engage',
    '',
    'How much does it cost to take the Shinkansen from Tokyo to Osaka?',
    'The business is recession-proof.',
  ].join('\n'));
  assert.deepEqual(drafts.map(item => item.text), [
    'engage',
    'How much does it cost to take the Shinkansen from Tokyo to Osaka?',
    'The business is recession-proof.',
  ]);
});

test('normalizes Notes bullets, numbered markers, checkboxes, whitespace, and line endings', () => {
  const input = '  • engage  \r\n- recession-proof\r1. squalling\n2) falling\n- [ ] thinking\n・ shining\n* through';
  assert.deepEqual(parseBulkImportText(input).map(item => item.text), [
    'engage', 'recession-proof', 'squalling', 'falling', 'thinking', 'shining', 'through',
  ]);
});

test('does not damage an internal or leading non-list hyphen and preserves punctuation/capitalization', () => {
  assert.deepEqual(parseBulkImportText(
    'recession-proof\n-word\nThe Business is Recession-Proof!'
  ).map(item => item.text), [
    'recession-proof', '-word', 'The Business is Recession-Proof!',
  ]);
});

test('detects case-insensitive duplicates within input and destination folder', () => {
  const drafts = parseBulkImportText('Engage\nengage\nSQUALLING\nnew item');
  const analysis = analyzeBulkImport(drafts, ['squalling'], BULK_IMPORT_MAX_ITEMS, BULK_IMPORT_MAX_ITEM_CHARS);
  assert.deepEqual(analysis.items.map(item => item.duplicateKind), [null, 'input', 'existing', null]);
  assert.deepEqual(analysis.validItems.map(item => item.normalizedText), ['Engage', 'new item']);
  assert.equal(analysis.duplicateCount, 2);
});

test('empty input produces no importable items', () => {
  const drafts = parseBulkImportText('\r\n  \n\r');
  const analysis = analyzeBulkImport(drafts, [], BULK_IMPORT_MAX_ITEMS, BULK_IMPORT_MAX_ITEM_CHARS);
  assert.equal(drafts.length, 0);
  assert.equal(analysis.validItems.length, 0);
});

test('exactly 50 valid items are allowed and 51 are blocked without discarding overflow', () => {
  const fifty = parseBulkImportText(Array.from({ length: 50 }, (_, i) => `word ${i}`).join('\n'));
  assert.equal(analyzeBulkImport(
    fifty, [], BULK_IMPORT_MAX_ITEMS, BULK_IMPORT_MAX_ITEM_CHARS,
  ).exceedsItemLimit, false);

  const drafts = parseBulkImportText(Array.from({ length: 51 }, (_, i) => `word ${i}`).join('\n'));
  const analysis = analyzeBulkImport(drafts, [], BULK_IMPORT_MAX_ITEMS, BULK_IMPORT_MAX_ITEM_CHARS);
  assert.equal(analysis.items.length, 51);
  assert.equal(analysis.validItems.length, 51);
  assert.equal(analysis.exceedsItemLimit, true);
  assert.throws(() => createBulkImportBatch({
    drafts,
    existingCards: [],
    destinationFolderId: 'folder-a',
    firstCreatedAt: 1,
    maxItems: BULK_IMPORT_MAX_ITEMS,
    maxItemChars: BULK_IMPORT_MAX_ITEM_CHARS,
    createId: () => 'unused',
  }), /bulk_import_item_limit/);
});

test('blank lines and exact duplicates do not consume the 50-item limit', () => {
  const unique = Array.from({ length: 50 }, (_, index) => `unique ${index}`);
  const drafts = parseBulkImportText([
    ...unique.slice(0, 25),
    '',
    '   ',
    ...unique.slice(25),
    'UNIQUE 0',
    'already stored',
  ].join('\n'));
  const analysis = analyzeBulkImport(
    drafts,
    ['Already Stored'],
    BULK_IMPORT_MAX_ITEMS,
    BULK_IMPORT_MAX_ITEM_CHARS,
  );
  assert.equal(analysis.validItems.length, 50);
  assert.equal(analysis.duplicateCount, 2);
  assert.equal(analysis.exceedsItemLimit, false);
});

test('removing one of 51 valid preview items immediately returns the import to the limit', () => {
  let drafts = parseBulkImportText(Array.from({ length: 51 }, (_, index) => `item ${index}`).join('\n'));
  assert.equal(analyzeBulkImport(
    drafts, [], BULK_IMPORT_MAX_ITEMS, BULK_IMPORT_MAX_ITEM_CHARS,
  ).exceedsItemLimit, true);
  drafts = drafts.slice(0, 50);
  const reduced = analyzeBulkImport(
    drafts, [], BULK_IMPORT_MAX_ITEMS, BULK_IMPORT_MAX_ITEM_CHARS,
  );
  assert.equal(reduced.validItems.length, 50);
  assert.equal(reduced.exceedsItemLimit, false);
});

test('two consecutive imports of 50 items are allowed because the limit is per import', () => {
  let id = 0;
  const first = createBulkImportBatch({
    drafts: parseBulkImportText(Array.from({ length: 50 }, (_, index) => `first ${index}`).join('\n')),
    existingCards: [],
    destinationFolderId: 'folder-a',
    firstCreatedAt: 1,
    maxItems: BULK_IMPORT_MAX_ITEMS,
    maxItemChars: BULK_IMPORT_MAX_ITEM_CHARS,
    createId: () => `first-id-${++id}`,
  });
  const second = createBulkImportBatch({
    drafts: parseBulkImportText(Array.from({ length: 50 }, (_, index) => `second ${index}`).join('\n')),
    existingCards: first.cards,
    destinationFolderId: 'folder-a',
    firstCreatedAt: 51,
    maxItems: BULK_IMPORT_MAX_ITEMS,
    maxItemChars: BULK_IMPORT_MAX_ITEM_CHARS,
    createId: () => `second-id-${++id}`,
  });
  assert.equal(first.cards.length, 50);
  assert.equal(second.cards.length, 50);
  assert.equal([...first.cards, ...second.cards].length, 100);
});

test('marks oversized items and blocks batch creation at the character limit', () => {
  const drafts = [{ id: 'long', text: 'x'.repeat(501) }];
  const analysis = analyzeBulkImport(drafts, [], BULK_IMPORT_MAX_ITEMS, BULK_IMPORT_MAX_ITEM_CHARS);
  assert.equal(analysis.items[0].tooLong, true);
  assert.equal(analysis.validItems.length, 0);
  assert.throws(() => createBulkImportBatch({
    drafts,
    existingCards: [],
    destinationFolderId: 'folder-a',
    firstCreatedAt: 1,
    maxItems: BULK_IMPORT_MAX_ITEMS,
    maxItemChars: BULK_IMPORT_MAX_ITEM_CHARS,
    createId: () => 'unused',
  }), /bulk_import_item_too_long/);
});

test('editing and removing preview items recomputes valid and duplicate status', () => {
  let drafts = parseBulkImportText('same\nSAME\nremove me');
  drafts = drafts.map(item => item.id === 'bulk-line-1' ? { ...item, text: 'different' } : item);
  drafts = drafts.filter(item => item.text !== 'remove me');
  const analysis = analyzeBulkImport(drafts, [], BULK_IMPORT_MAX_ITEMS, BULK_IMPORT_MAX_ITEM_CHARS);
  assert.deepEqual(analysis.validItems.map(item => item.normalizedText), ['same', 'different']);
  assert.equal(analysis.duplicateCount, 0);
});

test('batch uses only destination-folder duplicates and assigns unique IDs and ordered timestamps', () => {
  let id = 0;
  const batch = createBulkImportBatch({
    drafts: parseBulkImportText('existing elsewhere\nexisting here\nnew sentence'),
    existingCards: [
      { id: 'other', word: 'existing elsewhere', meaning: '', note: '', folderId: 'folder-b' },
      { id: 'here', word: 'EXISTING HERE', meaning: '', note: '', folderId: 'folder-a' },
    ],
    destinationFolderId: 'folder-a',
    firstCreatedAt: 100,
    maxItems: BULK_IMPORT_MAX_ITEMS,
    maxItemChars: BULK_IMPORT_MAX_ITEM_CHARS,
    createId: () => `new-${++id}`,
  });
  assert.deepEqual(batch.cards.map(card => ({
    id: card.id, word: card.word, folderId: card.folderId, createdAt: card.createdAt,
  })), [
    { id: 'new-1', word: 'existing elsewhere', folderId: 'folder-a', createdAt: 100 },
    { id: 'new-2', word: 'new sentence', folderId: 'folder-a', createdAt: 101 },
  ]);
  assert.equal(batch.duplicatesSkipped, 1);
});

test('batch preparation failure returns no partial batch for persistence', () => {
  let calls = 0;
  const persisted = [];
  assert.throws(() => {
    const batch = createBulkImportBatch({
      drafts: parseBulkImportText('one\ntwo\nthree'),
      existingCards: [],
      destinationFolderId: 'folder-a',
      firstCreatedAt: 1,
      maxItems: BULK_IMPORT_MAX_ITEMS,
      maxItemChars: BULK_IMPORT_MAX_ITEM_CHARS,
      createId: () => {
        calls++;
        if (calls === 2) throw new Error('simulated_database_preparation_failure');
        return `id-${calls}`;
      },
    });
    persisted.push(...batch.cards);
  }, /simulated_database_preparation_failure/);
  assert.deepEqual(persisted, []);
});

test('rapid repeated Import taps share one operation', async () => {
  const guard = new BulkImportExecutionGuard();
  let calls = 0;
  let release;
  const first = guard.run(() => new Promise(resolve => {
    calls++;
    release = resolve;
  }));
  const repeated = guard.run(async () => {
    calls++;
    return 'duplicate';
  });
  assert.equal(first, repeated);
  assert.equal(calls, 1);
  release('done');
  assert.equal(await repeated, 'done');
});

test('every supported language contains localized bulk-import UI and accessibility strings', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, Object.keys(BULK_LABELS).length);
  const keys = [
    'bulk_import', 'bulk_import_helper', 'bulk_import_placeholder', 'bulk_import_input_label',
    'bulk_import_parsed_count', 'bulk_import_preview', 'bulk_import_valid_count',
    'bulk_import_duplicate', 'bulk_import_item_too_long', 'bulk_import_remove_item',
    'bulk_import_item_limit', 'bulk_import_importing', 'bulk_import_import',
    'bulk_import_failed_generic', 'bulk_import_added_count', 'bulk_import_skipped_count',
    'bulk_import_failed_count',
  ];
  for (const { code } of SUPPORTED_LANGUAGES) {
    assert.equal(translate(code, 'bulk_import'), BULK_LABELS[code], code);
    assert.equal(translate(code, 'bulk_import_placeholder'), 'spontaneous\nengage\nrecession', code);
    assert.match(translate(code, 'bulk_import_helper'), /\n/u, `${code}: helper explanation`);
    for (const key of keys) {
      const value = translate(code, key);
      assert.ok(value && value !== key, `${code}:${key}`);
    }
  }
  assert.equal(
    translate('en-US', 'bulk_import_helper'),
    'Paste one word or sentence per line.\nOnly the word or sentence will be added. Meanings, notes, and other details will not be imported.',
  );
  assert.equal(
    translate('ja', 'bulk_import_helper'),
    '単語または文章を1行に1件ずつ貼り付けてください。\n一括登録されるのは単語・文章のみです。意味やノートなどは追加されません。',
  );
  assert.equal(translate('en-US', 'bulk_import_item_limit'), 'You can add up to {n} items at a time.');
  assert.equal(translate('ja', 'bulk_import_item_limit'), '一度に追加できるのは{n}件までです。');
  for (const { code } of SUPPORTED_LANGUAGES) {
    assert.match(translate(code, 'bulk_import_item_limit'), /\{n\}/u, `${code}: item limit placeholder`);
  }
});

test('placeholder examples remain display-only and input starts empty', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(source, /useState\(''\)/u);
  assert.match(source, /value=\{input\}/u);
  assert.match(source, /placeholder=\{t\('bulk_import_placeholder'\)\}/u);
});

test('focused multiline input supports internal and sheet scrolling without disabling selection', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(source, /multiline\s+scrollEnabled\s+textAlignVertical="top"/u);
  assert.match(source, /height: 210/u);
  assert.match(source, /maxHeight: 210/u);
  assert.match(source, /keyboardShouldPersistTaps="handled"/u);
  assert.match(source, /keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/u);
  assert.match(source, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === 'ios'\}/u);
  assert.match(source, /nestedScrollEnabled/u);
  assert.doesNotMatch(source, /selectTextOnFocus/u);
  assert.doesNotMatch(source, /onSelectionChange/u);
});

test('preview rows center single-line content while allowing multiline growth', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(source, /previewItem:\s*\{[\s\S]*?alignItems: 'center'/u);
  assert.match(source, /previewItem:\s*\{[\s\S]*?minHeight: 64/u);
  assert.match(source, /itemBody:\s*\{ flex: 1, justifyContent: 'center', minWidth: 0 \}/u);
  assert.match(source, /itemInput:\s*\{[\s\S]*?padding: 0/u);
  assert.match(source, /itemInput:\s*\{[\s\S]*?includeFontPadding: false/u);
  assert.match(source, /scrollEnabled=\{false\}/u);
});

test('preview delete button has a localized 44-point target and existing destructive color', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(source, /accessibilityLabel=\{`\$\{t\('bulk_import_remove_item'\)\}/u);
  assert.match(source, /removeButton:\s*\{[\s\S]*?width: 44,[\s\S]*?height: 44/u);
  assert.match(source, /size=\{25\}/u);
  assert.match(source, /color=\{DESTRUCTIVE_ACTION_COLOR\}/u);
});
