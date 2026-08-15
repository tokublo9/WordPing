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
  assert.match(wordList, /showCurrentPosition=\{cardViewMode === 'flip'\}/u);
  assert.match(flip, /const initialIndex = resolveCurrentWordIndex\(cards, currentWordId\);/u);
  assert.match(flip, /onCurrentWordChangeRef\.current\(c\[target\]\.id\)/u);
  assert.match(flip, /onCurrentWordChangeRef\.current\(c\[newIdx\]\?\.id \?\? null\)/u);
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
  assert.match(wordList, /cardViewMode === 'list' && listPositionPrepared/u);
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

test('rapid mode switches cannot publish a cancelled Flip transition', () => {
  const flip = read('src/components/FlipCardBrowser.tsx');

  assert.match(flip, /active: boolean;/u);
  assert.match(flip, /useLayoutEffect\(\(\) => \{[\s\S]*?if \(active\) return;[\s\S]*?transitioningRef\.current = false;/u);
  assert.match(flip, /if \(!finished \|\| !mountedRef\.current\)/u);
  assert.match(flip, /mountedRef\.current = false;/u);
  assert.match(flip, /swipeX\.stopAnimation\(\)/u);
  assert.match(flip, /resolveCurrentWordIndex\([\s\S]*?cards,[\s\S]*?currentWordId,[\s\S]*?idxRef\.current,[\s\S]*?previousCardsRef\.current/u);
});
