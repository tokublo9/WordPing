const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('the list data keeps its identity across unrelated renders', () => {
  const useCards = read('src/features/cards/useCards.ts');
  // These arrays are the list's `data`. Rebuilt inline they got a new identity on every
  // App render, re-running the filter and making the list re-evaluate its cells.
  assert.match(
    useCards,
    /const allFolderCards = useMemo\([\s\S]*?cards\.filter\(c => c\.folderId === currentFolderId\)[\s\S]*?\[cards, currentFolderId\],\s*\);/u,
  );
  // hideEpoch changes only when a hide runs out, so unrelated renders do not
  // invalidate the memoized list data.
  assert.match(useCards, /const \[hideEpoch, setHideEpoch\] = useState\(0\);/u);
  assert.match(useCards, /setTimeout\(\s*\(\) => setHideEpoch\(epoch => epoch \+ 1\),/u);
  // Hiding is applied inside the same memo, and cardsForVisibility returns the very
  // same array when nothing is hidden — so the common case keeps its identity
  // and the list is not re-evaluated.
  assert.match(useCards, /cardsForVisibility\(/u);
  assert.match(
    read('src/features/cards/visibility.ts'),
    /return cards\.some\(card => !shouldShowCard\(card, context\)\)\s*\? cards\.filter[\s\S]*?: cards;/u,
  );
  assert.match(
    useCards,
    /const filteredFolderCards = useMemo\([\s\S]*?\[displayedAllFolderCards, activeResultFilter, hideEpoch\],\s*\);/u,
  );
  // A pending reorder deliberately changes list identity once, while unrelated
  // renders continue to reuse either the saved or pending array.
  assert.match(
    useCards,
    /const displayedAllFolderCards = reorderMode && pendingFolderCards\s*\? pendingFolderCards\s*:\s*allFolderCards;/u,
  );
  // Cards live in App state, so leaving the screen and coming back re-renders from
  // state. Nothing may key the list on anything that changes during a transition.
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  assert.match(wordList, /key="persistent-word-list"/u);
});

test('mode switching keeps inactive views mounted without rebuilding their heavy content', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const reorderable = read('src/components/ReorderableList.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');

  assert.match(reorderable, /export const ReorderableList = memo\(ReorderableListComponent\);/u);
  assert.match(wordList, /const renderWordCard = useCallback\(/u);
  assert.match(wordList, /onReorder=\{handleReorderVisibleCards\}/u);
  assert.match(wordList, /onFooterPress=\{handleListFooterPress\}/u);
  assert.match(wordList, /initialScrollIndex=\{initialListPositionRef\.current\.index\}/u);
  assert.match(flip, /if \(!previous\.active && !next\.active\) return true;/u);
  assert.match(flip, /if \(!active\) \{\s*previousCardsRef\.current = cards;\s*return;/u);
  assert.match(wordList, /key="persistent-word-list"/u);
});

test('Flip swipe and progress share one transform-only animated gesture graph', () => {
  const flip = read('src/components/FlipCardBrowser.tsx');
  const gestureMove = /onPanResponderMove: \(_, \{ dx \}\) => \{([\s\S]*?)\n\s*\},/u.exec(flip)?.[1] ?? '';

  assert.match(gestureMove, /swipeX\.setValue\(Math\.max\(minX, Math\.min\(maxX, dx\)\)\);/u);
  assert.doesNotMatch(gestureMove, /set(?:Idx|SlotCards|CurrSlot|Flipped|Scrubbing)\(/u);
  assert.doesNotMatch(gestureMove, /onCurrentWordChange/u);
  assert.equal((gestureMove.match(/\.setValue\(/gu) ?? []).length, 1);
  assert.match(flip, /Animated\.add\(baseX, swipeX\)/u);
  assert.match(flip, /const gestureProgress = Animated\.multiply\(swipeX,/u);
  assert.match(flip, /const displayedThumbX = scrubbing \? scrubThumbX : swipeThumbX;/u);
  assert.match(flip, /transform: \[\{ scaleX: progressScaleX \}\]/u);
  assert.match(flip, /transform: \[\{ translateX: displayedThumbX \}\]/u);
  assert.doesNotMatch(flip, /width: thumbX/u);
  assert.doesNotMatch(flip, /useNativeDriver: false/u);
  assert.match(flip, /Animated\.timing\(swipeX,[\s\S]*?useNativeDriver: true/u);
  assert.match(flip, /Animated\.spring\(swipeX,[\s\S]*?useNativeDriver: true/u);
  assert.match(flip, /const cardsById = useMemo\(/u);
  assert.doesNotMatch(flip, /cards\.find\(/u);
});

test('the Word Add button owns a top-level overlay and the list clears it', () => {
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const styles = read('src/styles.ts');

  assert.match(wordList, /<View style=\{fabOverlayStyles\.root\} pointerEvents="box-none">\s*\{fab\}/u);
  assert.match(wordList, /root: \{[\s\S]*?\.\.\.StyleSheet\.absoluteFillObject,[\s\S]*?zIndex: 100,[\s\S]*?elevation: 100,/u);
  assert.match(styles, /fab: \{[\s\S]*?position: 'absolute'[\s\S]*?zIndex: 101,[\s\S]*?elevation: 101,/u);
  assert.match(wordList, /\+ FAB_LIST_EXTRA_CLEARANCE/u);
});

test('virtualized rows are driven by stable callbacks with an explicit repaint marker', () => {
  const source = read('src/components/ReorderableList.tsx');
  // Inline arrows here re-render every mounted cell on any parent update.
  assert.match(source, /keyExtractor=\{keyExtractor\}/u);
  assert.match(source, /renderItem=\{renderVirtualizedRow\}/u);
  assert.match(source, /ListFooterComponent=\{footer\}/u);
  assert.match(source, /const keyExtractor = useCallback\(\(card: WordCard\) => card\.id, \[\]\);/u);
  assert.match(source, /const renderVirtualizedRow = useCallback\(/u);
  // Stable renderItem means the list needs telling when a row's appearance changed —
  // without this, flip and selection updates would never reach the rows.
  assert.match(source, /extraData=\{renderWordCard\}/u);
  // Row identity comes from the card id, so reordering never remounts a row.
  assert.doesNotMatch(source, /keyExtractor=\{\(.*index/u);
});

test('the scroll indicator is fed by the native driver, not by JS state', () => {
  const reorderable = read('src/components/ReorderableList.tsx');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');
  const scrollBar = read('src/components/ScrollBar.tsx');

  // Animated.FlatList is required for a native-driven onScroll to attach while the list
  // still virtualizes; a plain FlatList would force the event back onto the JS thread.
  assert.match(reorderable, /Animated\.createAnimatedComponent\(\s*FlatList,\s*\)/u);
  assert.match(reorderable, /useNativeDriver: true,\s*listener:/u);
  assert.match(reorderable, /onScroll=\{handleVirtualizedScroll\}/u);
  assert.match(reorderable, /contentOffset: \{ y: scrollAnim \?\? new Animated\.Value\(0\) \}/u);

  // The screen hands its scrollbar value straight to the list and no longer pushes
  // offsets from JS, which stuttered whenever row rendering blocked the thread.
  assert.match(wordList, /scrollAnim=\{listScrollAnim\}/u);
  assert.doesNotMatch(wordList, /listScrollAnim\.setValue/u);
  assert.match(scrollBar, /scrollAnim\.interpolate\(/u);
});

test('long lists keep fewer rows mounted while short lists render as before', () => {
  const source = read('src/components/ReorderableList.tsx');
  // Unchanged first paint: short lists still render in full on the initial pass.
  assert.match(source, /initialNumToRender=\{12\}/u);
  const windowSize = Number(/windowSize=\{(\d+)\}/u.exec(source)[1]);
  const batch = Number(/maxToRenderPerBatch=\{(\d+)\}/u.exec(source)[1]);
  assert.ok(windowSize < 9, `windowSize ${windowSize} must be tighter than the old 9`);
  assert.ok(batch < 10, `maxToRenderPerBatch ${batch} must be smaller than the old 10`);
  assert.match(source, /updateCellsBatchingPeriod=\{50\}/u);
  // Clipping subviews is an Android-only win; iOS shows blank cells with it.
  assert.match(source, /removeClippedSubviews=\{Platform\.OS === 'android'\}/u);
});

test('the position reports the top visible word by stable ID', () => {
  const reorderable = read('src/components/ReorderableList.tsx');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');

  // Viewability, not offset arithmetic: rows vary in height, so the only reliable visible
  // range comes from the list itself.
  assert.match(reorderable, /onViewableItemsChanged=\{handleViewableItemsChanged\}/u);
  assert.match(reorderable, /viewabilityConfig=\{viewabilityConfig\}/u);
  // The lowest visible index wins and its stable item ID is sent with the index.
  assert.match(reorderable, /if \(firstIndex === null \|\| token\.index < firstIndex\)/u);
  assert.match(reorderable, /firstCardId = \(token\.item as WordCard\)\.id;/u);
  assert.match(reorderable, /onTopVisibleCardChangeRef\.current\?\.\(firstCardId, firstIndex\)/u);
  // A sliver counts as the actual top card…
  const threshold = Number(/itemVisiblePercentThreshold: (\d+)/u.exec(reorderable)[1]);
  assert.ok(threshold <= 5, `threshold ${threshold} must let a partial row count`);
  // …but not 0, which reports rendered-but-offscreen rows because `percent >= 0` always
  // holds, putting the position ahead of what is on screen.
  assert.ok(threshold > 0, 'threshold 0 would count rows with nothing on screen');
  // VirtualizedList throws if either identity changes, so both are built once.
  assert.match(reorderable, /const viewabilityConfig = useRef\(\{/u);
  assert.match(reorderable, /const handleViewableItemsChanged = useRef\(/u);

  // The screen forwards it imperatively, so a new index does not re-render the screen.
  assert.match(wordList, /positionLabelRef\.current\?\.setCurrentVisibleIndex\(index \+ 1\)/u);
  assert.match(wordList, /onTopVisibleCardChange=\{handleTopVisibleCardChange\}/u);
  assert.match(wordList, /total=\{filteredFolderCards\.length\}/u);
});

test('the default count shows visible over all existing cards in List and Flip', () => {
  const label = read('src/components/WordListPositionLabel.tsx');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');

  // "At top" remains an explicit signal so the existing word-count summary is preserved.
  assert.match(label, /const showPosition = \(showCurrentPosition \|\| !state\.atTop\) && total > 0;/u);
  assert.match(label, /\{showPosition \? `\$\{position\} \/ \$\{total\}` : topContent\}/u);
  assert.match(wordList, /const atTop = offset <= LIST_TOP_EPSILON;/u);
  assert.match(wordList, /const LIST_TOP_EPSILON = \d+;/u);
  // Only crossings reach the label, so a per-frame scroll listener costs no re-renders.
  assert.match(
    wordList,
    /if \(atTop !== atTopRef\.current\) \{\s*atTopRef\.current = atTop;\s*positionLabelRef\.current\?\.setAtTop\(atTop\);/u,
  );
  // Clamped, because a delete or a filter can shrink the list under a scrolled position.
  assert.match(label, /Math\.min\(Math\.max\(currentIndex \?\? state\.index, 1\), Math\.max\(total, 1\)\)/u);
  // Own state, set through a ref, and each setter no-ops on an unchanged value: viewability
  // repeats the same top row while scrolling within it.
  assert.match(label, /setCurrentVisibleIndex: \(index: number\) => setState\(\s*prev => prev\.index === index \? prev :/u);
  assert.match(label, /setAtTop: \(atTop: boolean\) => setState\(\s*prev => prev\.atTop === atTop \? prev :/u);

  // It replaces the old header Text in place, keeping that line's styling.
  assert.match(
    wordList,
    /<WordListPositionLabel\s*ref=\{positionLabelRef\}\s*total=\{filteredFolderCards\.length\}\s*topContent=\{wordCountSummary\}\s*currentIndex=\{resolvedCurrentWordIndex \+ 1\}\s*showCurrentPosition=\{cardViewMode === 'flip' && isFilterActive\}\s*style=\{\[s\.wordCount, \{ color: pal\.sub \}\]\}/u,
  );
  assert.match(
    wordList,
    /const wordCountSummary = `\$\{filteredFolderCards\.length\} \/ \$\{allFolderCards\.length\} \$\{[\s\S]*?allFolderCards\.length === 1/u,
  );
  assert.doesNotMatch(wordList, /isFilterActive\s*\? `\$\{filteredFolderCards\.length\} \/ \$\{allFolderCards\.length\}`\s*:\s*folderCards\.length/u);
});

test('no floating indicator and no per-card numbering were added', () => {
  const scrollBar = read('src/components/ScrollBar.tsx');
  const wordList = read('src/screens/WordListScreen/WordListScreen.tsx');

  // The header label is the only position readout: ScrollBar draws just its thumb again.
  assert.doesNotMatch(scrollBar, /bubble|SCROLL_INDICATOR_HEIGHT/u);
  assert.doesNotMatch(wordList, /ScrollPositionIndicator/u);
  assert.ok(
    !fs.existsSync('src/components/ScrollPositionIndicator.tsx'),
    'the floating indicator component should be gone',
  );
  // Cards carry no numbering of their own.
  assert.doesNotMatch(read('src/components/SwipeableCard.tsx'), /index \+ 1|cardNumber|positionLabel/u);
});

test('per-render passes over the folder are collapsed into one', () => {
  const source = read('src/screens/WordListScreen/WordListScreen.tsx');
  // One helper pass over the complete folder yields every chip count.
  assert.match(source, /const levelCounts = useMemo\(\(\) => countCardsByResult\(allFolderCards\), \[allFolderCards\]\);/u);
  assert.match(source, /const count = levelCounts\[level\];/u);
  assert.match(source, /const untestedCount = levelCounts\.none;/u);
  assert.match(source, /const allVisibleCardsSelected = useMemo\(/u);
  // No stray per-render scans of the folder left in the render path.
  assert.doesNotMatch(source, /folderCards\.filter\(/u);
});
