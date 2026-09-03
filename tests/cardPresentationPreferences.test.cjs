const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Flip Mode measures intrinsic long content before any scroll interaction', () => {
  const face = read('src/components/CardScrollFace.tsx');
  const browser = read('src/components/FlipCardBrowser.tsx');

  assert.match(face, /<ScrollView[\s\S]*?<Pressable\s+style=\{s\.pressable\}/u);
  assert.match(face, /pressable:\s*\{[\s\S]*?minHeight: FLIP_CARD_H,[\s\S]*?paddingTop: FLIP_CARD_PAD_V,[\s\S]*?paddingBottom: FLIP_CARD_PAD_V,/u);
  assert.doesNotMatch(face, /contentContainerStyle=\{\{\s*flexGrow:\s*1\s*\}\}/u);
  assert.doesNotMatch(face, /onScroll=|onLayout=|onContentSizeChange=|setTimeout|useState/u);
  assert.doesNotMatch(face, /nestedScrollEnabled/u);
  // Every slot now renders the same face, so every slot owns a ScrollView — and
  // rasterizing an interactive subtree can hold its first viewport-sized layer until
  // scrolling invalidates the cache. Nothing in Flip Mode may be texture-cached.
  assert.doesNotMatch(browser, /renderToHardwareTextureAndroid|shouldRasterizeIOS|cacheStaticPreview/u);

  // Word, meaning and note remain unrestricted text nodes, including the adjacent
  // front preview. Existing explicit line limits elsewhere are outside Flip Mode.
  const render = browser.slice(browser.indexOf('// ── Render'), browser.indexOf('// ── Styles'));
  assert.doesNotMatch(render, /numberOfLines/u);

  // Horizontal navigation still claims only horizontal movement, and the existing
  // vertical-flip setting still selects rotateX instead of replacing the gesture.
  assert.match(browser, /Math\.abs\(dx\) > 8 && Math\.abs\(dx\) > Math\.abs\(dy\) \* 1\.5/u);
  assert.match(browser, /const rotateKey = verticalFlip \? 'rotateX' : 'rotateY';/u);
});

test('New Folder and Edit Folder continue the sheet theme through the safe area', () => {
  const modal = read('src/components/FolderCustomizeModal.tsx');
  const appModals = read('src/app/AppModals.tsx');

  assert.equal((appModals.match(/<FolderCustomizeModal/gu) ?? []).length, 2);
  assert.match(modal, /const sheetH\s*=\s*totalH - \(isSubscribed \? 0 : AD_BANNER_HEIGHT\) - insets\.bottom;/u);
  assert.match(modal, /height: insets\.bottom, backgroundColor: pal\.dialog/u);
  assert.doesNotMatch(modal, /height: insets\.bottom, backgroundColor: pal\.bg/u);

  // Existing keyboard and safe-area geometry stays in place.
  assert.match(modal, /Keyboard\.addListener\(showEvt/u);
  assert.match(modal, /Keyboard\.addListener\(hideEvt/u);
  assert.match(modal, /style=\{\[styles\.kbToolbar, \{ bottom: kbHeight \}\]\}/u);
  assert.match(modal, /\{insets\.bottom > 0 && \(/u);
});

test('no card draws a result label in its corner, on any surface', () => {
  const swipeable = read('src/components/SwipeableCard.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');
  const reorder = read('src/components/ReorderableList.tsx');

  // The corner ribbon is gone from the list row, the reorder row and its drag
  // ghost, and the flip card. Nothing is drawn in its place, and no surface
  // keeps a private colour table it could start drawing from again.
  for (const [name, source] of [
    ['SwipeableCard', swipeable],
    ['FlipCardBrowser', flip],
    ['ReorderableList', reorder],
  ]) {
    assert.doesNotMatch(source, /resultLabelColor|resultLabel'/u, name);
    assert.doesNotMatch(source, /cornerStripe|rowStripe|flipStripe|STRIPE_COLORS/u, name);
    assert.doesNotMatch(source, /#3B82F6|#f59e0b|#ef4444|#22c55e/u, name);
  }
  // The rule that chose the colours has no callers left either.
  assert.equal(fs.existsSync(path.join(ROOT, 'src/features/cards/resultLabel.ts')), false);
});

test('no setting or stored preference survives the label it used to control', () => {
  // The label is gone and so is everything that once switched it on and off:
  // no Settings row, no storage key, no state, and no route from Test Mode's
  // Reset. Nothing is left to turn back on by accident.
  for (const file of [
    'App.tsx',
    'src/constants.ts',
    'src/app/useAppSettings.ts',
    'src/app/useAppBootstrap.ts',
    'src/app/useAppPersistence.ts',
    'src/app/AppModals.tsx',
    'src/components/SettingsModal.tsx',
    'src/components/TestModeScreen.tsx',
    'src/components/SwipeableCard.tsx',
    'src/components/FlipCardBrowser.tsx',
    'src/components/ReorderableList.tsx',
    'src/screens/WordListScreen/WordListScreen.tsx',
    'src/i18n.ts',
  ]) {
    assert.doesNotMatch(
      read(file),
      /showResultColor|SHOW_RESULT_COLOR_KEY|show_result_color_on_cards|showLevelLabel\b/u,
      file,
    );
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'src/features/settings/resultColorPreference.ts')), false);

  // The colour filters keep their own, separate flag.
  assert.match(
    read('src/screens/WordListScreen/WordListScreen.tsx'),
    /\{showLevelLabels && \(/u,
    'result filters stay controlled by their existing flag',
  );
});

test('visual hiding never removes the localized accessible result label', () => {
  const accessibleLabel = read('src/components/CardResultAccessibilityLabel.tsx');
  const swipeable = read('src/components/SwipeableCard.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');
  const levels = read('src/features/cards/levels.ts');

  assert.match(accessibleLabel, /accessible[\s\S]*?accessibilityRole="text"[\s\S]*?accessibilityLabel=\{t\(TEST_LEVEL_LABEL_KEYS\[testLevel\]\)\}/u);
  // Nothing on a card shows the result any more, which is exactly why the
  // spoken label has to stay: it is now the only thing that reports it.
  assert.match(swipeable, /<CardResultAccessibilityLabel testLevel=\{item\.testLevel\} \/>/u);
  assert.match(flip, /\{isCurr && <CardResultAccessibilityLabel testLevel=\{c\.testLevel\} \/>\}/u);
  for (const [level, key] of [
    ['perfect', 'test_know_perfectly'],
    ['good', 'test_know_good'],
    ['slightly', 'test_know_slightly'],
    ['unknown', 'test_dont_know'],
  ]) {
    assert.match(levels, new RegExp(`${level}: '${key}'`, 'u'));
  }
});

test('result colours, filter options, and localized labels remain canonical', () => {
  const levels = read('src/features/cards/levels.ts');

  // The filter chips are untouched by the card label going away — they keep
  // their own colours, which were never the label's.
  assert.match(levels, /\{ level: 'good',[\s\S]{0,80}color: '#6BA4F0' \}/u);
  assert.match(levels, /\{ level: 'slightly',[\s\S]{0,80}color: '#F2B445' \}/u);
  assert.match(levels, /\{ level: 'unknown',[\s\S]{0,80}color: '#ED7373' \}/u);
});
