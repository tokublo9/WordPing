const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function loadTypeScriptModule(path, mocks = {}) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = id => Object.hasOwn(mocks, id) ? mocks[id] : require(id);
  Function('require', 'module', 'exports', output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

// levels.ts asks testSchedule.ts whether a word is resting or due, and that
// rule reads the clock. Both are supplied here so a test can state the moment it
// is asking about instead of racing the real one.
const NOW = Date.parse('2026-09-03T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;
const clockMock = { appNow: () => NOW };

function loadLevels() {
  const schedule = loadTypeScriptModule('src/features/cards/testSchedule.ts', {
    '../../lib/appClock': clockMock,
  });
  return loadTypeScriptModule('src/features/cards/levels.ts', {
    '../../lib/appClock': clockMock,
    './testSchedule': schedule,
  });
}

test('the row is three results, and none of them is a stored selection', () => {
  const levels = loadLevels();
  // The category set is unchanged — `none` is still counted, for the Test
  // button's badge — but only the three results are drawn, longest interval
  // first.
  assert.deepEqual(levels.ALL_LEVEL_KEYS, ['good', 'slightly', 'unknown', 'none']);
  assert.deepEqual(levels.LEVEL_FILTER_OPTIONS.map(option => option.level), [
    'good', 'slightly', 'unknown',
  ]);

  // Nothing selects, so there is nothing to select, restore or write back: the
  // selection, its parser, its storage key and its per-folder state are gone.
  for (const name of [
    'toggleActiveResultFilter',
    'parseActiveResultFiltersByFolder',
    'isListFilterKey',
    'isSelectableResultFilter',
  ]) {
    assert.equal(levels[name], undefined, name);
  }
  for (const file of [
    'src/features/cards/levels.ts',
    'src/features/cards/useCards.ts',
    'src/features/cards/visibility.ts',
    'src/app/useAppBootstrap.ts',
    'src/app/useAppPersistence.ts',
    'src/constants.ts',
    'App.tsx',
    'src/screens/WordListScreen/WordListScreen.tsx',
  ]) {
    assert.doesNotMatch(
      read(file),
      /activeResultFilter|ActiveResultFiltersByFolder|WORD_LIST_FILTERS_KEY/u,
      file,
    );
  }
});

test('a colour counts its result while it rests; grey counts everything due', () => {
  const levels = loadLevels();
  assert.deepEqual(levels.countCardsByResult([
    // Finished — under no chip at all.
    { testLevel: 'perfect', testMastered: true },
    { testLevel: 'good', testNextReview: NOW + 100_000 },
    { testLevel: 'slightly', testNextReview: NOW + 100_000 },
    // Answered, but its interval ran out: it has left red for grey.
    { testLevel: 'unknown', testNextReview: NOW - 1 },
    { testLevel: 'unknown', testNextReview: NOW + HOUR_MS },
    // Never tested.
    {},
  ], NOW), { good: 1, slightly: 1, unknown: 1, none: 2 });
});

test('an elapsed interval moves a word from its colour to grey with no write', () => {
  const levels = loadLevels();
  const red = { testLevel: 'unknown', testNextReview: NOW + HOUR_MS };
  const before = JSON.stringify(red);

  assert.deepEqual(levels.countCardsByResult([red], NOW), {
    good: 0, slightly: 0, unknown: 1, none: 0,
  });
  assert.deepEqual(levels.countCardsByResult([red], NOW + HOUR_MS), {
    good: 0, slightly: 0, unknown: 0, none: 1,
  });
  assert.equal(JSON.stringify(red), before, 'the card itself is untouched');
});

test('regrading a resting card moves it between exactly one latest-result count', () => {
  const levels = loadLevels();
  const retained = { testLevel: 'good', testNextReview: NOW + 100_000 };
  assert.deepEqual(levels.countCardsByResult([retained], NOW), {
    good: 1, slightly: 0, unknown: 0, none: 0,
  });
  retained.testLevel = 'slightly';
  assert.deepEqual(levels.countCardsByResult([retained], NOW), {
    good: 0, slightly: 1, unknown: 0, none: 0,
  });
});

test('every chip in the row is a colour button, with no Perfect gap', () => {
  const levels = read('src/features/cards/levels.ts');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const testMode = read('src/components/TestModeScreen.tsx');

  assert.doesNotMatch(levels, /\{ level: 'perfect'/u);
  assert.match(wordList, /LEVEL_FILTER_OPTIONS\.map/u);
  assert.match(wordList, /chipGroup: \{[\s\S]*?gap: 8,/u);
  assert.doesNotMatch(wordList, /filterStyles\.separator|filterStyles\.divider/u);
  assert.match(wordList, /accessibilityLabel=\{`\$\{accessibilityLabel\}, \$\{count\}`\}/u);

  // One branch, because every drawn chip is the same kind of thing: a button
  // that opens its explanation, and says it is inert during a test.
  assert.match(wordList, /accessibilityRole="button"/u);
  assert.match(wordList, /accessibilityState=\{\{ disabled: testMode\.active \}\}/u);
  assert.doesNotMatch(wordList, /selected: on|const on = /u);

  // Exactly one onPress among the chips. The Test icon bounds the chip region.
  const chipsAt = wordList.indexOf('{LEVEL_FILTER_OPTIONS.map(');
  const chips = wordList.slice(
    chipsAt,
    wordList.indexOf('onPress={handleOpenTestMode}', chipsAt),
  );
  assert.ok(chips.length > 0);
  assert.equal((chips.match(/onPress=/gu) ?? []).length, 1);
  assert.match(chips, /onPress=\{\(\) => handleChipPress\(level\)\}/u);

  // Only the user-facing filter is gone; the Perfect grading answer remains.
  assert.match(testMode, /\{ kind: 'perfect',[^\n]*labelKey: 'test_know_perfectly'/u);
});

test('the row is three coloured pills and nothing else', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const levels = loadLevels();

  // The grey reading is gone entirely — its text, its number, its rule and the
  // space it occupied. Nothing is left behind to draw or to lay out.
  assert.deepEqual(levels.LEVEL_FILTER_OPTIONS.map(option => option.level), [
    'good', 'slightly', 'unknown',
  ]);
  for (const gone of [
    'isDueChip',
    'grayChip',
    'GRAY_UNDERLINE_WIDTH',
    'chipLabel',
    'chipFlashSquare',
    'result_filter_due',
  ]) {
    assert.doesNotMatch(wordList, new RegExp(gone, 'u'), gone);
  }
  assert.doesNotMatch(read('src/i18n.ts'), /result_filter_due/u);
  // No leftover gap-filler where it used to sit: the group is the three pills.
  assert.doesNotMatch(wordList, /flexShrink: 1,\s*\},\s*chip: \{/u);

  // The three keep exactly what they had: one pill shape, the hairline border,
  // the icon and the count.
  assert.match(wordList, /chip: \{[\s\S]*?borderRadius: 20,/u);
  assert.match(wordList, /chip: \{[\s\S]*?borderWidth: FILTER_BORDER_WIDTH,/u);
  assert.match(wordList, /paddingVertical: CHIP_PADDING_V,/u);
  assert.match(wordList, /const FILTER_BORDER_WIDTH = 1;/u);
  assert.match(
    wordList,
    /\{icon != null\s*\? <Ionicons name=\{icon as any\} size=\{13\} color=\{contentColor\} \/>\s*: null\s*\}/u,
  );
  assert.match(wordList, /<Text style=\{\[filterStyles\.chipCount, \{ color: contentColor \}\]\}>\s*\{count\}/u);
  assert.match(wordList, /chipCount: \{\s*fontSize: 12,\s*fontWeight: '600',\s*\}/u);
  // Every option still carries an icon, now that the one without a chip is gone.
  assert.ok(levels.LEVEL_FILTER_OPTIONS.every(option => option.icon !== null));

  // The due count itself survives — it is what the Test button's badge reads.
  assert.match(wordList, /const untestedCount = levelCounts\.none;/u);
  assert.match(wordList, /untestedCount=\{untestedCount\}/u);

  // The tutorial legend follows the row: three results, no grey entry.
  const tutorial = read('src/components/ResultFilterTutorial.tsx');
  assert.match(
    tutorial,
    /\{icon !== null && <Ionicons name=\{icon as never\} size=\{14\} color=\{color\} \/>\}/u,
  );
  assert.doesNotMatch(read('src/features/cards/levels.ts'), /result_filter_due|level === 'none'/u);
});

test('the coloured chips keep their transparent structure and border colour', () => {
  const levels = loadLevels();
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');

  assert.deepEqual(levels.LEVEL_FILTER_OPTIONS, [
    { level: 'good', icon: 'ellipse-outline', color: '#6BA4F0' },
    { level: 'slightly', icon: 'triangle-outline', color: '#F2B445' },
    { level: 'unknown', icon: 'close-outline', color: '#ED7373' },
  ]);
  assert.match(wordList, /chip: \{[\s\S]*?borderWidth: FILTER_BORDER_WIDTH,[\s\S]*?backgroundColor: 'transparent',/u);
  assert.match(wordList, /style=\{\[filterStyles\.chip, \{ borderColor: pal\.border \}\]\}/u);
  assert.doesNotMatch(wordList, /selectedBorderWidth|selectedBackgroundColor|backgroundColor: '#FFFFFF'/u);
  assert.match(wordList, /accessibilityRole="button"/u);
  assert.doesNotMatch(wordList, /accessibilityRole="text"[\s\S]{0,200}chipContent/u);
});

test('one rule decides "needs testing", and every surface asks it', () => {
  const schedule = read('src/features/cards/testSchedule.ts');
  const levels = read('src/features/cards/levels.ts');
  const visibility = read('src/features/cards/visibility.ts');
  const testMode = read('src/components/TestModeScreen.tsx');
  const folders = read('src/screens/FolderListScreen/FolderListScreen.tsx');

  // Grey is derived, never stored: a word is due when it has no interval left,
  // and resting under its colour while it has.
  assert.match(schedule, /export function isCardDueForTest/u);
  assert.match(schedule, /card\.testNextReview === undefined \|\| card\.testNextReview <= now/u);
  assert.match(schedule, /card\.testNextReview !== undefined && card\.testNextReview > now/u);
  assert.match(schedule, /if \(filter === 'none'\) return isCardDueForTest\(card, now\);/u);
  assert.match(schedule, /return card\.testLevel === filter && isCardWaitingForTest\(card, now\);/u);

  // The counts and each colour's sheet are the same predicate, so a chip's
  // number is always the number of words its sheet shows.
  assert.match(levels, /if \(matchesResultFilter\(card, key, now\)\)/u);
  assert.match(
    read('src/screens/WordListScreen/WordListScreen.tsx'),
    /matchesResultFilter\(card, sheetLevel, now\)/u,
  );
  // The list itself asks a different, simpler question, and only that one.
  assert.match(visibility, /return !isCardHidden\(card, now\);/u);
  // The test queue and the folder badge ask the same question, so neither can
  // claim there is nothing left while the grey chip counts words.
  assert.match(testMode, /cards\.filter\(c => isCardDueForTest\(c, now\)\)/u);
  assert.match(folders, /if \(isCardDueForTest\(card, now\)\) current\.untestedCount\+\+;/u);
  assert.doesNotMatch(folders, /!card\.testLevel\) current\.untestedCount/u);

  // No surface compares the timestamp a second time on its own.
  for (const [name, source] of [
    ['levels', levels],
    ['visibility', visibility],
    ['TestModeScreen', testMode],
    ['FolderListScreen', folders],
  ]) {
    assert.doesNotMatch(source, /testNextReview <= now|testNextReview > now/u, name);
  }

  // A hide ending and an interval ending are different instants; the wake-up is
  // whichever comes first, so a chip cannot sit stale until something unrelated
  // re-renders the screen.
  const useCards = read('src/features/cards/useCards.ts');
  assert.match(useCards, /const hideExpiry = nextHideExpiry\(cards, now\);/u);
  assert.match(useCards, /const dueAt = nextTestDueAt\(cards, now\);/u);
  assert.match(useCards, /Math\.min\(hideExpiry, dueAt\)/u);
});

test('tapping a colour explains it instead of filtering, and Edit opens its sheet', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const dialog = read('src/components/ResultFilterExplanationDialog.tsx');

  // One handler for every chip: a colour opens its explanation, grey still
  // filters. The list is not touched on the way.
  assert.match(
    wordList,
    /const handleChipPress = useCallback\(\(level: LevelFilterKey\) => \{\s*if \(isResultColorFilter\(level\)\) \{\s*setExplainedLevel\(level\);\s*return;\s*\}\s*onToggleResultFilter\(level\);/u,
  );
  assert.match(wordList, /onPress=\{\(\) => handleChipPress\(level\)\}/u);
  assert.equal((wordList.match(/onToggleResultFilter\(level\)/gu) ?? []).length, 1);

  // Edit closes the dialog first and opens the sheet only once it is gone: two
  // modals presented in the same frame can lose the second one on iOS.
  assert.match(dialog, /accessibilityLabel=\{t\('edit'\)\}/u);
  assert.match(dialog, /onPress=\{requestEdit\}/u);
  assert.match(dialog, /editRequested\.current = level;\s*onClose\(\);/u);
  assert.match(dialog, /onDismiss=\{finishDismiss\}/u);
  // Android has no onDismiss, so the same handoff runs from an effect there.
  assert.match(dialog, /Platform\.OS === 'android' && level === null\) finishDismiss\(\);/u);
  assert.match(
    wordList,
    /const openSheetForLevel = useCallback\(\(level: ResultColorFilter\) => \{\s*setSheetLevel\(level\);/u,
  );
  assert.match(wordList, /onEdit=\{openSheetForLevel\}/u);

  // The dialog fades out still showing what it said: content is drawn from a
  // retained copy of the colour, not from the prop that clearing empties.
  assert.match(dialog, /const \[shown, setShown\] = useState<ResultColorFilter \| null>\(null\);/u);
  assert.match(dialog, /useEffect\(\(\) => \{\s*if \(level !== null\) setShown\(level\);/u);
  // Cleared only once the dismissal has finished — the same place the sheet is
  // handed the colour, so the Edit path cannot flash either.
  assert.match(dialog, /const finishDismiss = useCallback\(\(\) => \{\s*setShown\(null\);/u);
  // Visibility is the only thing that reads `level`; every drawn thing reads
  // `shown`, including the accent colour and the icon.
  assert.match(dialog, /visible=\{level !== null\}/u);
  assert.match(dialog, /const option = LEVEL_FILTER_OPTIONS\.find\(entry => entry\.level === shown\);/u);
  assert.match(dialog, /\{shown === null \? '' : t\(TEST_LEVEL_LABEL_KEYS\[shown\]\)\}/u);
  assert.doesNotMatch(dialog, /level === null \? '' :/u);

  // Only the interval is bold, as a nested run inside the one sentence.
  assert.match(
    dialog,
    /\{explanation\.before\}\s*\{explanation\.emphasis !== '' && \(\s*<Text style=\{styles\.bodyInterval\}>\{explanation\.emphasis\}<\/Text>\s*\)\}\s*\{explanation\.after\}/u,
  );
  assert.match(dialog, /bodyInterval: \{ fontWeight: '700' \}/u);
  // Weight alone: the emphasised run must not change size or colour.
  assert.doesNotMatch(dialog, /bodyInterval: \{[^}]*(fontSize|color)/u);

  // Each colour explains its own result and interval, and grey has no dialog.
  const copy = read('src/features/cards/resultFilterCopy.ts');
  assert.match(copy, /good: 'result_sheet_good_body'/u);
  assert.match(copy, /slightly: 'result_sheet_slightly_body'/u);
  assert.match(copy, /unknown: 'result_sheet_unknown_body'/u);
  assert.doesNotMatch(copy, /none:/u);

  const i18n = read('src/i18n.ts');
  assert.match(i18n, /result_sheet_good_body:\s*\n\s*'Words rated Pretty Good in a test are stored here\. They will return to the main list after three days so you can test them again\.',/u);
  assert.match(i18n, /result_sheet_slightly_body:[\s\S]{0,140}after one day/u);
  assert.match(i18n, /result_sheet_unknown_body:[\s\S]{0,140}after one hour/u);
  // The emphasised phrase is its own string, in both required languages.
  assert.match(i18n, /result_sheet_good_interval:\s*'three days',/u);
  assert.match(i18n, /result_sheet_slightly_interval:\s*'one day',/u);
  assert.match(i18n, /result_sheet_unknown_interval:\s*'one hour',/u);
  assert.match(i18n, /result_sheet_good_interval:\s*'3日後',/u);
  assert.match(i18n, /result_sheet_slightly_interval:\s*'1日後',/u);
  assert.match(i18n, /result_sheet_unknown_interval:\s*'1時間後',/u);
  // The intervals in the copy are the ones grading actually writes.
  const grading = read('src/features/cards/grading.ts');
  assert.match(grading, /good:\s*3 \* DAY_MS/u);
  assert.match(grading, /slightly:\s*DAY_MS/u);
  assert.match(grading, /unknown:\s*HOUR_MS/u);
});

test('the result sheet can only select and delete', () => {
  const sheet = read('src/components/ResultWordsSheet.tsx');

  // Bottom to top, and back down again on close.
  assert.match(sheet, /const slideY = useRef\(new Animated\.Value\(SCREEN_H\)\)\.current;/u);
  assert.match(sheet, /Animated\.timing\(slideY, \{\s*toValue: 0,/u);
  assert.match(sheet, /Animated\.timing\(slideY, \{ toValue: SCREEN_H,/u);

  // Selection and one destructive action, which confirms first.
  assert.match(sheet, /accessibilityRole="checkbox"/u);
  assert.match(sheet, /onPress=\{toggleSelectAll\}/u);
  assert.match(sheet, /Alert\.alert\(\s*t\('delete'\)/u);
  assert.match(sheet, /style: 'destructive'/u);
  assert.match(sheet, /onDelete\(ids\)/u);

  // Nothing else may act on a word here: no edit, move, notification or voice.
  assert.doesNotMatch(sheet, /onEdit|onMove|onToggleNotif|notifOff|VoiceButton|openEdit/u);
  // And it writes nothing to a card itself — deletion is the caller's to do.
  assert.doesNotMatch(sheet, /setCards|testLevel:|testNextReview|hiddenUntil/u);

  // Its own empty state, rather than the Word List's.
  assert.match(sheet, /testID="result-sheet-empty"/u);
  assert.match(sheet, /t\('result_sheet_empty_title'\)/u);
  assert.match(sheet, /t\('result_sheet_empty_hint'\)/u);

  // The words shown are the same rule the chip counted, asked again as it opens.
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  assert.match(
    wordList,
    /return allFolderCards\.filter\(card => matchesResultFilter\(card, sheetLevel, now\)\);/u,
  );
  // Deleting goes through the one delete path, not a second implementation.
  assert.match(wordList, /onDelete=\{actions\.onDeleteWords\}/u);
  const useCards = read('src/features/cards/useCards.ts');
  assert.match(useCards, /const deleteCard = \(id: string\) => deleteCards\(\[id\]\);/u);
  assert.match(useCards, /const deleteSelected = \(\) => \{\s*deleteCards\(\[\.\.\.selectedIds\]\);/u);
  assert.match(read('App.tsx'), /onDeleteWords: deleteCards,/u);
});

test('the folder word count is the only place that number is shown', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');

  // It reads under the folder name and nowhere else — the chip that mirrored it
  // is gone, so there is no second copy to disagree with.
  assert.match(wordList, /const visibleWordCount = visibleFolderCards\.length;/u);
  assert.match(wordList, /const wordCountSummary = `\$\{visibleWordCount\} /u);
  assert.match(wordList, /total=\{visibleWordCount\}/u);
  assert.equal((wordList.match(/visibleWordCount/gu) ?? []).length, 5);
  assert.doesNotMatch(wordList, /isDueChip \? visibleWordCount/u);
});

test('nothing narrows the list, so no filter state is kept or written', () => {
  const app = read('App.tsx');
  const bootstrap = read('src/app/useAppBootstrap.ts');
  const persistence = read('src/app/useAppPersistence.ts');
  const useCards = read('src/features/cards/useCards.ts');
  const constants = read('src/constants.ts');

  // The stored selection is gone: no key, no read, no write, no state.
  assert.doesNotMatch(constants, /WORD_LIST_FILTERS_KEY/u);
  assert.doesNotMatch(bootstrap, /WORD_LIST_FILTERS_KEY|rawLevelFilters/u);
  assert.doesNotMatch(persistence, /WORD_LIST_FILTERS_KEY|activeResultFilters/u);
  assert.doesNotMatch(app, /activeResultFilters|toggleResultFilter/u);
  assert.doesNotMatch(useCards, /activeResultFilter|toggleResultFilter/u);

  // One visible list, built by hiding alone.
  assert.match(useCards, /const folderCards = useMemo\(/u);
  assert.doesNotMatch(useCards, /filteredFolderCards/u);
  assert.match(app, /visibleFolderCards=\{folderCards\}/u);
});

test('fast-scroll geometry preserves the grab point and clamps at both ends', () => {
  const scrollBar = loadTypeScriptModule('src/components/ScrollBar.tsx', {
    'react-native': {
      Animated: { Value: class Value {} },
      StyleSheet: { create: value => value },
      View: function View() {},
    },
  });
  const metrics = scrollBar.getScrollBarMetrics(2000, 500);
  assert.deepEqual(metrics, {
    show: true,
    thumbH: 125,
    maxTravel: 375,
    maxScroll: 1500,
  });

  const containerPageY = 100;
  const grabOffset = 20;
  const middlePageY = containerPageY + (750 / metrics.maxScroll) * metrics.maxTravel + grabOffset;
  assert.equal(
    scrollBar.getScrollOffsetForThumb(middlePageY, containerPageY, grabOffset, metrics),
    750,
  );
  assert.equal(scrollBar.getScrollOffsetForThumb(-1000, containerPageY, grabOffset, metrics), 0);
  assert.equal(scrollBar.getScrollOffsetForThumb(10000, containerPageY, grabOffset, metrics), 1500);
  assert.equal(scrollBar.getScrollBarMetrics(500, 500).show, false);
});

test('fast scrolling requires a long press while the thumb remains native-driven', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const reorderable = read('src/components/ReorderableList.tsx');
  const scrollBar = read('src/components/ScrollBar.tsx');

  const delay = Number(/FAST_SCROLL_LONG_PRESS_MS = (\d+)/u.exec(wordList)[1]);
  const targetWidth = Number(/FAST_SCROLL_TOUCH_WIDTH = (\d+)/u.exec(wordList)[1]);
  const activeTargetWidth = Number(/FAST_SCROLL_ACTIVE_TOUCH_WIDTH = (\d+)/u.exec(wordList)[1]);
  const visibleWidth = Number(/thumb: \{[\s\S]*?width:\s+(\d+),/u.exec(scrollBar)[1]);
  const activeWidth = Number(/outputRange: \[3, (\d+)\]/u.exec(scrollBar)[1]);
  const activeRadius = Number(/outputRange: \[2, (\d+)\]/u.exec(scrollBar)[1]);
  assert.ok(delay >= 180 && delay <= 300, `${delay}ms must be short but reject ordinary scrolling`);
  assert.ok(targetWidth >= 40, `the passive ${targetWidth}pt grab zone must be substantial`);
  assert.ok(activeTargetWidth > targetWidth, 'the active grab zone must expand further');
  assert.ok(activeWidth >= visibleWidth * 2, 'the active thumb must at least double');
  assert.ok(activeRadius >= activeWidth / 2, 'the active thumb must remain a rounded capsule');
  for (let step = 0; step <= 10; step += 1) {
    const progress = step / 10;
    const width = visibleWidth + (activeWidth - visibleWidth) * progress;
    const radius = 2 + (activeRadius - 2) * progress;
    assert.ok(radius >= width / 2, `radius ${radius} must round width ${width} at ${progress}`);
  }
  assert.match(scrollBar, /thumbPosition: \{[\s\S]*?right:\s+2,[\s\S]*?width:\s+3,/u);
  assert.match(scrollBar, /thumb: \{[\s\S]*?right:\s+0,[\s\S]*?width:\s+3,[\s\S]*?borderRadius: 2,/u);
  assert.match(wordList, /onMoveShouldSetPanResponderCapture: shouldClaimMove/u);
  assert.match(wordList, /FAST_SCROLL_MOVE_SLOP/u);
  assert.match(wordList, /getScrollOffsetForThumb\(/u);
  assert.match(reorderable, /scrollToOffset\(\{ offset, animated: false \}\)/u);
  assert.doesNotMatch(wordList, /listScrollAnim\.setValue/u);
});

test('scrollbar shape animation never shares a native-driven props node', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const scrollBar = read('src/components/ScrollBar.tsx');

  assert.doesNotMatch(wordList, /listPressAnim/u);
  assert.match(wordList, /const scrollbarShapeAnim = useRef\(new Animated\.Value\(0\)\)\.current;/u);

  const animateStart = wordList.indexOf('const animateScrollbarActive');
  const animateEnd = wordList.indexOf('const finishFastScrollGesture', animateStart);
  const animateBlock = wordList.slice(animateStart, animateEnd);
  assert.ok(animateStart >= 0 && animateEnd > animateStart, 'shape animation callback must exist');
  assert.ok(
    animateBlock.indexOf('scrollbarShapeAnim.stopAnimation()')
      < animateBlock.indexOf('Animated.timing(scrollbarShapeAnim'),
    'rapid reversals must stop the running shape animation first',
  );
  assert.match(animateBlock, /useNativeDriver: false/u);
  assert.doesNotMatch(animateBlock, /useNativeDriver: true/u);
  assert.equal(
    (wordList.match(/Animated\.timing\(scrollbarShapeAnim/gu) ?? []).length,
    1,
    'one JS-only animation entry point controls the shape value',
  );

  const nativeLayerStart = scrollBar.indexOf('Native-only layer');
  const jsLayerStart = scrollBar.indexOf('JS-only layer');
  const stylesStart = scrollBar.indexOf('const styles', jsLayerStart);
  const nativeLayer = scrollBar.slice(nativeLayerStart, jsLayerStart);
  const jsLayer = scrollBar.slice(jsLayerStart, stylesStart);
  assert.match(nativeLayer, /opacity:\s+fadeAnim/u);
  assert.match(nativeLayer, /translateY: thumbTranslateY/u);
  assert.doesNotMatch(nativeLayer, /thumbWidth|thumbBorderRadius|shapeAnim/u);
  assert.match(jsLayer, /width: thumbWidth/u);
  assert.match(jsLayer, /borderRadius: thumbBorderRadius/u);
  assert.doesNotMatch(jsLayer, /fadeAnim|thumbTranslateY/u);
  assert.match(scrollBar, /const zeroShapeAnim = useRef\(new Animated\.Value\(0\)\)\.current;/u);
  assert.match(scrollBar, /const zeroScrollAnim = useRef\(new Animated\.Value\(0\)\)\.current;/u);
});
