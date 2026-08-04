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

const BULK_LABELS = {
  'en-US': 'Bulk Import', ja: '一括登録', ko: '일괄 등록', 'zh-CN': '批量导入',
  es: 'Importación masiva', fr: 'Import groupé', de: 'Massenimport',
  it: 'Importazione multipla', 'pt-BR': 'Importação em massa', ru: 'Массовый импорт',
  ar: 'استيراد جماعي', hi: 'एक साथ आयात', tr: 'Toplu İçe Aktar', nl: 'Bulkimport',
  vi: 'Nhập hàng loạt', th: 'นำเข้าหลายรายการ', id: 'Impor massal',
  pl: 'Import zbiorczy', el: 'Μαζική εισαγωγή', sv: 'Massimport',
};

test('Add Word entry resolves the captured current-folder destination', () => {
  const currentFolderId = 'folder-current';
  const fromAddWord = resolveBulkImportDestination(currentFolderId);
  assert.equal(fromAddWord, 'folder-current');
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
  const analysis = analyzeBulkImport(drafts, ['squalling']);
  assert.deepEqual(analysis.items.map(item => item.duplicateKind), [null, 'input', 'existing', null]);
  assert.deepEqual(analysis.validItems.map(item => item.normalizedText), ['Engage', 'new item']);
  assert.equal(analysis.duplicateCount, 2);
});

test('empty input produces no importable items', () => {
  const drafts = parseBulkImportText('\r\n  \n\r');
  const analysis = analyzeBulkImport(drafts, []);
  assert.equal(drafts.length, 0);
  assert.equal(analysis.validItems.length, 0);
});

test('imports every item beyond the previous 50-item limit', () => {
  const drafts = parseBulkImportText(Array.from({ length: 1_000 }, (_, i) => `word ${i}`).join('\n'));
  const analysis = analyzeBulkImport(drafts, []);
  let id = 0;
  const batch = createBulkImportBatch({
    drafts,
    existingCards: [],
    destinationFolderId: 'folder-a',
    firstCreatedAt: 1,
    createId: () => `id-${++id}`,
  });
  assert.equal(analysis.items.length, 1_000);
  assert.equal(analysis.validItems.length, 1_000);
  assert.equal(batch.cards.length, 1_000);
});

test('blank lines and exact duplicates remain structural skips without imposing a quantity limit', () => {
  const unique = Array.from({ length: 100 }, (_, index) => `unique ${index}`);
  const drafts = parseBulkImportText([
    ...unique.slice(0, 50),
    '',
    '   ',
    ...unique.slice(50),
    'UNIQUE 0',
    'already stored',
  ].join('\n'));
  const analysis = analyzeBulkImport(drafts, ['Already Stored']);
  assert.equal(analysis.validItems.length, 100);
  assert.equal(analysis.duplicateCount, 2);
});

test('two consecutive large imports remain uncapped', () => {
  let id = 0;
  const first = createBulkImportBatch({
    drafts: parseBulkImportText(Array.from({ length: 200 }, (_, index) => `first ${index}`).join('\n')),
    existingCards: [],
    destinationFolderId: 'folder-a',
    firstCreatedAt: 1,
    createId: () => `first-id-${++id}`,
  });
  const second = createBulkImportBatch({
    drafts: parseBulkImportText(Array.from({ length: 200 }, (_, index) => `second ${index}`).join('\n')),
    existingCards: first.cards,
    destinationFolderId: 'folder-a',
    firstCreatedAt: 201,
    createId: () => `second-id-${++id}`,
  });
  assert.equal(first.cards.length, 200);
  assert.equal(second.cards.length, 200);
  assert.equal([...first.cards, ...second.cards].length, 400);
});

test('preserves and imports entries far beyond the previous character limit', () => {
  const longText = 'x'.repeat(50_000);
  const drafts = [{ id: 'long', text: longText }];
  const analysis = analyzeBulkImport(drafts, []);
  const batch = createBulkImportBatch({
    drafts,
    existingCards: [],
    destinationFolderId: 'folder-a',
    firstCreatedAt: 1,
    createId: () => 'long-id',
  });
  assert.equal(analysis.validItems[0].normalizedText, longText);
  assert.equal(batch.cards[0].word, longText);
});

test('editing and removing preview items recomputes valid and duplicate status', () => {
  let drafts = parseBulkImportText('same\nSAME\nremove me');
  drafts = drafts.map(item => item.id === 'bulk-line-1' ? { ...item, text: 'different' } : item);
  drafts = drafts.filter(item => item.text !== 'remove me');
  const analysis = analyzeBulkImport(drafts, []);
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
    'bulk_import_duplicate', 'bulk_import_remove_item',
    'bulk_import_importing', 'bulk_import_import',
    'bulk_import_failed_generic', 'dismiss_keyboard',
  ];
  for (const { code } of SUPPORTED_LANGUAGES) {
    assert.equal(translate(code, 'bulk_import'), BULK_LABELS[code], code);
    assert.equal(translate(code, 'bulk_import_placeholder'), 'spontaneous\nengage\nrecession', code);
    for (const key of keys) {
      const value = translate(code, key);
      assert.ok(value && value !== key, `${code}:${key}`);
    }
  }
  assert.equal(
    translate('ja', 'bulk_import_helper'),
    'まとめて単語を追加できます。1行が1つの単語として追加され、改行すると次の単語として認識されます。',
  );
  assert.equal(
    translate('en-US', 'bulk_import_helper'),
    'Add several words at once. Each line is added as one word, and a new line starts the next word.',
  );
  // Every locale carries its own translation of the line-per-word explanation — no
  // locale is left on the Japanese source string or on a copy of another language.
  const helpers = new Map();
  for (const { code } of SUPPORTED_LANGUAGES) {
    const helper = translate(code, 'bulk_import_helper');
    assert.doesNotMatch(helper, /\n/u, `${code}: helper is a single paragraph`);
    if (code !== 'ja') {
      assert.notEqual(helper, translate('ja', 'bulk_import_helper'), `${code}: untranslated`);
    }
    const sharedWith = helpers.get(helper);
    assert.equal(sharedWith, undefined, `${code}: helper duplicates ${sharedWith}`);
    helpers.set(helper, code);
  }
});

test('placeholder examples remain display-only and input starts empty', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(source, /useState\(''\)/u);
  assert.match(source, /value=\{input\}/u);
  assert.match(source, /placeholder=\{t\('bulk_import_placeholder'\)\}/u);
});

test('multiline input sits at its default height and auto-grows to fit overflowing text', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(source, /multiline\s+scrollEnabled=\{false\}\s+textAlignVertical="top"/u);
  assert.match(source, /onChangeText=\{setInput\}/u);
  // The exact default height is a design value, free to change; what matters is that
  // one constant defines it and it is applied as a floor rather than a fixed height.
  assert.match(source, /BULK_IMPORT_INPUT_INITIAL_HEIGHT = \d+/u);
  // The default is a floor, not a fixed height: content below it never shrinks the
  // box and content above it grows the box by exactly what the extra lines need.
  assert.match(source, /minHeight: BULK_IMPORT_INPUT_INITIAL_HEIGHT/u);
  assert.doesNotMatch(source, /height: inputHeight|setInputHeight|inputHeightRef|growInputTo/u);
  // Measuring content to drive an explicit height feeds back into the measurement
  // when scrolling is disabled, so the box must not be sized that way.
  assert.doesNotMatch(source, /onContentSizeChange|BULK_IMPORT_INPUT_VERTICAL_INSET/u);
  assert.doesNotMatch(source, /AnimatedTextInput|BULK_IMPORT_INPUT_MAX_HEIGHT|maxInputHeight|maxHeight: maxInputHeight/u);
  // No paste-only gating: growth must not depend on distinguishing paste from typing.
  assert.doesNotMatch(source, /isPaste|pasteTextRef|onKeyPress/u);
  assert.match(source, /keyboardShouldPersistTaps="handled"/u);
  assert.match(source, /keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/u);
  assert.match(source, /nestedScrollEnabled/u);
  assert.doesNotMatch(source, /selectTextOnFocus/u);
  assert.doesNotMatch(source, /onSelectionChange/u);
});

test('growing the box downward never moves the page under it', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  // The keyboard is compensated once, by the KeyboardAvoidingView. iOS managing
  // keyboard/content insets as well re-scrolled to the caret on every growth, which
  // is the jump-and-return seen when pressing Enter on the last line.
  assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/u);
  assert.match(source, /automaticallyAdjustKeyboardInsets=\{false\}/u);
  assert.match(source, /automaticallyAdjustContentInsets=\{false\}/u);
  // Nothing in the input step may drive the offset on its own; the only scrollTo is
  // the one the drag gesture asks for, keyed to the finger.
  const scrollCalls = source.match(/scrollTo\(/gu) ?? [];
  assert.equal(scrollCalls.length, 1, 'exactly one scrollTo, owned by the drag gesture');
  assert.doesNotMatch(source, /scrollToEnd|scrollIntoView|measureLayout/u);
});

test('the unfocused input only takes focus from a released tap, never from a drag', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  // While unfocused the wrapper takes the touch, so the native input cannot focus on
  // touch-down before a tap can be told apart from the start of a scroll.
  assert.match(source, /onStartShouldSetPanResponderCapture: \(\) => !inputFocusedRef\.current/u);
  // Focus happens on release, and only when the finger never left the tap threshold.
  assert.match(
    source,
    /onPanResponderRelease: \(_event, gesture\) => \{\s*if \(Math\.hypot\(gesture\.dx, gesture\.dy\) > BULK_IMPORT_TAP_SLOP\) return;\s*inputRef\.current\?\.focus\(\)/u,
  );
  // Focus is never requested from the move phase — a drag must not focus anything.
  assert.doesNotMatch(
    source,
    /onPanResponderMove: \(_event, gesture\) => \{[\s\S]*?focus\(\)[\s\S]*?\},\s*\/\/ A release/u,
  );
  // Focus state is mirrored so a focused box gets native caret and selection touches.
  assert.match(source, /ref=\{inputRef\}/u);
  assert.match(source, /onFocus=\{\(\) => \{ inputFocusedRef\.current = true; \}\}/u);
  assert.match(source, /onBlur=\{\(\) => \{ inputFocusedRef\.current = false; \}\}/u);
  assert.match(source, /inputRef\.current\?\.blur\(\)/u);
});

test('vertical drags over the input scroll the page instead of the input', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(
    source,
    /onMoveShouldSetPanResponderCapture: \(_event, gesture\) => \(\s*Math\.abs\(gesture\.dy\) > BULK_IMPORT_TAP_SLOP\s*&& Math\.abs\(gesture\.dy\) > Math\.abs\(gesture\.dx\)\s*\)/u,
  );
  // The claimed drag moves the parent ScrollView, not the input's own content, and
  // only once the movement has passed the tap threshold.
  assert.match(
    source,
    /onPanResponderMove: \(_event, gesture\) => \{\s*if \(Math\.hypot\(gesture\.dx, gesture\.dy\) <= BULK_IMPORT_TAP_SLOP\) return;\s*scrollRef\.current\?\.scrollTo\(/u,
  );
  assert.match(source, /y: Math\.max\(0, dragStartScrollYRef\.current - gesture\.dy\)/u);
  assert.match(source, /onPanResponderTerminationRequest: \(\) => false/u);
  // Offset tracking so a drag continues from wherever the page already sits.
  assert.match(source, /ref=\{scrollRef\}/u);
  assert.match(source, /onScroll=\{handleScroll\}/u);
  assert.match(source, /scrollYRef\.current = event\.nativeEvent\.contentOffset\.y/u);
  // The input keeps its own scrolling off, so it can never consume the drag itself.
  assert.match(source, /scrollEnabled=\{false\}/u);
});

test('reset button sits directly above the input and clears it back to the default height', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  // Reset row is rendered between the helper copy and the text box, in that order.
  assert.match(
    source,
    /bulk_import_helper'\)\}<\/Text>\s*<View style=\{styles\.resetRow\}>[\s\S]*?<\/View>\s*<View \{\.\.\.inputScrollPan\.panHandlers\}>\s*<TextInput/u,
  );
  assert.match(source, /onPress=\{resetInput\}/u);
  assert.match(source, /const resetDisabled = input\.length === 0/u);
  assert.match(source, /disabled=\{resetDisabled\}/u);
  assert.match(source, /accessibilityLabel=\{t\('bulk_import_reset'\)\}/u);
  // Clearing the value is the whole reset: no separate height state to restore.
  assert.match(source, /const resetInput = \(\) => \{[\s\S]*?setInput\(''\)/u);

  const i18nSource = fs.readFileSync('src/i18n.ts', 'utf8');
  assert.match(i18nSource, /\| 'bulk_import_reset'/u);
  assert.equal(translate('en-US', 'bulk_import_reset'), 'Reset');
  assert.equal(translate('ja', 'bulk_import_reset'), 'リセット');
});

test('successful import closes directly to the word list with no completion screen', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(source, /if \(importResult\.error\) \{[\s\S]*?setImportError\(true\)[\s\S]*?return;[\s\S]*?\}[\s\S]*?onClose\(\)/u);
  assert.match(source, /importError &&[\s\S]*?bulk_import_failed_generic/u);
  assert.doesNotMatch(source, /'result'|setStep\('result'\)|resultContent|resultIcon|resultLine|doneButton/u);
});

test('the closing sheet cannot repaint the preview after a successful import', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  // Importing feeds the new words back in through `existingTexts`, which would mark
  // every reviewed row a duplicate. The body stops rendering in the same update that
  // closes the sheet, so that repaint has nothing to land on.
  assert.match(source, /setImported\(true\);\s*onClose\(\)/u);
  assert.match(
    source,
    /if \(imported\) \{\s*return <FullScreenSheet visible=\{visible\} pal=\{pal\} onRequestClose=\{close\} \/>;\s*\}/u,
  );
  // `importing` stays true on the success path: clearing it would swap the footer
  // spinner for buttons while the sheet is still sliding away.
  assert.doesNotMatch(source, /finally \{\s*setImporting\(false\)/u);
  assert.match(source, /setImportError\(true\);\s*setImporting\(false\);\s*return;/u);
});

test('reopening starts on the input step without a frame of the previous session', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  // Resetting in an effect would paint the old step for one frame first; adjusting
  // during render re-renders before anything reaches the screen.
  assert.match(
    source,
    /if \(visible !== renderedVisible\) \{\s*setRenderedVisible\(visible\);\s*if \(visible\) \{[\s\S]*?setStep\('input'\)[\s\S]*?setImported\(false\)/u,
  );
  assert.doesNotMatch(source, /useEffect\(\(\) => \{\s*if \(!visible\) return;\s*setStep\('input'\)/u);
});

test('onboarding stops rendering before its state resets to the first step', () => {
  const source = fs.readFileSync('src/components/OnboardingModal.tsx', 'utf8');
  // Completing the flow flips `visible` false while the modal is still on screen, and
  // the reset that follows sets step 1. Rendering null from that first render means
  // the Welcome screen has nothing to flash back onto.
  assert.match(source, /if \(!visible\) return null;\s*return \(\s*<Modal visible /u);
  assert.match(source, /if \(wasVisible\.current && !visible\) reset\(\);/u);
  // The reset must stay out of the render path — calling it inline would loop.
  assert.match(source, /useEffect\(\(\) => \{\s*if \(wasVisible\.current && !visible\) reset\(\);/u);
  assert.match(source, /const reset = \(\) => \{[\s\S]*?setStep\(1\)/u);
});

test('no quantity or character limit remains in input, preview, or persistence', () => {
  const sources = [
    'src/components/BulkImportModal.tsx',
    'src/features/cards/bulkImport.ts',
    'src/features/cards/useCards.ts',
    'src/constants.ts',
    'src/i18n.ts',
    'src/app/AppModals.tsx',
    'App.tsx',
  ].map(path => fs.readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /BULK_IMPORT_MAX|maxItems|maxItemChars|exceedsItemLimit|tooLongCount/u);
  assert.doesNotMatch(sources, /bulk_import_item_limit|bulk_import_item_too_long|bulk_import_text_too_long/u);
  assert.doesNotMatch(fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8'), /maxLength=|availableSlots/u);
  assert.doesNotMatch(fs.readFileSync('src/features/cards/useCards.ts', 'utf8'), /error: 'word_limit'/u);
  assert.match(fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8'), /const previewDisabled = parsedDrafts\.length === 0/u);
});

test('keyboard toolbar matches Edit Word with Preview and unchanged dismiss control', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  const wordModal = fs.readFileSync('src/components/WordModal.tsx', 'utf8');
  assert.match(source, /kbHeight > 0 && step === 'input'/u);
  assert.match(source, /onPress=\{openPreview\}/u);
  assert.match(source, /onPress=\{Keyboard\.dismiss\}/u);
  assert.match(source, /accessibilityLabel=\{t\('dismiss_keyboard'\)\}/u);
  assert.match(source, /name="chevron-down" size=\{16\} color=\{pal\.sub\}/u);
  for (const declaration of [
    "height: 52", "paddingHorizontal: 14", "paddingVertical: 7",
    "paddingHorizontal: 18", "borderRadius: 12", "minWidth: 40",
    "height: 36", "shadowOpacity: 0.20", "shadowRadius: 4", "elevation: 4",
  ]) {
    assert.ok(source.includes(declaration), `Bulk Import: ${declaration}`);
    assert.ok(wordModal.includes(declaration), `Edit Word: ${declaration}`);
  }
});

test('preview rows center single-line content while allowing multiline growth', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(source, /previewItem:\s*\{[\s\S]*?alignItems: 'center'/u);
  assert.match(source, /previewItem:\s*\{[\s\S]*?minHeight: 64/u);
  assert.match(source, /itemBody:\s*\{ flex: 1, justifyContent: 'center', minWidth: 0 \}/u);
  assert.match(source, /itemInput:\s*\{[\s\S]*?padding: 0/u);
  assert.match(source, /itemInput:\s*\{[\s\S]*?includeFontPadding: false/u);
  assert.match(source, /itemNumber:\s*\{[\s\S]*?marginRight: 12/u);
  assert.match(source, /scrollEnabled=\{false\}/u);
});

test('Bulk Import entry is in Add Word header immediately before Close, not the overflow menu', () => {
  const wordModal = fs.readFileSync('src/components/WordModal.tsx', 'utf8');
  const notificationModal = fs.readFileSync('src/components/NotificationModal.tsx', 'utf8');
  const sharedStyles = fs.readFileSync('src/styles.ts', 'utf8');
  const contextMenu = fs.readFileSync('src/app/AppContextMenu.tsx', 'utf8');
  const appModals = fs.readFileSync('src/app/AppModals.tsx', 'utf8');
  assert.doesNotMatch(contextMenu, /onBulkImport|bulk_import/u);
  assert.match(wordModal, /!editingCard\s*&&[\s\S]*?s\.compactHeaderButton/u);
  assert.match(wordModal, /accessibilityLabel=\{t\('bulk_import'\)\}/u);
  assert.match(wordModal, /backgroundColor: pal\.input, borderColor: pal\.border/u);
  // Text-only entry: the button carries its label with no leading icon.
  assert.doesNotMatch(wordModal, /documents-outline/u);
  assert.match(wordModal, /compactHeaderButtonText, \{ color: pal\.sub \}/u);
  assert.doesNotMatch(wordModal, /activeOpacity=\{0\.8\}/u);
  assert.match(notificationModal, /s\.compactHeaderButton/u);
  assert.match(notificationModal, /s\.compactHeaderButtonText/u);
  assert.match(sharedStyles, /compactHeaderButton:[\s\S]*?gap: 5[\s\S]*?paddingVertical: 6, paddingHorizontal: 10[\s\S]*?borderRadius: 10, borderWidth: 1/u);
  assert.match(sharedStyles, /compactHeaderButtonText: \{ fontSize: 12, fontWeight: '600' \}/u);
  assert.ok(wordModal.indexOf('s.compactHeaderButton') < wordModal.indexOf('styles.closeButton'));
  assert.match(appModals, /onBulkImport=\{wordModal\.onBulkImport\}/u);
});

test('preview delete button has a localized 44-point target and existing destructive color', () => {
  const source = fs.readFileSync('src/components/BulkImportModal.tsx', 'utf8');
  assert.match(source, /accessibilityLabel=\{`\$\{t\('bulk_import_remove_item'\)\}/u);
  assert.match(source, /removeButton:\s*\{[\s\S]*?width: 44,[\s\S]*?height: 44/u);
  assert.match(source, /size=\{25\}/u);
  assert.match(source, /color=\{DESTRUCTIVE_ACTION_COLOR\}/u);
});
