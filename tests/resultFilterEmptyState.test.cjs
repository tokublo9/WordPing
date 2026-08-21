const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Word List and Flip Mode share one empty-state decision and rendering path', () => {
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const decisionAt = screen.indexOf('const emptyState = resolveWordListEmptyState');
  const emptyFilterAt = screen.indexOf("emptyState === 'result-filter'");
  const flipAt = screen.indexOf('const flipModeContent');
  const listAt = screen.indexOf('const listModeContent');

  assert.ok(decisionAt > 0);
  assert.ok(emptyFilterAt > decisionAt);
  assert.ok(flipAt > emptyFilterAt);
  assert.ok(listAt > flipAt);
  assert.equal((screen.match(/resolveWordListEmptyState\(/gu) ?? []).length, 1);
});

test('the filter-specific state is localized, accessible, and not add-word onboarding', () => {
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const filteredBranch = screen.slice(
    screen.indexOf("emptyState === 'result-filter'"),
    screen.indexOf("emptyState === 'generic'"),
  );

  assert.match(filteredBranch, /filterEmptyCopyKeys/u);
  assert.match(filteredBranch, /testID="empty-result-filter"/u);
  assert.match(filteredBranch, /name="funnel-outline"/u);
  assert.match(filteredBranch, /accessibilityLabel=\{`\$\{title\}\. \$\{description\}`\}/u);
  assert.match(filteredBranch, /accessibilityLiveRegion="polite"/u);
  assert.doesNotMatch(filteredBranch, /no_words_|Tap \+|onOpenAdd/u);
});

test('the original empty-folder illustration, layout, and localized copy remain isolated', () => {
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const genericBranch = screen.slice(
    screen.indexOf("emptyState === 'generic'"),
    screen.indexOf('} else {', screen.indexOf("emptyState === 'generic'")),
  );

  assert.match(genericBranch, /style=\{s\.empty\}/u);
  assert.match(genericBranch, /emptyIconWrap/u);
  assert.match(genericBranch, /name="book-outline" size=\{40\} color=\{themeColor\}/u);
  assert.match(genericBranch, /t\('no_words_title'\)/u);
  assert.match(genericBranch, /t\('no_words_hint'\)/u);
  assert.doesNotMatch(genericBranch, /funnel-outline|empty_filter_/u);
});

test('the presentation layer does not write grading, counts, hiding, or card data', () => {
  const emptyState = read('src/features/cards/emptyState.ts');
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const filteredBranch = screen.slice(
    screen.indexOf("emptyState === 'result-filter'"),
    screen.indexOf("emptyState === 'generic'"),
  );

  assert.doesNotMatch(emptyState, /hiddenUntil|gradedAt|set[A-Z]|update|delete|splice|push/u);
  assert.doesNotMatch(filteredBranch, /hiddenUntil|gradedAt|onToggleResultFilter|set[A-Z]|update|delete/u);
});
