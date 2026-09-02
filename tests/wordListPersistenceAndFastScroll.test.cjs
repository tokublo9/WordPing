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

test('exclusive filters load new values and safely migrate legacy multi-select arrays', () => {
  const levels = loadTypeScriptModule('src/features/cards/levels.ts');
  assert.deepEqual(levels.ALL_LEVEL_KEYS, ['good', 'slightly', 'unknown', 'none']);
  assert.deepEqual(levels.LEVEL_FILTER_OPTIONS.map(option => option.level), [
    'good', 'slightly', 'unknown', 'none',
  ]);

  const restored = levels.parseActiveResultFiltersByFolder(JSON.stringify({
    current: 'good',
    cleared: null,
    legacySingle: ['slightly'],
    alpha: ['none', 'perfect', 'perfect', 'unknown'],
    empty: [],
    corrupt: ['future-level'],
    // Gray was a filter in earlier builds. It is a count now, and its chip is
    // no longer a button — so a stored gray selection has to come back as no
    // filter at all rather than as a state nothing on screen could clear.
    gray: 'none',
    legacyGray: ['none'],
  }));
  assert.deepEqual(restored, {
    current: 'good',
    cleared: null,
    legacySingle: 'slightly',
    alpha: null,
    empty: null,
    gray: null,
    legacyGray: null,
  });
  assert.deepEqual(levels.parseActiveResultFiltersByFolder('{broken'), {});
});

test('remaining colorful counts include sync-hidden cards and exclude Perfect', () => {
  const levels = loadTypeScriptModule('src/features/cards/levels.ts');
  assert.deepEqual(levels.countCardsByResult([
    { testLevel: 'perfect' },
    { testLevel: 'good', hiddenUntil: Date.now() + 100_000 },
    { testLevel: 'slightly', hiddenUntil: Date.now() + 100_000 },
    { testLevel: 'unknown' },
    {},
  ]), { good: 1, slightly: 1, unknown: 1, none: 1 });
});

test('regrading a retained card moves it between exactly one latest-result count', () => {
  const levels = loadTypeScriptModule('src/features/cards/levels.ts');
  const retained = { testLevel: 'good', hiddenUntil: Date.now() + 100_000 };
  assert.deepEqual(levels.countCardsByResult([retained]), {
    good: 1, slightly: 0, unknown: 0, none: 0,
  });
  retained.testLevel = 'slightly';
  assert.deepEqual(levels.countCardsByResult([retained]), {
    good: 0, slightly: 1, unknown: 0, none: 0,
  });
});

test('the shared filter row has three accessible buttons with no Perfect gap', () => {
  const levels = read('src/features/cards/levels.ts');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const testMode = read('src/components/TestModeScreen.tsx');

  assert.doesNotMatch(levels, /\{ level: 'perfect'/u);
  assert.match(wordList, /LEVEL_FILTER_OPTIONS\.map/u);
  assert.match(wordList, /chipGroup: \{[\s\S]*?gap: 8,/u);
  assert.doesNotMatch(wordList, /filterStyles\.separator|filterStyles\.divider/u);
  assert.match(wordList, /accessibilityRole="button"/u);
  assert.match(wordList, /accessibilityLabel=\{`\$\{accessibilityLabel\}, \$\{count\}`\}/u);
  // The selected state is still announced; during a test the same chip also
  // announces that it is inert rather than going quietly unresponsive.
  assert.match(wordList, /accessibilityState=\{\{ selected: on, disabled: testMode\.active \}\}/u);
  assert.match(wordList, /const on = activeResultFilter === level;/u);

  // Only the three colours are buttons. Gray reports a count and does nothing,
  // so it is not pressable and is not announced as a control.
  assert.match(wordList, /const selectable = isSelectableResultFilter\(level\);/u);
  assert.match(wordList, /\{selectable \? \(\s*<TouchableOpacity/u);
  assert.match(
    wordList,
    /\) : \(\s*\/\*[\s\S]*?\*\/\s*<View\s*style=\{\[[\s\S]*?\]\}\s*accessible\s*accessibilityRole="text"\s*accessibilityLabel=\{`\$\{accessibilityLabel\}, \$\{count\}`\}/u,
  );
  // The one onPress among the chips belongs to the selectable branch. Bounded
  // by the Test button, which is the next control after the chip group.
  const chipsAt = wordList.indexOf('{LEVEL_FILTER_OPTIONS.map(');
  const chips = wordList.slice(
    chipsAt,
    wordList.indexOf('onPress={handleOpenTestMode}', chipsAt),
  );
  assert.ok(chips.length > 0);
  assert.equal((chips.match(/onPress=/gu) ?? []).length, 1);

  // Only the user-facing filter is gone; the Perfect grading answer remains.
  assert.match(testMode, /\{ kind: 'perfect',[^\n]*labelKey: 'test_know_perfectly'/u);
});

test('the gray chip is a rule under its number, not a pill', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');

  // Squared off, then stripped of every border but the bottom one — so what is
  // left is an underline. Derived from the ordinary chip rather than rebuilt,
  // so the two cannot drift apart.
  assert.match(
    wordList,
    /grayChip: \{\s*borderRadius: 0,\s*borderTopWidth: 0,\s*borderLeftWidth: 0,\s*borderRightWidth: 0,\s*borderBottomWidth: FILTER_BORDER_WIDTH,/u,
  );
  assert.match(
    wordList,
    /style=\{\[\s*filterStyles\.chip,\s*filterStyles\.grayChip,\s*\{ borderColor: pal\.border \},\s*\]\}/u,
  );
  // The removed top border is given back as padding, so the rule still lands on
  // the bottom edge of the pills beside it.
  assert.match(wordList, /paddingTop: CHIP_PADDING_V \+ FILTER_BORDER_WIDTH,/u);
  assert.match(wordList, /paddingVertical: CHIP_PADDING_V,/u);
  // Only gray is squared: the coloured chips keep their pill.
  assert.match(wordList, /chip: \{[\s\S]*?borderRadius: 20,/u);
  assert.equal((wordList.match(/filterStyles\.grayChip/gu) ?? []).length, 1);

  // It still carries the count, and still has no icon of its own.
  assert.match(wordList, /<Text style=\{\[filterStyles\.chipCount, \{ color: contentColor \}\]\}>\s*\{count\}/u);
  assert.match(
    wordList,
    /\{icon != null\s*\? <Ionicons name=\{icon as any\} size=\{13\} color=\{contentColor\} \/>\s*: null\s*\}/u,
  );
  const levels = loadTypeScriptModule('src/features/cards/levels.ts');
  assert.equal(levels.LEVEL_FILTER_OPTIONS.find(o => o.level === 'none').icon, null);

  // The tutorial legend is untouched — it depicts the colours, not the chrome.
  const tutorial = read('src/components/ResultFilterTutorial.tsx');
  assert.match(
    tutorial,
    /\{icon !== null && <Ionicons name=\{icon as never\} size=\{14\} color=\{color\} \/>\}/u,
  );
});

test('the gray filter uses the same transparent structure and border width as every color', () => {
  const levels = loadTypeScriptModule('src/features/cards/levels.ts');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const gray = levels.LEVEL_FILTER_OPTIONS.find(option => option.level === 'none');

  assert.deepEqual(gray, {
    level: 'none',
    icon: null,
    color: '#6B7280',
  });
  assert.ok(levels.LEVEL_FILTER_OPTIONS.every(option => Object.keys(option).every(
    key => ['level', 'icon', 'color'].includes(key),
  )));
  assert.match(wordList, /const FILTER_BORDER_WIDTH = 1;/u);
  assert.match(wordList, /chip: \{[\s\S]*?borderWidth: FILTER_BORDER_WIDTH,[\s\S]*?backgroundColor: 'transparent',/u);
  assert.match(wordList, /style=\{\[\s*filterStyles\.chip,\s*\{ borderColor: on \? color : pal\.border \},\s*\]\}/u);
  assert.match(wordList, /const contentColor = on \? color : '#9CA3AF';/u);
  assert.doesNotMatch(wordList, /selectedBorderWidth|selectedBackgroundColor|backgroundColor: '#FFFFFF'/u);
  assert.match(wordList, /accessibilityRole="button"/u);
  assert.match(wordList, /accessibilityState=\{\{ selected: on, disabled: testMode\.active \}\}/u);
  // Gray builds on the same chip — same border colour, same transparent
  // background — and overrides only the edges it drops. It has no selected
  // state to express, so it never reads `on`.
  assert.match(
    wordList,
    /style=\{\[\s*filterStyles\.chip,\s*filterStyles\.grayChip,\s*\{ borderColor: pal\.border \},\s*\]\}/u,
  );
  assert.doesNotMatch(wordList, /grayChip: \{[\s\S]*?backgroundColor/u);
});

test('tapping filters is exclusive and tapping the active filter clears it', () => {
  const levels = loadTypeScriptModule('src/features/cards/levels.ts');
  const colors = ['good', 'slightly', 'unknown'];
  assert.deepEqual(levels.SELECTABLE_RESULT_FILTERS, colors);
  for (const color of colors) {
    assert.equal(levels.toggleActiveResultFilter(null, color), color);
    assert.equal(levels.toggleActiveResultFilter(color, color), null);
  }
  for (const current of colors) {
    for (const next of colors) {
      if (current !== next) {
        assert.equal(levels.toggleActiveResultFilter(current, next), next);
      }
    }
  }

  // Gray selects nothing, from any state: it cannot be turned on, and it cannot
  // turn off or replace a selection that is already there.
  assert.equal(levels.toggleActiveResultFilter(null, 'none'), null);
  for (const current of colors) {
    assert.equal(levels.toggleActiveResultFilter(current, 'none'), current);
  }
  assert.equal(levels.toggleActiveResultFilter('none', 'none'), 'none');
  assert.equal(levels.isSelectableResultFilter('none'), false);
  // Still a counted category, or the chip would have nothing to report.
  assert.equal(levels.isLevelFilterKey('none'), true);

  const useCards = read('src/features/cards/useCards.ts');
  assert.match(
    useCards,
    /const nextFilter = toggleActiveResultFilter\(activeResultFilter, level\);/u,
  );
  assert.match(
    useCards,
    /const firstCardId = cardsForVisibility\(allFolderCards, \{\s*now: appNow\(\),\s*activeResultFilter: nextFilter,\s*\}\)\[0\]\?\.id \?\? null;/u,
  );
  assert.match(useCards, /setCurrentWordId\(firstCardId\);/u);
  assert.match(useCards, /\[currentFolderId\]: nextFilter,/u);
  assert.doesNotMatch(useCards, /new Set\(current\)|\.add\(level\)|\.delete\(level\)/u);
  assert.match(
    useCards,
    /activeResultFilter: ActiveResultFilter;/u,
  );
});

test('filters load before folders are exposed and persist without a navigation reset', () => {
  const app = read('App.tsx');
  const bootstrap = read('src/app/useAppBootstrap.ts');
  const persistence = read('src/app/useAppPersistence.ts');
  const useCards = read('src/features/cards/useCards.ts');

  assert.match(bootstrap, /AsyncStorage\.getItem\(WORD_LIST_FILTERS_KEY\)/u);
  assert.ok(
    bootstrap.indexOf('setActiveResultFiltersByFolder(parseActiveResultFiltersByFolder(rawLevelFilters))')
      < bootstrap.indexOf('setFolders(migratedFolders)'),
    'saved filters must be queued before folders can be opened',
  );
  assert.match(
    persistence,
    /AsyncStorage\.setItem\(WORD_LIST_FILTERS_KEY, JSON\.stringify\(activeResultFiltersByFolder\)\)/u,
  );
  assert.match(useCards, /activeResultFiltersByFolder\[currentFolderId\] \?\? null/u);
  assert.doesNotMatch(app, /resetLevelFilter/u);
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
