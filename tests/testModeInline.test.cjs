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

  // The same Test icon still toggles the mode, without presenting a sheet.
  const app = read(APP);
  assert.match(app, /onOpenTestMode: toggleTestMode,/u);
  assert.match(
    app,
    /const toggleTestMode = useCallback\(\(\) => \{\s*setTestModeAnalyticsVisible\(false\);\s*setTestModeVisible\(open => !open\);/u,
  );
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
  assert.equal((bar.match(/testMode\.active/gu) ?? []).length, 4);
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

// ── 4. Analytics replaces Reset in the active-card toolbar ─────────────────

test('Analytics replaces the card-toolbar Reset button and sits immediately before Shuffle', () => {
  const screen = read(SCREEN);
  const wordList = read(WORD_LIST);
  const filterBar = wordList.slice(
    wordList.indexOf('const filterBar ='),
    wordList.indexOf('// ── Card list content'),
  );
  assert.doesNotMatch(filterBar, /study_analytics_title|stats-chart-outline|onOpenAnalytics/u);

  const toolbar = screen.slice(
    screen.indexOf('<View style={s.toolbar}>'),
    screen.indexOf('{/* Word card */}'),
  );
  const analyticsAt = toolbar.indexOf('onPress={onOpenAnalytics}');
  const shuffleAt = toolbar.indexOf('onPress={handleShuffle}');
  assert.ok(analyticsAt > -1 && analyticsAt < shuffleAt, 'Analytics immediately precedes Shuffle');
  const analyticsStart = toolbar.lastIndexOf('<TouchableOpacity', analyticsAt);
  const analyticsEnd = toolbar.indexOf('</TouchableOpacity>', analyticsAt);
  const analyticsButton = toolbar.slice(analyticsStart, analyticsEnd);
  assert.match(analyticsButton, /style=\{\[s\.toolBtn, \{ backgroundColor: pal\.card, borderColor: pal\.border \}\]\}/u);
  assert.match(analyticsButton, /name="stats-chart-outline" size=\{15\} color=\{pal\.text\}/u);
  assert.match(analyticsButton, /accessibilityLabel=\{t\('study_analytics_title'\)\}/u);
  assert.match(analyticsButton, /<Text style=\{\[s\.toolBtnText, \{ color: pal\.text \}\]\}>\{t\('study_analytics_title'\)\}<\/Text>/u);
  assert.match(read('src/i18n.ts'), /study_analytics_title:\s*'Analytics',/u);
  const between = toolbar.slice(analyticsEnd + '</TouchableOpacity>'.length, toolbar.lastIndexOf('<TouchableOpacity', shuffleAt));
  assert.doesNotMatch(between, /<TouchableOpacity|<Text|<Ionicons/u, 'nothing sits between Analytics and Shuffle');

  // Reset remains available only on the completion screen.
  assert.doesNotMatch(toolbar, /handleReset|test_reset|refresh-outline/u);
  const muteAt = toolbar.indexOf('onPress={handleMuteToggle}');
  const infoAt = toolbar.indexOf('onPress={() => setInfoVisible(true)}');
  assert.ok(shuffleAt < muteAt && muteAt < infoAt, 'Shuffle, Mute and Info retain their order');
  assert.equal(toolbar.lastIndexOf('onPress='), infoAt);

  // Mute is icon-only while retaining its active colours, behaviour and a
  // generous accessible tap area.
  const muteStart = toolbar.lastIndexOf('<TouchableOpacity', muteAt);
  const muteEnd = toolbar.indexOf('</TouchableOpacity>', muteAt);
  const muteButton = toolbar.slice(muteStart, muteEnd);
  assert.match(muteButton, /name="volume-mute-outline"\s*size=\{15\}\s*color=\{muted \? themeColor : pal\.text\}/u);
  assert.match(muteButton, /hitSlop=\{\{ top: 12, bottom: 12, left: 12, right: 12 \}\}/u);
  assert.match(muteButton, /accessibilityRole="button"/u);
  assert.match(muteButton, /accessibilityLabel=\{t\('test_mute'\)\}/u);
  assert.doesNotMatch(muteButton, /<Text|\{t\('test_mute'\)\}<\/Text>/u);

  // Info is back in its original position and original icon-only pill design,
  // immediately after Mute in the active-card toolbar.
  const infoStart = toolbar.lastIndexOf('<TouchableOpacity', infoAt);
  const infoEnd = toolbar.indexOf('</TouchableOpacity>', infoAt);
  const infoButton = toolbar.slice(infoStart, infoEnd);
  assert.match(infoButton, /hitSlop=\{\{ top: 12, bottom: 12, left: 12, right: 12 \}\}/u);
  assert.match(infoButton, /accessibilityRole="button"/u);
  assert.match(infoButton, /accessibilityLabel=\{t\('test_info_title'\)\}/u);
  assert.match(infoButton, /style=\{\[s\.toolBtn, s\.toolIconBtn, \{ backgroundColor: pal\.card, borderColor: pal\.border \}\]\}/u);
  assert.match(infoButton, /name="information-circle-outline" size=\{18\} color=\{pal\.sub\}/u);
  assert.doesNotMatch(filterBar, /test_info_title|information-circle-outline|onOpenInfo/u);
  assert.match(screen, /<InfoPopup\s*visible=\{infoVisible\}/u);
  assert.match(screen, /onClose=\{\(\) => setInfoVisible\(false\)\}/u);

  // Mute keeps its stored preference and its stop-what-is-playing behaviour.
  assert.match(screen, /AsyncStorage\.setItem\(TEST_MUTED_KEY, next \? 'true' : 'false'\)/u);
  assert.match(screen, /const handleMuteToggle = \(\) => \{\s*\/\/[^\n]*\n\s*if \(!muted\) stopVoice\(\);/u);

  // The toolbar is drawn for the whole test, not only after a flip.
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

test('finishing the last card shows analytics with the final answer included', () => {
  const screen = read(SCREEN);
  const body = testModeBody(screen);

  assert.match(screen, /const showAnalytics = done \|\| analyticsOpen;/u);
  assert.match(body, /\{showAnalytics \? \(/u);
  assert.match(body, /name="checkmark" size=\{34\} color=\{themeColor\}/u);
  assert.match(body, /t\('study_test_complete_title'\)/u);
  assert.match(body, /t\('study_test_complete_subtitle'\)/u);
  const i18n = read('src/i18n.ts');
  assert.match(i18n, /study_test_complete_title:\s*'Test complete!',/u);
  assert.match(i18n, /study_test_complete_subtitle:\s*'You’ve reviewed all available words\.',/u);
  assert.match(body, /<StudyAnalytics log=\{sessionStudyLog\}/u);
  // Both the durable parent tally and the immediately displayed local tally are
  // updated before the animation can advance `idx` into the completed state.
  const answer = screen.slice(screen.indexOf('const advance = useCallback'), screen.indexOf('// ── Layout'));
  const localRecordAt = answer.indexOf('setSessionStudyLog(log => recordAnswer(log, answeredAt))');
  const durableRecordAt = answer.indexOf('onAnswerRecorded?.(answeredAt)');
  const completionAt = answer.indexOf('setIdx(i => i + 1)');
  assert.ok(localRecordAt > -1 && localRecordAt < completionAt);
  assert.ok(durableRecordAt > -1 && durableRecordAt < completionAt);
  // There is one direct branch from the card to analytics, with no empty card
  // or another completion state in between.
  assert.doesNotMatch(body, /finished \?/u);
  assert.doesNotMatch(body, /study_nothing_to_review|Nothing to review|trophy-outline/u);
});

test('an exhausted queue shows completion first, then progress, with no Close action', () => {
  const screen = read(SCREEN);
  const body = testModeBody(screen);
  const wordList = read(WORD_LIST);

  assert.match(screen, /const showAnalytics = done \|\| analyticsOpen;/u);
  assert.match(
    body,
    /<StudyAnalytics log=\{sessionStudyLog\} now=\{Date\.now\(\)\} pal=\{pal\} themeColor=\{themeColor\} \/>/u,
  );
  const analyticsBranch = body.slice(body.indexOf('{showAnalytics ? ('), body.indexOf('/* ── Card area'));
  const completionAt = analyticsBranch.indexOf('style={s.completionSection}');
  const progressAt = analyticsBranch.indexOf('<StudyAnalytics');
  assert.ok(completionAt > -1 && completionAt < progressAt, 'completion leads the screen');
  assert.doesNotMatch(analyticsBranch, /t\('close'\)|name="close"/u);
  assert.match(body, /onPress=\{handleReset\}/u);
  // It is drawn in the same area as the card it replaces — nothing is presented.
  assert.doesNotMatch(body, /<Modal[\s\S]*s\.center/u);

  // Manually opened analytics stacks Back above the same compact Reset. The
  // completion-only Reset remains aligned to the far-left without changing its
  // design or behaviour.
  assert.match(body, /<View style=\{\[s\.analyticsActions, done && s\.completionActions\]\}>\s*\{!done && \([\s\S]{0,220}onPress=\{onCloseAnalytics\}[\s\S]*?<TouchableOpacity[\s\S]{0,180}onPress=\{handleReset\}/u);
  assert.match(screen, /primaryBtn: \{\s*width: '100%',\s*alignItems: 'center',\s*paddingVertical: 13,\s*borderRadius: 12,/u);
  assert.match(screen, /primaryBtnText: \{\s*color: '#fff',\s*fontSize: 15,\s*fontWeight: '700',\s*\}/u);
  assert.match(
    screen,
    /analyticsActions: \{\s*width: '100%',\s*marginTop: 48,\s*minHeight: 44,\s*alignItems: 'center',\s*gap: 14,/u,
  );
  assert.match(screen, /completionActions: \{\s*alignItems: 'flex-start',\s*\}/u);
  assert.match(
    screen,
    /secondaryBtn: \{\s*alignSelf: 'flex-start',\s*flexDirection: 'row',[\s\S]{0,180}paddingHorizontal: 10,\s*paddingVertical: 6,\s*borderRadius: 10,/u,
  );
  const resetStyle = screen.slice(screen.indexOf('  secondaryBtn: {'), screen.indexOf('  secondaryBtnText: {'));
  assert.match(resetStyle, /backgroundColor: 'transparent'/u);
  assert.doesNotMatch(resetStyle, /borderWidth|borderColor|shadow|elevation/u);
  assert.match(screen, /secondaryBtnText: \{\s*fontSize: 13,\s*fontWeight: '600',\s*\}/u);
  assert.match(body, /<Ionicons name="refresh-outline" size=\{14\} color=\{pal\.sub\} \/>/u);
  assert.match(body, /<Text style=\{\[s\.secondaryBtnText, \{ color: pal\.sub \}\]\}>\{t\('test_reset'\)\}<\/Text>/u);
  assert.match(body, /<TouchableOpacity\s*style=\{s\.secondaryBtn\}\s*onPress=\{handleReset\}/u);
  assert.match(body, /onPress=\{handleReset\}[\s\S]{0,100}hitSlop=\{\{ top: 8, bottom: 8, left: 8, right: 8 \}\}/u);
  assert.match(read('src/components/StudyAnalytics.tsx'), /summary: \{[\s\S]{0,180}marginBottom: 36,/u);

  // The Analytics and Info controls live only in the active-card branch, so the
  // completion branch cannot render either or reserve space for them.
  assert.doesNotMatch(analyticsBranch, /stats-chart-outline|study_analytics_title|onOpenAnalytics|information-circle-outline/u);

  // The word list stays behind the Test Mode layer after completion; analytics
  // is rendered in that layer, so another empty state cannot flash through.
  const render = wordListRender(wordList);
  const listLayer = render.slice(render.indexOf('<View style={cardAreaStyles.stack}>'), render.indexOf('{testMode.active ? ('));
  assert.match(listLayer, /showTestLayer \? cardAreaStyles\.hidden : cardAreaStyles\.visible/u);
  assert.match(listLayer, /pointerEvents=\{showTestLayer \? 'none' : 'auto'\}/u);
  assert.match(listLayer, /importantForAccessibility=\{showTestLayer \? 'no-hide-descendants' : 'auto'\}/u);
  assert.match(wordList, /no_words_title/u);
  assert.match(render, /\{cardContent\}/u);
});

test('closing manually opened analytics resumes the same test session', () => {
  const screen = read(SCREEN);
  const app = read(APP);
  const wordList = read(WORD_LIST);
  assert.match(screen, /analyticsOpen: boolean;/u);
  assert.match(screen, /onCloseAnalytics: \(\) => void;/u);
  assert.match(screen, /const showAnalytics = done \|\| analyticsOpen;/u);
  assert.match(screen, /onPress=\{onCloseAnalytics\}/u);
  assert.match(screen, /t\('study_back_to_test'\)/u);

  // Opening and closing change only the parent-owned presentation flag. The
  // mounted TestModeScreen retains queue, index, face and progress state.
  assert.match(screen, /onPress=\{onOpenAnalytics\}/u);
  const open = app.slice(
    app.indexOf('const openTestModeAnalytics'),
    app.indexOf('const closeTestModeAnalytics'),
  );
  const close = app.slice(
    app.indexOf('const closeTestModeAnalytics'),
    app.indexOf('const quitTestMode'),
  );
  assert.match(open, /setTestModeAnalyticsVisible\(true\)/u);
  assert.match(close, /setTestModeAnalyticsVisible\(false\)/u);
  assert.doesNotMatch(`${open}\n${close}`, /setIdx|setQueue|restart|setTestModeVisible|onUpdateCard/u);
  assert.match(screen, /\{!done && !analyticsOpen && \(/u);
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

  // The header X exits directly; completion itself has no separate Close action.
  assert.match(wordList, /onPress=\{testMode\.onQuit\}/u);
  assert.match(app, /onQuit: quitTestMode,/u);
  const quit = app.slice(app.indexOf('const quitTestMode'), app.indexOf('const toggleTestMode'));
  assert.match(quit, /setTestModeAnalyticsVisible\(false\);\s*setTestModeVisible\(false\);/u);
  assert.doesNotMatch(quit, /setIdx|setQueue|handleReset|setCards|setStudyLog|test_complete/u);
  const screen = read(SCREEN);
  const completion = screen.slice(screen.indexOf('{showAnalytics ? ('), screen.indexOf('/* ── Card area'));
  assert.doesNotMatch(completion, /t\('close'\)|name="close"/u);

  // Leaving the folder ends the session rather than carrying its queue over to
  // a different folder's words.
  assert.match(app, /const goBackToFolders = \(\) => \{[\s\S]{0,200}setTestModeVisible\(false\);/u);
  assert.match(app, /const openFolder = \(id: string\) => \{[\s\S]{0,550}setTestModeVisible\(false\);/u);
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

test('a running test shows a centred TEST title with a rightmost X', () => {
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
  assert.match(header, /onPress=\{testMode\.onQuit\}[\s\S]{0,220}name="close" size=\{24\} color=\{pal\.sub\}/u);

  // The title is centred independently of the absolutely right-aligned X.
  assert.match(
    wordList,
    /row: \{\s*flex: 1,[\s\S]{0,120}justifyContent: 'center',[\s\S]{0,80}position: 'relative',/u,
  );
  assert.match(wordList, /closeButton: \{\s*position: 'absolute',\s*right: 0,/u);
});

test('the Test header carries only the title and its quit button', () => {
  const header = headerJsx(read(WORD_LIST));
  const testBranch = header.slice(
    header.indexOf(') : testMode.active ? ('),
    header.lastIndexOf('      ) : ('),
  );

  // No folder name, back chevron, notification toggle, or menu remains.
  assert.doesNotMatch(testBranch, /currentFolder/u);
  assert.doesNotMatch(testBranch, /chevron-back|onGoBack/u);
  assert.doesNotMatch(testBranch, /notifications|notificationsEnabled/u);
  assert.doesNotMatch(testBranch, /ellipsis-vertical|onOpenMenu|menuBtnRef/u);
  assert.doesNotMatch(testBranch, /onOpenNotifications|onOpenTextToSpeech/u);
  assert.doesNotMatch(testBranch, /s\.headerIcons|folderHeaderContent/u);
  assert.equal((testBranch.match(/<TouchableOpacity/gu) ?? []).length, 1);
  assert.match(testBranch, /onPress=\{testMode\.onQuit\}/u);

  // The ordinary header still has every one of them — this hides them for one
  // mode, it does not delete them, and every other mode still renders them.
  assert.match(header, /\{currentFolder\?\.name \?\? ''\}/u);
  assert.match(header, /onPress=\{actions\.onGoBack\}/u);
  assert.match(header, /onPress=\{actions\.onOpenNotifications\}/u);
  assert.match(header, /onPress=\{actions\.onOpenMenu\}/u);
  assert.match(header, /\) : \(\s*folderHeaderContent\s*\)\}/u);
});

test('the word count is hidden during a test without moving the rows below it', () => {
  const wordList = read(WORD_LIST);
  const count = wordList.slice(
    wordList.indexOf('  const wordCount = ('),
    wordList.indexOf('// ── Level filter bar'),
  );

  // The row remains mounted at its normal height, but neither sighted users nor
  // assistive technology receive its contents while Test Mode is active.
  assert.match(count, /style=\{testMode\.active \? wordListLayoutStyles\.hiddenWordCount : undefined\}/u);
  assert.match(count, /pointerEvents=\{testMode\.active \? 'none' : 'auto'\}/u);
  assert.match(count, /accessibilityElementsHidden=\{testMode\.active\}/u);
  assert.match(count, /importantForAccessibility=\{testMode\.active \? 'no-hide-descendants' : 'auto'\}/u);
  assert.match(wordList, /hiddenWordCount: \{ opacity: 0 \}/u);

  // The label keeps its own scroll state across a test, so there is nothing to
  // reconstruct on the way out.
  assert.doesNotMatch(wordList, /if \(testMode\.active\) return;\s*const atTop =/u);
});

test('entering a test moves nothing on the screen', () => {
  const wordList = read(WORD_LIST);

  // Three rows sit above the card area, and a test may not shift any of them.
  // The header is a fixed height, the hidden word-count row stays mounted, and
  // the filter row's own condition does not change with the mode.
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

test('entering a test has no filter to clear, because nothing filters', () => {
  const wordList = read(WORD_LIST);

  assert.match(
    wordList,
    /const handleOpenTestMode = useCallback\(\(\) => \{\s*actionsRef\.current\.onOpenTestMode\(\);\s*\}, \[\]\);/u,
  );
  // The list the test covers is simply the list: no selection to reset on the
  // way in, and none to restore on the way out.
  assert.doesNotMatch(wordList, /activeResultFilter|onToggleResultFilter/u);
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
