const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function loadTypeScriptModule(path) {
  const source = fs.readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

const { resolveCurrentWordIndex } =
  loadTypeScriptModule('src/features/cards/currentWordPosition.ts');

const cards = ids => ids.map(id => ({ id }));

test('stable IDs resolve against filtering and sorting with a nearest valid fallback', () => {
  assert.equal(resolveCurrentWordIndex(cards(['a', 'b', 'c']), 'b', 0), 1);
  assert.equal(resolveCurrentWordIndex(cards(['c', 'a', 'b']), 'b', 0), 2);
  assert.equal(resolveCurrentWordIndex(cards(['a', 'c']), 'b', 1), 1);
  assert.equal(resolveCurrentWordIndex(cards(['a', 'c']), 'missing', 99), 1);
  assert.equal(
    resolveCurrentWordIndex(
      cards(['a', 'd', 'e']),
      'c',
      2,
      cards(['a', 'b', 'c', 'd', 'e']),
    ),
    1,
    'the closest surviving neighbor should win instead of the clamped index',
  );
  assert.equal(resolveCurrentWordIndex([], 'a', 0), -1);
});

test('Word List and Word Flip share one per-folder current word ID', () => {
  const useCards = read('src/features/cards/useCards.ts');
  const app = read('App.tsx');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');

  assert.match(useCards, /const \[currentWordIdsByFolder, setCurrentWordIdsByFolder\]/u);
  assert.match(useCards, /const currentWordId = currentFolderId[\s\S]*?currentWordIdsByFolder\[currentFolderId\]/u);
  assert.match(app, /currentWordId=\{currentWordId\}/u);
  assert.match(app, /onCurrentWordChange=\{setCurrentWordId\}/u);

  assert.match(wordList, /onTopVisibleCardChange=\{handleTopVisibleCardChange\}/u);
  assert.match(wordList, /onCurrentWordChange\(cardId\)/u);
  assert.match(wordList, /currentWordId=\{resolvedCurrentWordId\}/u);
  assert.match(wordList, /currentIndex=\{resolvedCurrentWordIndex \+ 1\}/u);
  assert.match(wordList, /showCurrentPosition=\{cardViewMode === 'flip' && isFilterActive\}/u);
  assert.match(flip, /const initialIndex = resolveCurrentWordIndex\(cards, currentWordId\);/u);
  assert.match(flip, /onCurrentWordChangeRef\.current\(c\[target\]\.id\)/u);
  assert.match(flip, /onCurrentWordChangeRef\.current\(c\[newIdx\]\?\.id \?\? null\)/u);
});

test('the shared current-word id still drives both modes to the same card', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');

  // Nothing narrows the list any more, so there are no filter transitions left
  // to publish a destination for. What remains is the shared ID itself, which
  // still drives the already-mounted list and Flip to the same card without
  // remounting either mode.
  assert.doesNotMatch(
    read('src/features/cards/useCards.ts'),
    /activeResultFilter|toggleResultFilter|nextFilter/u,
  );
  assert.match(wordList, /listScrollToIndexRef\.current\?\.\(resolvedCurrentWordIndex\);/u);
  assert.match(flip, /const target = resolveCurrentWordIndex\([\s\S]*?currentWordId/u);
  assert.match(
    flip,
    /if \(target !== idxRef\.current \|\| centeredId !== targetId\) \{[\s\S]*?goTo\(target, active\);/u,
  );
});

test('returning to Word List prepositions the mounted hidden list before revealing it', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const reorderable = read('src/components/ReorderableList.tsx');

  assert.match(wordList, /isRestoringListPositionRef/u);
  assert.match(
    wordList,
    /if \(restoreTargetWordIdRef\.current !== cardId[\s\S]*?restoreTargetIndexRef\.current !== index\) return;/u,
  );
  assert.match(wordList, /useLayoutEffect\(\(\) => \{[\s\S]*?listScrollToIndexRef\.current\?\.\(resolvedCurrentWordIndex\);/u);
  // The layer decision moved into features/cards/modeLayers.ts so it could be
  // unit-tested; see tests/unit/modeLayers.test.ts for its behaviour.
  const modeLayers = read('src/features/cards/modeLayers.ts');
  assert.match(modeLayers, /cardViewMode === 'list' && listPositionPrepared/u);
  assert.match(wordList, /resolveModeLayers\(\{[\s\S]*?listPositionPrepared,/u);
  assert.match(wordList, /const flipModeContent = \(/u);
  assert.match(wordList, /const listModeContent = \(/u);
  assert.match(wordList, /pointerEvents=\{showListLayer \? 'auto' : 'none'\}/u);
  assert.match(wordList, /accessibilityElementsHidden=\{!showListLayer\}/u);
  assert.match(wordList, /initialScrollIndex=\{initialListPositionRef\.current\.index\}/u);
  assert.match(wordList, /scrollToIndexRef=\{listScrollToIndexRef\}/u);
  assert.match(reorderable, /scrollToIndex\(\{ index, animated: false, viewPosition: 0 \}\)/u);
  assert.match(reorderable, /onScrollToIndexFailed=\{handleScrollToIndexFailed\}/u);
  assert.match(reorderable, /averageItemLength \* target/u);
  assert.match(reorderable, /scrollToIndexRetryCountRef\.current >= 2/u);
  assert.match(reorderable, /scrollToIndexRetryFrame\.current = requestAnimationFrame/u);
  assert.doesNotMatch(reorderable, /scrollToIndexRetryTimer/u);
});

test('List to Flip keeps the list visible until the mounted deck reports readiness', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');
  const handler = /const handleViewModeChange = useCallback\([\s\S]*?\n\s*\}, \[cardViewMode,/u.exec(wordList)?.[0] ?? '';

  assert.match(wordList, /const flipPositionPrepared = resolvedCurrentWordId === null[\s\S]{0,220}preparedFlipPosition\.index === resolvedCurrentWordIndex/u);
  assert.match(wordList, /resolveModeLayers\(\{[\s\S]{0,220}flipPositionPrepared,/u);
  assert.match(wordList, /preparing=\{cardViewMode === 'flip' && !flipPositionPrepared && !reorder\.active\}/u);
  assert.match(wordList, /onPositionPrepared=\{markFlipPositionPrepared\}/u);
  assert.match(flip, /if \(!active && !preparing\) \{\s*previousCardsRef\.current = cards;/u);
  assert.match(flip, /goTo\(target, active\);/u);
  assert.match(flip, /if \(preparing && target === idx && centeredId === targetId\) \{\s*onPositionPrepared\(targetId, target\);/u);
  // The selected mode still publishes directly; readiness only controls which
  // already-mounted layer is visible. No timer conceals an incorrect frame.
  assert.match(handler, /onChangeViewMode\(nextMode\);/u);
  assert.doesNotMatch(handler, /setTimeout|requestAnimationFrame|InteractionManager/u);
});

test('a Flip layer held during List restoration stays visually stable until handoff', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');

  assert.match(wordList, /active=\{showFlipLayer && !reorder\.active && !showTestLayer\}/u);
  assert.match(wordList, /useLayoutEffect\(\(\) => \{\s*visibleLayerRef\.current = hasCards/u);
  assert.doesNotMatch(wordList, /useEffect\(\(\) => \{\s*visibleLayerRef\.current = hasCards/u);
});

test('rapid mode switches cannot publish a cancelled Flip transition', () => {
  const flip = read('src/components/FlipCardBrowser.tsx');

  assert.match(flip, /active: boolean;/u);
  assert.match(flip, /useLayoutEffect\(\(\) => \{[\s\S]*?if \(active\) return;[\s\S]*?transitioningRef\.current = false;/u);
  assert.match(flip, /if \(!finished \|\| !mountedRef\.current\)/u);
  assert.match(flip, /mountedRef\.current = false;/u);
  assert.match(flip, /swipeX\.stopAnimation\(\)/u);
  assert.match(flip, /resolveCurrentWordIndex\([\s\S]*?cards,[\s\S]*?currentWordId,[\s\S]*?idxRef\.current,[\s\S]*?previousCardsRef\.current/u);
});
