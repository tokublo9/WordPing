const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Flip Mode measures intrinsic long content before any scroll interaction', () => {
  const face = read('src/components/CardScrollFace.tsx');
  const browser = read('src/components/FlipCardBrowser.tsx');

  assert.match(face, /<ScrollView[\s\S]*?<Pressable style=\{s\.pressable\}/u);
  assert.match(face, /pressable:\s*\{[\s\S]*?minHeight: FLIP_CARD_H,[\s\S]*?paddingTop: FLIP_CARD_PAD_V,[\s\S]*?paddingBottom: FLIP_CARD_PAD_V,/u);
  assert.doesNotMatch(face, /contentContainerStyle=\{\{\s*flexGrow:\s*1\s*\}\}/u);
  assert.doesNotMatch(face, /onScroll=|onLayout=|onContentSizeChange=|setTimeout|useState/u);
  assert.doesNotMatch(face, /nestedScrollEnabled/u);
  assert.match(browser, /const cacheStaticPreview = active && !isCurr;/u);
  assert.match(browser, /renderToHardwareTextureAndroid=\{cacheStaticPreview\}/u);
  assert.match(browser, /shouldRasterizeIOS=\{cacheStaticPreview\}/u);
  assert.doesNotMatch(browser, /renderToHardwareTextureAndroid=\{active\}|shouldRasterizeIOS=\{active\}/u);

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

test('the result-colour toggle controls only Word List and Flip Mode decorations', () => {
  const app = read('App.tsx');
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const settings = read('src/components/SettingsModal.tsx');
  const swipeable = read('src/components/SwipeableCard.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');

  assert.match(app, /showResultColor=\{showResultColor\}/u);
  assert.match(screen, /showLevelLabel=\{showResultColor\}/u);
  assert.equal((screen.match(/showLevelLabel=\{showResultColor\}/gu) ?? []).length, 3);
  assert.match(screen, /\{showLevelLabels && \(/u, 'result filters stay controlled by their existing flag');

  assert.match(settings, /label=\{t\('show_result_color_on_cards'\)\}[\s\S]{0,160}info=\{t\('show_result_color_on_cards_info'\)\}[\s\S]{0,160}value=\{showResultColor\}[\s\S]{0,120}onToggle=\{onToggleShowResultColor\}/u);
  assert.doesNotMatch(settings, /show_result_color_on_cards_desc/u);
  assert.match(swipeable, /showLevelLabel && !isFlipped && !!item\.testLevel/u);
  assert.match(flip, /const color = showLevelLabel && c\.testLevel \? STRIPE_COLORS\[c\.testLevel\] : null;/u);
});

test('the result-colour preference loads safely and persists through the shared settings path', () => {
  const constants = read('src/constants.ts');
  const state = read('src/app/useAppSettings.ts');
  const bootstrap = read('src/app/useAppBootstrap.ts');
  const persistence = read('src/app/useAppPersistence.ts');
  const testMode = read('src/components/TestModeScreen.tsx');

  assert.match(constants, /export const SHOW_RESULT_COLOR_KEY = 'card_show_result_color';/u);
  assert.match(state, /useState\(DEFAULT_SHOW_RESULT_COLOR\)/u);
  assert.match(bootstrap, /AsyncStorage\.getItem\(SHOW_RESULT_COLOR_KEY\)/u);
  assert.match(bootstrap, /setShowResultColor\(parseShowResultColorPreference\(rawShowResultColor\)\)/u);
  assert.match(persistence, /if \(!hasLoaded\.current\) return;[\s\S]{0,120}AsyncStorage\.setItem\([\s\S]{0,80}SHOW_RESULT_COLOR_KEY,[\s\S]{0,100}serializeShowResultColorPreference\(showResultColor\)/u);

  // Test Mode Reset has no route to this preference.
  assert.doesNotMatch(testMode, /SHOW_RESULT_COLOR_KEY|showResultColor|setShowResultColor/u);
});

test('visual hiding never removes the localized accessible result label', () => {
  const accessibleLabel = read('src/components/CardResultAccessibilityLabel.tsx');
  const swipeable = read('src/components/SwipeableCard.tsx');
  const flip = read('src/components/FlipCardBrowser.tsx');
  const levels = read('src/features/cards/levels.ts');

  assert.match(accessibleLabel, /accessible[\s\S]*?accessibilityRole="text"[\s\S]*?accessibilityLabel=\{t\(TEST_LEVEL_LABEL_KEYS\[testLevel\]\)\}/u);
  assert.match(swipeable, /<CardResultAccessibilityLabel testLevel=\{item\.testLevel\} \/>[\s\S]*?<TouchableOpacity[\s\S]*?\{showLevelLabel &&/u);
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
  const flip = read('src/components/FlipCardBrowser.tsx');
  const levels = read('src/features/cards/levels.ts');
  const i18n = read('src/i18n.ts');

  assert.match(flip, /perfect: '#22c55e', good: '#3B82F6', slightly: '#f59e0b', unknown: '#ef4444'/u);
  assert.match(levels, /\{ level: 'good',[\s\S]{0,80}color: '#6BA4F0' \}/u);
  assert.match(levels, /\{ level: 'slightly',[\s\S]{0,80}color: '#F2B445' \}/u);
  assert.match(levels, /\{ level: 'unknown',[\s\S]{0,80}color: '#ED7373' \}/u);
  assert.match(i18n, /show_result_color_on_cards: 'Show result colour on cards',/u);
  assert.match(i18n, /show_result_color_on_cards: 'カードに結果の色を表示',/u);
});
