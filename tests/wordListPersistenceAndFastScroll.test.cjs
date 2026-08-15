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

test('all five filters round-trip per folder and invalid storage falls back safely', () => {
  const levels = loadTypeScriptModule('src/features/cards/levels.ts');
  assert.deepEqual(levels.ALL_LEVEL_KEYS, ['perfect', 'good', 'slightly', 'unknown', 'none']);

  const restored = levels.parseLevelFiltersByFolder(JSON.stringify({
    alpha: ['none', 'perfect', 'perfect', 'unknown'],
    empty: [],
    corrupt: ['future-level'],
  }));
  assert.deepEqual(restored, {
    alpha: ['perfect', 'unknown', 'none'],
    empty: [],
  });
  assert.deepEqual(levels.parseLevelFiltersByFolder('{broken'), {});
});

test('filters load before folders are exposed and persist without a navigation reset', () => {
  const app = read('App.tsx');
  const bootstrap = read('src/app/useAppBootstrap.ts');
  const persistence = read('src/app/useAppPersistence.ts');
  const useCards = read('src/features/cards/useCards.ts');

  assert.match(bootstrap, /AsyncStorage\.getItem\(WORD_LIST_FILTERS_KEY\)/u);
  assert.ok(
    bootstrap.indexOf('setLevelFiltersByFolder(parseLevelFiltersByFolder(rawLevelFilters))')
      < bootstrap.indexOf('setFolders(migratedFolders)'),
    'saved filters must be queued before folders can be opened',
  );
  assert.match(
    persistence,
    /AsyncStorage\.setItem\(WORD_LIST_FILTERS_KEY, JSON\.stringify\(levelFiltersByFolder\)\)/u,
  );
  assert.match(useCards, /levelFiltersByFolder\[currentFolderId\] \?\? ALL_LEVEL_KEYS/u);
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
