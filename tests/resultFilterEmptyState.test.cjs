const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Word List and Flip Mode share one empty-state decision and rendering path', () => {
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const decisionAt = screen.indexOf('const emptyState = resolveWordListEmptyState');
  const completeAt = screen.indexOf("emptyState === 'session-complete'");
  const flipAt = screen.indexOf('const flipModeContent');
  const listAt = screen.indexOf('const listModeContent');

  assert.ok(decisionAt > 0);
  assert.ok(completeAt > decisionAt);
  assert.ok(flipAt > completeAt);
  assert.ok(listAt > flipAt);
  assert.equal((screen.match(/resolveWordListEmptyState\(/gu) ?? []).length, 1);
});

test('no filter can empty the list, so there is no filter empty state', () => {
  // Nothing narrows the Word List any more: the state that explained an empty
  // filter is gone with the filtering, along with its copy.
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const resolver = read('src/features/cards/emptyState.ts');
  const i18n = read('src/i18n.ts');

  assert.doesNotMatch(screen, /result-filter|funnel-outline|filterEmptyCopyKeys/u);
  assert.doesNotMatch(resolver, /result-filter|activeResultFilter/u);
  assert.doesNotMatch(i18n, /empty_filter_/u);
});

test('a finished review reports itself rather than borrowing the first-word state', () => {
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const completeBranch = screen.slice(
    screen.indexOf("emptyState === 'session-complete'"),
    screen.indexOf("emptyState === 'generic'"),
  );

  // The same wording and the same trophy Test Mode's own completion screen
  // uses, because it is that moment seen from the list.
  assert.match(completeBranch, /t\('test_complete_title'\)/u);
  assert.match(completeBranch, /t\('test_complete_hint'\)/u);
  assert.match(completeBranch, /name="trophy-outline" size=\{40\} color=\{themeColor\}/u);
  assert.match(completeBranch, /testID="empty-session-complete"/u);
  assert.match(completeBranch, /accessibilityLiveRegion="polite"/u);
  // Never the add-your-first-word copy: the words exist and are coming back.
  assert.doesNotMatch(completeBranch, /no_words_|Tap \+|onOpenAdd|funnel-outline/u);

  // The rule itself: hidden-but-present is the finished review, and an actually
  // empty folder is still onboarding.
  const resolver = read('src/features/cards/emptyState.ts');
  assert.match(
    resolver,
    /if \(visibleCardCount > 0\) return 'none';\s*return allCardCount > 0 \? 'session-complete' : 'generic';/u,
  );
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
  const completeBranch = screen.slice(
    screen.indexOf("emptyState === 'session-complete'"),
    screen.indexOf("emptyState === 'generic'"),
  );

  assert.doesNotMatch(emptyState, /hiddenUntil|gradedAt|set[A-Z]|update|delete|splice|push/u);
  assert.doesNotMatch(completeBranch, /hiddenUntil|gradedAt|set[A-Z]|update|delete/u);
});
