const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const APP = 'App.tsx';
const MODALS = 'src/app/AppModals.tsx';
const SCREEN = 'src/components/TestModeScreen.tsx';
const WORD_LIST = 'src/screens/WordListScreen/WordListScreen.tsx';

/** Everything from the exported component down — the InfoPopup above it is a
 *  popup by design and keeps its own Modal. */
function testModeBody(source) {
  return source.slice(source.indexOf('export function TestModeScreen'));
}

/** The word-list screen's own JSX, without the prop types or the styles. */
function wordListRender(source) {
  return source.slice(
    source.lastIndexOf('  return (\n    <>'),
    source.indexOf('// ── Styles'),
  );
}

// ── 1. The Test button switches a mode; it presents nothing ──────────────────

test('tapping Test opens no sheet and no modal', () => {
  const screen = read(SCREEN);
  const body = testModeBody(screen);

  // No presentation of any kind: not a Modal, not the shared full-screen sheet,
  // and no sheet animation left behind.
  assert.doesNotMatch(body, /<Modal/u, 'Test Mode must not present itself');
  assert.doesNotMatch(body, /presentationStyle|animationType|onRequestClose|onShow=/u);
  assert.doesNotMatch(screen, /FullScreenSheet/u);
  // The one remaining Modal in the file is the information popup, unchanged.
  assert.equal((screen.match(/<Modal/gu) ?? []).length, 1);
  assert.match(
    screen.slice(screen.indexOf('function InfoPopup'), screen.indexOf('const is = StyleSheet.create')),
    /<Modal[\s\S]*transparent/u,
  );

  // It is a plain View that fills the card area it is given.
  assert.match(body, /return \(\s*<View style=\{s\.root\}>/u);
  assert.match(screen, /root: \{ flex: 1 \},/u);

  // Nothing renders it from the modal host any more, and the host no longer
  // carries a `testMode` prop for something that is not a modal.
  const modals = read(MODALS);
  assert.doesNotMatch(modals, /TestModeScreen/u, 'the modal host must not own Test Mode');
  assert.doesNotMatch(modals, /testMode\./u);

  // The same control enters and leaves the mode, exactly like List and Flip.
  assert.match(read(APP), /onOpenTestMode: \(\) => setTestModeVisible\(open => !open\),/u);
});

// ── 2. It renders below the colour filter / Test icon row ────────────────────

test('Test Mode renders below the colour-filter and Test-icon section', () => {
  const wordList = read(WORD_LIST);
  const render = wordListRender(wordList);

  // The order on screen: header, word count, the filter row that carries the
  // Test button, and only then the card area Test Mode occupies.
  const filterAt = render.indexOf('{filterBar}');
  const stackAt = render.indexOf('<View style={cardAreaStyles.stack}>');
  const contentAt = render.indexOf('{testMode.content}');
  assert.ok(filterAt > -1 && stackAt > filterAt, 'the filter row stays above the card area');
  assert.ok(contentAt > stackAt, 'the test content is inside the card area');

  // The row above is untouched by the mode: nothing hides it while a test runs.
  const bar = wordList.slice(
    wordList.indexOf('const filterBar ='),
    wordList.indexOf('// ── Card list content'),
  );
  assert.match(bar, /onPress=\{handleOpenTestMode\}/u);
  // The row reads the mode to announce the Test button's state and to make the
  // chips inert — never to hide itself, so the colour filter and the Test icon
  // stay on screen throughout, counts and all.
  assert.doesNotMatch(bar, /showTestLayer/u);
  assert.doesNotMatch(bar, /testMode\.active &&|!testMode\.active \?/u);
  assert.equal((bar.match(/testMode\.active/gu) ?? []).length, 3);
  assert.match(bar, /accessibilityState=\{\{ selected: testMode\.active \}\}/u);
  assert.match(bar, /disabled=\{testMode\.active\}/u);
  assert.match(bar, /accessibilityState=\{\{ selected: on, disabled: testMode\.active \}\}/u);

  // Only the card area changes hands.
  assert.match(render, /\{cardContent\}/u);
  assert.match(render, /\{testMode\.content\}/u);
});

// ── 3. The existing test UI is reused from the progress bar down ─────────────

test('the existing UI from the progress bar downward is reused unchanged', () => {
  const screen = read(SCREEN);
  const body = testModeBody(screen);

  // The first thing the content draws is the existing progress bar.
  assert.match(
    body,
    /<View style=\{s\.root\}>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?\{active && \(\s*<View style=\{\[s\.progressTrack/u,
  );
  assert.match(body, /<View style=\{\[s\.progressFill, \{ backgroundColor: themeColor, width: `\$\{\(idx \/ total\) \* 100\}%` \}\]\} \/>/u);

  // Everything below it is the same code as before — no second card, no second
  // set of answer buttons, no reimplemented grading or completion screen.
  assert.match(body, /<CardScrollFace/u);
  assert.match(body, /ANSWERS\.map\(\(\{ kind, labelKey, descKey, icon, color \}\) => \(/u);
  assert.match(body, /onPress=\{\(\) => advance\(kind\)\}/u);
  assert.match(body, /pointerEvents=\{backPlayed \? 'auto' : 'none'\}/u);
  assert.match(body, /const outcome = gradeCard\(card, kind, \{/u);
  assert.equal((screen.match(/const ANSWERS: Answer\[\]/gu) ?? []).length, 1);
  assert.equal((screen.match(/s\.answerBtn,/gu) ?? []).length, 1);
  assert.equal((screen.match(/s\.progressTrack/gu) ?? []).length, 1);

  // The sheet header above the progress bar is gone, with its close button and
  // its style, and nothing replaced it.
  assert.doesNotMatch(body, /s\.header|s\.progressText/u);
  assert.doesNotMatch(screen, /header: \{|progressText: \{/u);
  assert.doesNotMatch(body, /name="close"/u);

  // So is the chrome that only existed because it was a full-screen sheet: the
  // screen it now sits in draws the ad banner and owns the safe-area insets.
  assert.doesNotMatch(screen, /AD_BANNER_HEIGHT|ADS_ENABLED|Advertisement/u);
  assert.doesNotMatch(body, /insets\.(?:top|bottom)/u);
  assert.doesNotMatch(screen, /isSubscribed/u, 'the ad was its only use for the plan');

  // The duplicate custom-voice banner went with it; there is one, in App.tsx.
  assert.doesNotMatch(screen, /voiceBanner|PanResponder/u);
  assert.match(read(APP), /onCustomVoiceLocked=\{showVoiceLockBanner\}/u);
});

// ── 4. Info sits immediately to the right of Mute ────────────────────────────

test('the Info button is immediately to the right of Mute, and both stay usable', () => {
  const screen = read(SCREEN);
  const toolbar = screen.slice(
    screen.indexOf('<View style={s.toolbar}>'),
    screen.indexOf('{/* Word card */}'),
  );

  // Same row, and nothing between them.
  const muteAt = toolbar.indexOf('onPress={handleMuteToggle}');
  const infoAt = toolbar.indexOf('onPress={() => setInfoVisible(true)}');
  assert.ok(muteAt > -1, 'Mute is in the toolbar');
  assert.ok(infoAt > muteAt, 'Info follows Mute');
  const muteEndsAt = toolbar.indexOf('</TouchableOpacity>', muteAt);
  const infoOpensAt = toolbar.lastIndexOf('<TouchableOpacity', infoAt);
  const between = toolbar.slice(muteEndsAt, infoOpensAt);
  assert.doesNotMatch(between, /<TouchableOpacity|<Text|<Ionicons/u, 'nothing sits between them');

  // Info is the last control in the row, so Mute is the one directly to its left.
  assert.equal(toolbar.lastIndexOf('onPress='), infoAt);

  // Both are real, labelled buttons — the Info action and its popup are the
  // same ones the sheet header used to open.
  assert.match(
    toolbar,
    /onPress=\{\(\) => setInfoVisible\(true\)\}[\s\S]{0,180}accessibilityRole="button"[\s\S]{0,100}accessibilityLabel=\{t\('test_info_title'\)\}/u,
  );
  assert.match(toolbar, /name="information-circle-outline"/u);
  assert.match(screen, /<InfoPopup\s*visible=\{infoVisible\}/u);
  assert.equal((screen.match(/setInfoVisible\(true\)/gu) ?? []).length, 1);

  // Mute keeps its stored preference and its stop-what-is-playing behaviour.
  assert.match(screen, /AsyncStorage\.setItem\(TEST_MUTED_KEY, next \? 'true' : 'false'\)/u);
  assert.match(screen, /const handleMuteToggle = \(\) => \{\s*\/\/[^\n]*\n\s*if \(!muted\) stopVoice\(\);/u);

  // The toolbar carrying both is drawn for the whole test, not only after a flip.
  const cardArea = screen.slice(screen.indexOf('/* ── Card area'), screen.indexOf('{/* Answer buttons'));
  assert.match(cardArea, /\{\/\* Toolbar: always visible above the card during the test \*\/\}/u);
});

// ── 5. The session survives ordinary re-renders ──────────────────────────────

test('an unrelated re-render, filter change or card update cannot restart the test', () => {
  const screen = read(SCREEN);

  // The queue is taken once, in a state initialiser, so a new `cards` array
  // never rebuilds it. Grading writes through the callbacks instead.
  assert.match(
    screen,
    /const \[queue, setQueue\] = useState<WordCard\[\]>\(\(\) => \{\s*const now = appNow\(\);/u,
  );
  assert.doesNotMatch(screen, /useEffect\([\s\S]{0,200}setQueue\(/u, 'no effect may re-seed the queue');
  // The only two re-seeding paths are the ones the user asks for.
  assert.match(screen, /const handleShuffle = \(\) => restart\(shuffle\(\[\.\.\.queue\]\)\);/u);
  assert.match(screen, /restart\(resetQueue\);/u);
  assert.equal((screen.match(/restart\(/gu) ?? []).length, 2);

  // Progress, answers and results are component state, and the component is
  // mounted for as long as the mode is active — never remounted by a re-render.
  const wordList = read(WORD_LIST);
  assert.match(wordList, /\{testMode\.active \? \(/u);
  assert.match(read(APP), /const testModeContent = testModeVisible \? \(/u);
  // Nothing keys or conditionally swaps it on data that changes mid-session.
  assert.doesNotMatch(wordList, /\{testMode\.content\}[\s\S]{0,40}key=/u);

  // Selection and reorder take the card area without unmounting the session.
  assert.match(
    wordList,
    /const showTestLayer = testMode\.active && !selection\.active && !reorder\.active;/u,
  );
  const render = wordListRender(wordList);
  const testLayer = render.slice(render.indexOf('{testMode.active ? ('));
  assert.match(testLayer, /showTestLayer \? cardAreaStyles\.visible : cardAreaStyles\.hidden/u);
  assert.doesNotMatch(testLayer, /showTestLayer && /u, 'visibility only — never unmounting');
});

// ── 6. Completion and the empty state render inline ──────────────────────────

test('completion and empty states render inline, and never as "No words yet"', () => {
  const screen = read(SCREEN);
  const body = testModeBody(screen);

  // One block covers both, exactly as before: trophy for a finished test,
  // check-mark for a queue that was empty to begin with.
  assert.match(body, /\{done \? \(/u);
  assert.match(body, /name=\{total === 0 \? 'checkmark-done-outline' : 'trophy-outline'\}/u);
  assert.match(body, /\{t\(total === 0 \? 'test_empty_title' : 'test_complete_title'\)\}/u);
  assert.match(body, /\{t\(total === 0 \? 'test_empty_hint' : 'test_complete_hint'\)\}/u);
  // Reset is offered on the empty state, so a folder whose words are all hidden
  // has a way forward without leaving the mode.
  assert.match(body, /\{total === 0 && \(\s*<TouchableOpacity[\s\S]{0,200}onPress=\{handleReset\}/u);
  // It is drawn in the same area as the card it replaces — nothing is presented.
  assert.doesNotMatch(body, /<Modal[\s\S]*s\.center/u);

  // The word list's own empty state is behind the hidden layer while a test is
  // running, so finishing one cannot reveal "No words yet" underneath it.
  const wordList = read(WORD_LIST);
  const render = wordListRender(wordList);
  const listLayer = render.slice(render.indexOf('<View style={cardAreaStyles.stack}>'), render.indexOf('{testMode.active ? ('));
  assert.match(listLayer, /showTestLayer \? cardAreaStyles\.hidden : cardAreaStyles\.visible/u);
  assert.match(listLayer, /pointerEvents=\{showTestLayer \? 'none' : 'auto'\}/u);
  assert.match(listLayer, /importantForAccessibility=\{showTestLayer \? 'no-hide-descendants' : 'auto'\}/u);
  assert.match(wordList, /no_words_title/u);
  // Both layers are always mounted, so the swap happens in a single frame and
  // neither the list nor an empty state can flash during the transition.
  assert.match(render, /\{cardContent\}/u);
});

// ── 7. Exiting returns to the mode the user was on ───────────────────────────

test('leaving Test Mode restores the List or Flip view it covered', () => {
  const wordList = read(WORD_LIST);
  const app = read(APP);

  // Test Mode never touches the List/Flip selection, so leaving simply reveals
  // whichever one was underneath.
  assert.doesNotMatch(read(SCREEN), /cardViewMode|onChangeViewMode/u);
  const render = wordListRender(wordList);
  assert.doesNotMatch(render, /testMode[\s\S]{0,80}setCardViewMode|cardViewMode = /u);

  // Both mode layers stay mounted underneath, so their scroll position and the
  // centred flip card are still there when the test layer goes away.
  assert.match(wordList, /const \{ showListLayer, showFlipLayer \} = layerVisibility;/u);
  assert.match(wordList, /showListLayer \? modeLayerStyles\.visible : modeLayerStyles\.hidden/u);
  assert.match(wordList, /showFlipLayer \? modeLayerStyles\.visible : modeLayerStyles\.hidden/u);
  // Flip is told to stand down while the test covers it, and only while it does.
  assert.match(wordList, /active=\{showFlipLayer && !reorder\.active && !showTestLayer\}/u);

  // Two ways out, both of which only clear the flag: the Test button again, and
  // Close on the completion screen.
  assert.match(app, /onOpenTestMode: \(\) => setTestModeVisible\(open => !open\),/u);
  assert.match(app, /onClose=\{\(\) => setTestModeVisible\(false\)\}/u);
  assert.match(
    read(SCREEN),
    /<TouchableOpacity style=\{\[s\.primaryBtn, \{ backgroundColor: themeColor \}\]\} onPress=\{onClose\}>/u,
  );

  // Leaving the folder ends the session rather than carrying its queue over to
  // a different folder's words.
  assert.match(app, /const goBackToFolders = \(\) => \{[\s\S]{0,200}setTestModeVisible\(false\);/u);
  assert.match(app, /const openFolder = \(id: string\) => \{[\s\S]{0,400}setTestModeVisible\(false\);/u);
});

// ── 8. The header says only which mode is running ────────────────────────────

/**
 * The word-list header: the shared folder contents and every mode branch that
 * chooses between them, up to the word-count section.
 */
function headerJsx(source) {
  return source.slice(
    source.indexOf('  const folderHeaderContent = ('),
    source.indexOf('// ── Word count / scroll position'),
  );
}

test('a running test replaces the header with a centred TEST title', () => {
  const wordList = read(WORD_LIST);
  const header = headerJsx(wordList);

  // Its own branch, after selection and reorder — both of those own the whole
  // card area when they run, so Test Mode steps aside for them there too.
  const testAt = header.indexOf(') : testMode.active ? (');
  const selectionAt = header.indexOf('{selection.active ? (');
  const reorderAt = header.indexOf(') : reorder.active ? (');
  assert.ok(testAt > reorderAt && reorderAt > selectionAt, 'the test branch comes last');

  assert.match(
    header,
    /<Text\s*style=\{\[testHeaderStyles\.title, \{ color: pal\.text \}\]\}\s*accessibilityRole="header"\s*>\s*TEST\s*<\/Text>/u,
  );

  // Centred by stretching the one remaining child across the row.
  assert.match(
    wordList,
    /title: \{\s*flex: 1,\s*textAlign: 'center',[\s\S]{0,160}letterSpacing: 2,/u,
  );
  // No absolute overlay and no spacer: the row's own fixed height is what holds
  // the layout, so the badge needs neither.
  assert.doesNotMatch(wordList, /testHeaderStyles\.(titleWrap|spacer)|titleWrap:|spacer:/u);
});

test('the header carries nothing but the title while a test runs', () => {
  const header = headerJsx(read(WORD_LIST));
  const testBranch = header.slice(
    header.indexOf(') : testMode.active ? ('),
    header.lastIndexOf('      ) : ('),
  );

  // No folder name, no back chevron, no notification toggle, no menu — and no
  // control of any kind, so the Test button in the row below is the way out.
  assert.doesNotMatch(testBranch, /currentFolder/u);
  assert.doesNotMatch(testBranch, /chevron-back|onGoBack/u);
  assert.doesNotMatch(testBranch, /notifications|notificationsEnabled/u);
  assert.doesNotMatch(testBranch, /ellipsis-vertical|onOpenMenu|menuBtnRef/u);
  assert.doesNotMatch(testBranch, /onOpenNotifications|onOpenTextToSpeech/u);
  assert.doesNotMatch(testBranch, /s\.headerIcons|TouchableOpacity|folderHeaderContent/u);

  // The ordinary header still has every one of them — this hides them for one
  // mode, it does not delete them, and every other mode still renders them.
  assert.match(header, /\{currentFolder\?\.name \?\? ''\}/u);
  assert.match(header, /onPress=\{actions\.onGoBack\}/u);
  assert.match(header, /onPress=\{actions\.onOpenNotifications\}/u);
  assert.match(header, /onPress=\{actions\.onOpenMenu\}/u);
  assert.match(header, /\) : \(\s*folderHeaderContent\s*\)\}/u);
});

test('the word count reads the same in a test as out of one', () => {
  const wordList = read(WORD_LIST);
  const count = wordList.slice(
    wordList.indexOf('  const wordCount = ('),
    wordList.indexOf('// ── Level filter bar'),
  );

  // Not hidden, not blanked, not unmounted: the mode is not part of this line
  // in any form, so it says the same thing throughout.
  assert.doesNotMatch(count, /testMode/u);
  assert.match(count, /const wordCount = \(\s*<View onTouchStart=\{\(\) => closeOpenCard\.current\?\.\(\)\}>/u);
  assert.doesNotMatch(wordList, /blankedLine/u);

  // The label therefore keeps its own scroll state across a test, so there is
  // nothing to restore on the way out.
  assert.doesNotMatch(wordList, /if \(testMode\.active\) return;\s*const atTop =/u);
});

test('entering a test moves nothing on the screen', () => {
  const wordList = read(WORD_LIST);

  // Three rows sit above the card area, and a test may not shift any of them.
  // The header is a fixed height whatever it contains, and neither the word
  // count nor the filter row's own condition mentions the mode at all.
  assert.match(wordList, /header: \{ height: 50 \}/u);
  assert.match(wordList, /style=\{\[s\.header, wordListLayoutStyles\.header\]\}/u);
  assert.match(wordList, /bar: \{\s*height: 50,/u);
  assert.match(
    wordList,
    /const filterBar = allFolderCards\.length > 0 && !selection\.active && \(showLevelLabels \|\| reorder\.active\) \?/u,
  );

  // And the card area itself is a stack of absolutely positioned layers, so
  // Test Mode replaces what is drawn without resizing anything.
  assert.match(wordList, /layer: \{ \.\.\.StyleSheet\.absoluteFillObject \}/u);
});

test('entering a test from a filtered list clears the filter and returns to the top', () => {
  const wordList = read(WORD_LIST);

  assert.match(
    wordList,
    /const handleOpenTestMode = useCallback\(\(\) => \{\s*if \(!testMode\.active && activeResultFilter !== null\) \{\s*onToggleResultFilter\(activeResultFilter\);\s*listScrollToOffsetRef\.current\?\.\(0\);[\s\S]{0,180}handleListScroll\(0\);\s*\}\s*actionsRef\.current\.onOpenTestMode\(\);/u,
  );
  // Only on the way in. The same button leaves a test, and leaving restores
  // nothing the user did not ask to have changed.
  assert.match(wordList, /if \(!testMode\.active && activeResultFilter !== null\)/u);
  // Toggling the category that is already active is the existing clear — no
  // second way to reach the unfiltered state was introduced.
  assert.match(wordList, /onToggleResultFilter\(activeResultFilter\);/u);
});

// ── Safe area, scrolling and accessibility ───────────────────────────────────

test('the inline mode keeps the screen safe-area, scrolling and accessibility', () => {
  const screen = read(SCREEN);

  // The enclosing SafeAreaView owns the insets; the content adds none of its own.
  assert.match(read(APP), /<SafeAreaView style=\{\[s\.root, \{ backgroundColor: pal\.bg \}\]\}>/u);
  assert.doesNotMatch(testModeBody(screen), /useSafeAreaInsets/u);
  // The popup still centres itself within the real insets.
  assert.match(screen, /marginTop: insets\.top \+ 16,/u);

  // Long meanings and notes still scroll inside the card face.
  assert.match(screen, /import \{ CardScrollFace \} from '\.\/CardScrollFace';/u);
  assert.match(read('src/components/CardScrollFace.tsx'), /ScrollView/u);

  // The layer that is not on screen is inert for touch and for assistive tech,
  // in both directions.
  const render = wordListRender(read(WORD_LIST));
  assert.equal((render.match(/accessibilityElementsHidden=/gu) ?? []).length, 2);
  assert.equal((render.match(/importantForAccessibility=/gu) ?? []).length, 2);
  assert.match(render, /accessibilityElementsHidden=\{showTestLayer\}/u);
  assert.match(render, /accessibilityElementsHidden=\{!showTestLayer\}/u);

  // The add button is withheld while a test runs, rather than left floating
  // over the answer buttons.
  assert.match(
    read(WORD_LIST),
    /const fab = !selection\.active && !reorder\.active && !showTestLayer \?/u,
  );

  // The Test button announces itself as the toggle it is.
  const bar = read(WORD_LIST).slice(
    read(WORD_LIST).indexOf('const filterBar ='),
    read(WORD_LIST).indexOf('// ── Card list content'),
  );
  assert.match(bar, /accessibilityState=\{\{ selected: testMode\.active \}\}/u);
});
