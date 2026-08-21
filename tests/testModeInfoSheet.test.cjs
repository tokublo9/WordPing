const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('the forgetting-curve explanation, illustration, and dedicated layout are absent', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  const i18n = read('src/i18n.ts');

  assert.doesNotMatch(screen, /ForgettingCurve|LinearGradient|CHART_H|Y_AXIS_W|curve\./u);
  assert.doesNotMatch(screen, /test_info_caption|chart_(?:now|day_|memory|time|review|after_review|no_review)/u);
  assert.doesNotMatch(i18n, /A Test Method Based on the Forgetting Curve/u);
});

test('the information UI is a centred popup with backdrop and both dismissal paths', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  const popup = screen.slice(screen.indexOf('function InfoPopup'), screen.indexOf('const is = StyleSheet.create'));
  const styles = screen.slice(screen.indexOf('const is = StyleSheet.create'), screen.indexOf('// ── Helpers'));

  assert.match(popup, /<Modal[\s\S]*transparent[\s\S]*animationType="fade"[\s\S]*onRequestClose=\{onClose\}/u);
  assert.match(popup, /<View style=\{is\.backdrop\}>/u);
  assert.equal((popup.match(/onPress=\{onClose\}/gu) ?? []).length, 2);
  assert.match(screen, /onPress=\{\(\) => setInfoVisible\(true\)\}[\s\S]{0,180}accessibilityRole="button"[\s\S]{0,100}accessibilityLabel=\{t\('test_info_title'\)\}/u);
  assert.match(styles, /backdrop:\s*\{[\s\S]*alignItems: 'center',[\s\S]*justifyContent: 'center'/u);
  assert.match(styles, /dialog:\s*\{[\s\S]*maxWidth: 440,[\s\S]*borderRadius: 18/u);
  assert.doesNotMatch(screen, /function InfoSheet|sheetOuter|borderTopLeftRadius|translateY: slideY/u);
});

test('the popup presents exactly the four grading results and no Reset description', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  const i18n = read('src/i18n.ts');
  const descriptions = screen.slice(screen.indexOf('const INFO_DESCRIPTION_KEYS'), screen.indexOf('// Derive the presentation'));
  const popup = screen.slice(screen.indexOf('function InfoPopup'), screen.indexOf('const is = StyleSheet.create'));

  for (const [kind, expKey] of [
    ['perfect', 'test_info_perfect_exp'],
    ['good', 'test_info_good_exp'],
    ['slightly', 'test_info_slightly_exp'],
    ['unknown', 'test_info_unknown_exp'],
  ]) {
    assert.match(descriptions, new RegExp(`${kind}: '${expKey}'`, 'u'));
  }
  assert.match(screen, /const INFO_ITEMS = ANSWERS\.map\(answer => \(\{[\s\S]*\.\.\.answer,[\s\S]*expKey: INFO_DESCRIPTION_KEYS\[answer\.kind\]/u);
  assert.match(popup, /accessibilityLabel=\{`\$\{t\(item\.labelKey\)\}\. \$\{t\(item\.expKey\)\}`\}/u);
  assert.doesNotMatch(popup, /test_reset|handleReset|refresh-outline/u);
  assert.doesNotMatch(i18n, /test_info_reset_exp/u);
});

test('popup indicators reuse the exact Test Mode answer icons and colors', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  const answers = screen.slice(screen.indexOf('const ANSWERS'), screen.indexOf('// ── Information popup'));
  const infoItems = screen.slice(screen.indexOf('const INFO_ITEMS'), screen.indexOf('function InfoPopup'));
  const popup = screen.slice(screen.indexOf('function InfoPopup'), screen.indexOf('const is = StyleSheet.create'));

  assert.match(answers, /kind: 'perfect',[\s\S]{0,100}icon: '◎',[\s\S]{0,30}color: '#22c55e'/u);
  assert.match(answers, /kind: 'good',[\s\S]{0,100}icon: 'ellipse-outline',[\s\S]{0,30}color: '#3B82F6'/u);
  assert.match(answers, /kind: 'slightly',[\s\S]{0,100}icon: 'triangle-outline',[\s\S]{0,30}color: '#f59e0b'/u);
  assert.match(answers, /kind: 'unknown',[\s\S]{0,100}icon: 'close-outline',[\s\S]{0,30}color: '#ef4444'/u);
  assert.match(infoItems, /ANSWERS\.map\(answer => \(\{[\s\S]*\.\.\.answer/u);
  assert.doesNotMatch(infoItems, /#[0-9a-f]{3,8}|trash-outline|refresh-outline/iu);
  assert.match(popup, /item\.icon === '◎'[\s\S]*<Text[\s\S]*>◎<\/Text>[\s\S]*<Ionicons name=\{item\.icon as any\} size=\{18\} color=\{item\.color\}/u);
});

test('English and Japanese contain all four grading descriptions exactly', () => {
  const i18n = read('src/i18n.ts');
  const expected = [
    "test_info_title:       'How test results work'",
    "test_info_perfect_exp: 'The word is immediately and permanently deleted.'",
    "test_info_good_exp:    'The word is hidden from the regular Word List and Flip Mode, then shown again after 3 days. You can still view it using the blue filter.'",
    "test_info_slightly_exp:'The word is hidden from the regular Word List and Flip Mode, then shown again after 1 day. You can still view it using the yellow filter.'",
    "test_info_unknown_exp: 'The word remains available for review and can be viewed using the red filter.'",
    "test_info_title:       'テスト結果の仕組み'",
    "test_info_perfect_exp: '単語はすぐに完全に削除されます。'",
    "test_info_good_exp:    '通常の単語リストとフリップモードでは一時的に非表示になり、3日後に再表示されます。青色のフィルターからいつでも確認できます。'",
    "test_info_slightly_exp:'通常の単語リストとフリップモードでは一時的に非表示になり、1日後に再表示されます。黄色のフィルターからいつでも確認できます。'",
    "test_info_unknown_exp: '単語は引き続き復習でき、赤色のフィルターから確認できます。'",
  ];

  for (const copy of expected) assert.ok(i18n.includes(copy), `Missing localized copy: ${copy}`);
});

test('grading durations, deletion path, and Reset implementation remain authoritative and unchanged', () => {
  const visibility = read('src/features/cards/visibility.ts');
  const grading = read('src/features/cards/grading.ts');
  const screen = read('src/components/TestModeScreen.tsx');

  assert.match(visibility, /PRETTY_GOOD_HIDE_MS = 72 \* 60 \* 60 \* 1000/u);
  assert.match(visibility, /NOT_REALLY_HIDE_MS = 24 \* 60 \* 60 \* 1000/u);
  assert.match(grading, /if \(syncTestResults\) return \{ action: 'delete' \}/u);
  assert.match(grading, /good:\s+PRETTY_GOOD_HIDE_MS/u);
  assert.match(grading, /slightly:\s+NOT_REALLY_HIDE_MS/u);
  assert.match(screen, /const outcome = gradeCard\(card, kind,/u);
  assert.match(screen, /if \(outcome\.action === 'delete'\) onDeleteCard\(card\.id\)/u);
  assert.match(screen, /testMastered: false,[\s\S]{0,100}testNextReview: 0,[\s\S]{0,100}testLevel: undefined,[\s\S]{0,100}\.\.\.CLEAR_HIDE/u);
  assert.match(screen, /onPress=\{handleReset\}[\s\S]{0,200}test_reset/u);
});
