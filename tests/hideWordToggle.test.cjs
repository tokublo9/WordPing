const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

/**
 * The "Hide Word" toggle in the Add New Word and Edit Word sheets.
 *
 * The stored shape and its migration are covered by tests/unit/hideWord.test.ts
 * against real SQLite. What is pinned here is the wiring: where the control
 * sits, who sees it, and that the study faces stop drawing the text without
 * losing anything else.
 */

// ── The control ──────────────────────────────────────────────────────────────

test('the switch sits with the WORD label, not with the voice controls', () => {
  const modal = read('src/components/WordModal.tsx');
  const labelRow = modal.slice(
    modal.indexOf('<View style={styles.fieldLabelRow}>'),
    modal.indexOf('<View>\n                  {/* A hidden word is dimmed here'),
  );

  // Label first, then the switch, with only a small fixed gap between them.
  const left = labelRow.slice(
    labelRow.indexOf('<View style={styles.fieldLabelLeft}>'),
    labelRow.indexOf('<View style={[styles.audioBtnGroup, styles.wordHeaderRight]}>'),
  );
  assert.match(left, /\{t\('word_label'\)\}/u, 'the label is in the left group');
  assert.ok(
    left.indexOf("{t('word_label')}") < left.indexOf("accessibilityLabel={t('hide_word')}"),
    'the switch comes immediately after the label',
  );
  const leftStyle = modal.slice(
    modal.indexOf('fieldLabelLeft: {'),
    modal.indexOf('wordHeaderRight: {'),
  );
  assert.match(leftStyle, /flexDirection: 'row',\s*alignItems: 'center',\s*gap: 8,/u);
  assert.doesNotMatch(leftStyle, /flex:\s*1|justifyContent|Spacer/u);

  const rowStyle = modal.slice(
    modal.indexOf('fieldLabelRow: {'),
    modal.indexOf('fieldLabelLeft: {'),
  );
  assert.doesNotMatch(rowStyle, /flex:\s*1|justifyContent:\s*'space-between'/u);
  assert.match(labelRow, /style=\{\[styles\.audioBtnGroup, styles\.wordHeaderRight\]\}/u);
  assert.match(modal, /wordHeaderRight: \{\s*marginLeft: 'auto',/u);

  // And it is no longer among the Custom Voice controls.
  const voiceGroup = labelRow.slice(labelRow.indexOf('<View style={[styles.audioBtnGroup, styles.wordHeaderRight]}>'));
  assert.doesNotMatch(voiceGroup, /hide_word|canHideWord/u, 'nothing of Hide Word is left there');
});

test('the switch is always available and independent of Custom Voice', () => {
  const modal = read('src/components/WordModal.tsx');

  assert.doesNotMatch(modal, /canHideWord|canUseCustomVoice/u);
  assert.equal((modal.match(/t\('hide_word'\)/gu) ?? []).length, 1, 'one control, one place');

  // The control itself contains no plan or voice gate.
  const code = modal
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
  const toggleAt = code.indexOf("accessibilityLabel={t('hide_word')}");
  const toggle = code.slice(code.lastIndexOf('<TouchableOpacity', toggleAt), code.indexOf('</TouchableOpacity>', toggleAt));
  assert.doesNotMatch(toggle, /plan ===|isPremium|isSubscribed|canUseAIVoice/u);
});

test('Hide Word has no subscription wiring at the app boundary', () => {
  const access = read('src/features/cards/hideWordAccess.ts');
  const app = read('App.tsx');
  const modals = read('src/app/AppModals.tsx');
  const modal = read('src/components/WordModal.tsx');

  assert.doesNotMatch(`${access}\n${app}\n${modals}\n${modal}`, /canHideWord|planUnlocksHideWord|HIDE_WORD_PLAN/u);
  assert.match(access, /return card\?\.hideWord === true;/u);

  // The toggle remains in the left group with no conditional entitlement wrapper.
  const header = modal.slice(
    modal.indexOf('<View style={styles.fieldLabelRow}>'),
    modal.indexOf('<View>\n                  {/* A hidden word is dimmed here'),
  );
  const leftEnd = header.indexOf('</View>', header.indexOf('<View style={styles.fieldLabelLeft}>'));
  assert.ok(header.indexOf("accessibilityLabel={t('hide_word')}") < leftEnd, 'Hide Word is in the left group');
  const right = header.slice(header.indexOf('<View style={[styles.audioBtnGroup, styles.wordHeaderRight]}>'));
  assert.doesNotMatch(right, /canHideWord|hide_word/u);
});

test('it announces itself as a switch with its current state', () => {
  const modal = read('src/components/WordModal.tsx');
  assert.match(modal, /accessibilityRole="switch"/u);
  assert.match(modal, /accessibilityState=\{\{ checked: hideWord \}\}/u);
  assert.match(modal, /accessibilityHint=\{t\(hideWord \? 'hide_word_on' : 'hide_word_off'\)\}/u);
  // Colour is never the only signal: the glyph changes too.
  assert.match(modal, /name=\{hideWord \? 'eye-off' : 'eye-outline'\}/u);
});

// ── Saved per word, loaded on edit ───────────────────────────────────────────

test('the setting belongs to the word, and edit loads what was saved', () => {
  const cards = read('src/features/cards/useCards.ts');
  // Add starts off...
  assert.match(cards, /setWordHideWord\(false\);\s*setWordAudioUri\(undefined\);/u);
  // ...edit loads the stored value, treating an older card as off...
  assert.match(cards, /setWordHideWord\(card\.hideWord === true\);/u);
  // ...and both save paths write it onto the card.
  assert.equal((cards.match(/hideWord: wordHideWord,/gu) ?? []).length, 2);

  // Threaded to the sheet as its own field, not derived from anything else.
  assert.match(read('App.tsx'), /hideWord: wordHideWord,\s*onChangeHideWord: setWordHideWord,/u);
  assert.match(
    read('src/app/AppModals.tsx'),
    /hideWord=\{wordModal\.hideWord\}\s*onChangeHideWord=\{wordModal\.onChangeHideWord\}/u,
  );
});

// ── The study faces ──────────────────────────────────────────────────────────

test('every surface that draws the word stops drawing it', () => {
  for (const path of [
    'src/components/FlipCardBrowser.tsx',
    'src/components/TestModeScreen.tsx',
    'src/components/SwipeableCard.tsx',
  ]) {
    const source = read(path);
    // Through the shared stored-value rule, with no plan capability argument.
    assert.match(
      source,
      /isWordTextHidden\((c|card|item)\)/u,
      `${path} must resolve through the shared rule`,
    );
    assert.match(source, /import \{ isWordTextHidden \} from '\.\.\/features\/cards\/hideWordAccess';/u);
    // Never duplicate the raw flag check at a rendering surface.
    assert.doesNotMatch(source, /\{c\.hideWord\s*\?|\{card!\.hideWord\s*\?|\{item\.hideWord\s*\?/u);
  }
});

test('a hidden word is marked with the eye-off icon and no text', () => {
  const icon = read('src/components/HiddenWordIcon.tsx');

  // The glyph and its two sizes, unchanged from before: large and centred on a
  // study face, smaller at the start of a list row.
  assert.match(icon, /name="eye-off-outline"/u);
  assert.match(icon, /size=\{variant === 'row' \? 18 : 26\}/u);
  assert.match(icon, /icon: \{\s*opacity: 0\.35,\s*\}/u);

  // No visible label of any kind — the glyph is the whole message. The string it
  // carries is an accessible name, and it names the state, never the word.
  assert.doesNotMatch(icon, /<Text/u, 'nothing is drawn as text');
  assert.match(icon, /accessibilityLabel=\{t\('hide_word_card_label'\)\}/u);
  assert.doesNotMatch(icon, /\bword\b\s*[}:]|children/u, 'it never receives the word');

  for (const path of [
    'src/components/FlipCardBrowser.tsx',
    'src/components/TestModeScreen.tsx',
    'src/components/SwipeableCard.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /<HiddenWordIcon color=\{pal\.text\}/u, `${path} must show the mark`);
    // Never faked with transparency or a zero size.
    assert.doesNotMatch(source, /hideWord[^\n]{0,80}opacity/u, `${path} must not fake it`);
  }

  // The study faces keep their size from the face's own minHeight, so a hidden
  // card is exactly as large as a visible one.
  assert.match(read('src/components/CardScrollFace.tsx'), /minHeight: FLIP_CARD_H,/u);
});

test('a hidden list row keeps the height of a visible one', () => {
  // The row has no minimum of its own — only padding — so the mark carries the
  // line box the word would have had, or the row would sit shorter than every
  // row around it and be harder to hit.
  const icon = read('src/components/HiddenWordIcon.tsx');
  assert.match(icon, /row: \{\s*height: 22,/u);

  const swipeable = read('src/components/SwipeableCard.tsx');
  assert.equal(
    (swipeable.match(/<HiddenWordIcon color=\{pal\.text\} variant="row" \/>/gu) ?? []).length,
    3,
    'the front face, the expanded face and the lifted preview',
  );
});

test('everything else on the face is untouched', () => {
  const flip = read('src/components/FlipCardBrowser.tsx');
  const face = flip.slice(flip.indexOf('{/* Front face.'), flip.indexOf('{/* Back face'));
  // The voice button — including the Custom Voice glyph this pairs with — and
  // the notification badge both still render on a hidden card. (The result
  // label that used to sit beside them is no longer drawn on any card.)
  assert.match(face, /<WordCardVoiceButton/u);
  assert.match(face, /source=\{wordVoiceSource\}/u);
  assert.match(face, /c\.notifCandidate &&/u);
  assert.doesNotMatch(face, /stripe/u);
  // None of them is conditional on the word being visible.
  assert.doesNotMatch(face, /!c\.hideWord && <WordCardVoiceButton/u);

  // Test Mode keeps its answer buttons and its voice control too.
  const testMode = read('src/components/TestModeScreen.tsx');
  assert.match(testMode, /onPress=\{\(\) => advance\(kind\)\}/u);
  assert.doesNotMatch(testMode, /hideWord[^\n]*showVoice/u);
});

test('the word list hides the word everywhere the row could draw it', () => {
  const swipeable = read('src/components/SwipeableCard.tsx');
  // One answer per row, resolved once.
  assert.match(swipeable, /const wordHidden = isWordTextHidden\(item\);/u);

  // Three places the row renders the word: the front face, the expanded flipped
  // face, and the lifted long-press preview. A `{item.word}` left outside a
  // `wordHidden` branch would leak it, so the count and the guards must agree.
  assert.equal(
    (swipeable.match(/\{item\.word\}/gu) ?? []).length,
    3,
    'the row draws the word in exactly three places',
  );
  assert.equal(
    (swipeable.match(/wordHidden/gu) ?? []).length,
    12,
    'one definition, one copy guard, one per draw site, and the two action controls',
  );
});

test('the swipe and long-press menus toggle Hide Front Word, not notifications', () => {
  const swipeable = read('src/components/SwipeableCard.tsx');

  // The per-card notification action is gone from both menus. Everything else
  // about notifications stays: the badge on the row still renders, and the
  // scheduler is untouched.
  assert.doesNotMatch(swipeable, /onToggleNotif/u, 'the row no longer offers it');
  assert.match(
    swipeable,
    /\{!!item\.notifCandidate && \(/u,
    'the notification-list badge still draws',
  );

  // Both menus call the same toggle, and both label it by what the tap will do.
  assert.match(swipeable, /setTimeout\(onToggleHideWord, 220\)/u, 'the swipe reveal');
  assert.match(swipeable, /onPress=\{handleHideWordToggle\}/u, 'the long-press menu');
  assert.equal(
    (swipeable.match(/t\(wordHidden \? 'show_front_word_action' : 'hide_front_word_action'\)/gu) ?? []).length,
    2,
    'the swipe button names itself for VoiceOver, the menu row draws the label',
  );

  // It writes the stored flag the editor writes, so every surface follows from
  // the one card update — and it asks nothing of the plan on the way.
  const cards = read('src/features/cards/useCards.ts');
  assert.match(cards, /const toggleCardHideWord = \(id: string\) => \{/u);
  assert.match(cards, /c\.id === id \? \{ \.\.\.c, hideWord: !c\.hideWord \} : c/u);
  assert.doesNotMatch(
    swipeable,
    /onToggleHideWord[^\n]*(isSubscribed|isPremium|Paywall|ProSheet)/u,
    'no plan check stands between the user and this action',
  );

  // Wired end to end.
  assert.match(
    read('src/screens/WordListScreen/WordListScreen.tsx'),
    /onToggleHideWord=\{\(\) => currentActions\.onToggleHideWord\(item\.id\)\}/u,
  );
  assert.match(read('App.tsx'), /onToggleHideWord: toggleCardHideWord,/u);
});

test('a hidden word is not exposed through accessibility or copy', () => {
  const swipeable = read('src/components/SwipeableCard.tsx');

  // Copy is not offered at all for a hidden word — a dead button would still
  // read out, and the clipboard is as much an exposure as the screen.
  assert.match(
    swipeable,
    /const copyableText = isFlipped \? item\.meaning : \(wordHidden \? null : item\.word\);/u,
  );
  assert.match(swipeable, /if \(copyableText === null\) return;/u);
  assert.match(swipeable, /\{copyableText !== null && \(/u);

  // Nor is it announced: the row never names the word, and the mark that stands
  // in for it names only the state.
  assert.doesNotMatch(swipeable, /accessibilityLabel=\{item\.word\}/u);
  assert.doesNotMatch(read('src/components/HiddenWordIcon.tsx'), /item\.word|\{word\}/u);
});

test('the row stays tappable, so a hidden word can still be opened', () => {
  const swipeable = read('src/components/SwipeableCard.tsx');
  // Tap-to-flip and long-press live on the wrapper, not on the word text, so
  // replacing the text changes nothing about reaching the card.
  assert.match(
    swipeable,
    /style=\{\[styles\.cardFlipArea, \{ flex: 1 \}\]\}\s*onPress=\{reorderMode \? undefined : handleCardPress\}\s*onLongPress=/u,
  );
  // And the edit action is not conditional on the word being visible.
  assert.match(swipeable, /setTimeout\(onEdit, 220\)/u);
  assert.doesNotMatch(swipeable, /wordHidden[^\n]*onEdit/u);
});

// ── The word field in the sheets ─────────────────────────────────────────────

test('the word field dims its text, and only its text', () => {
  const modal = read('src/components/WordModal.tsx');

  // Dimmed rather than concealed: the sheet is where the word is written, so it
  // has to stay legible and editable there.
  assert.match(modal, /const wordFieldDimmed = isWordTextHidden\(\{ hideWord \}\);/u);
  assert.match(
    modal,
    /\{ color: wordFieldDimmed \? pal\.text \+ HIDDEN_WORD_TEXT_ALPHA : pal\.text \}/u,
  );
  // Restored exactly, not to some other colour, when the switch is off. The
  // alpha is low enough to read as clearly lighter at a glance.
  assert.match(modal, /const HIDDEN_WORD_TEXT_ALPHA = '(59|66)';/u);

  // The colour alone. An `opacity` on the input would take the border, the
  // background and the caret with it.
  const input = modal.slice(modal.indexOf('<StationaryTapTextInput'), modal.indexOf('scrollEnabled={false}'));
  assert.doesNotMatch(input, /opacity/u);
  assert.match(input, /borderColor: pal\.border, backgroundColor: pal\.input, minHeight: 96/u);
  // ...and it stays editable: the sheet is the only place the word can be fixed.
  assert.match(input, /value=\{word\}\s*onChangeText=\{onChangeWord\}/u);
  assert.doesNotMatch(input, /editable=\{false\}|editable=\{!wordFieldDimmed\}/u);

  // Nothing else in the sheet reads the flag, so the label, the validation
  // message and every other control keep their own appearance.
  assert.equal((modal.match(/wordFieldDimmed/gu) ?? []).length, 2, 'defined once, used once');
});

// ── The Custom Voice delete button ───────────────────────────────────────────

test('delete removes the attached audio and nothing else', () => {
  const modal = read('src/components/WordModal.tsx');
  const clear = modal.slice(
    modal.indexOf('const handleClearAudio'),
    modal.indexOf('// keyboard height for floating Save toolbar'),
  );

  // Audio fields only: the word, the meaning, the note and the Hide Word setting
  // are all untouched, so clearing a voice never costs the user anything else.
  assert.match(clear, /onChangeAudioUri\(undefined\);/u);
  assert.match(clear, /onChangeAudioSpeed\(1\.0\);/u);
  assert.match(clear, /onChangeAudioVolume\(1\.0\);/u);
  assert.doesNotMatch(clear, /onChangeHideWord|onChangeWord\(|onChangeMeaning|onDelete/u);

  // Offered only when there is something to clear.
  assert.match(modal, /\{audioUri && \(\s*<TouchableOpacity\s*onPress=\{handleClearAudio\}/u);
});

// ── Localization ─────────────────────────────────────────────────────────────

test('every new string ships in English and Japanese', () => {
  const i18n = read('src/i18n.ts');
  for (const key of ['hide_word', 'hide_word_on', 'hide_word_off']) {
    const occurrences = i18n.match(new RegExp(`^\\s{2}${key}:`, 'gmu')) ?? [];
    assert.equal(occurrences.length, 2, `${key} needs an English and a Japanese entry`);
  }
  // Declared optional, so the remaining locales fall back to English rather
  // than failing the build until they are translated.
  assert.match(i18n, /\| 'hide_word' \| 'hide_word_on' \| 'hide_word_off'/u);
});
