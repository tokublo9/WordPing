const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = path => fs.readFileSync(path, 'utf8');

test('Reorder exposes only Registration order and Random preset buttons', () => {
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const toolbar = screen.match(/<View key="reorder-toolbar"[\s\S]*?<ReorderableList/u)?.[0] ?? '';

  assert.equal((toolbar.match(/<TouchableOpacity/gu) ?? []).length, 2);
  assert.match(toolbar, /onPress=\{reorder\.onRegistrationOrder\}/u);
  assert.match(toolbar, /onPress=\{reorder\.onRandomOrder\}/u);
  assert.match(toolbar, /name="list-outline"/u);
  assert.match(toolbar, /name="shuffle-outline"/u);
  assert.doesNotMatch(toolbar, /reorder_sort_best_first|reorder_sort_least_first|onSortByLevel/u);
});

test('Reorder preset borders wrap their icon and localized label', () => {
  const screen = read('src/screens/WordListScreen/WordListScreen.tsx');
  const toolbarStyle = screen.match(/toolbar: \{([\s\S]*?)\n  \},\n  presetBtn:/u)?.[1] ?? '';
  const buttonStyle = screen.match(/presetBtn: \{([\s\S]*?)\n  \},\n  presetText:/u)?.[1] ?? '';
  const textStyle = screen.match(/presetText: \{([\s\S]*?)\n  \},\n  headerActions:/u)?.[1] ?? '';
  const i18n = read('src/i18n.ts');

  assert.doesNotMatch(buttonStyle, /\bflex\s*:|\bflexGrow\s*:|\bwidth\s*:|\bminWidth\s*:/u);
  assert.doesNotMatch(textStyle, /\bflexShrink\s*:/u);
  assert.match(buttonStyle, /paddingHorizontal: 12/u);
  assert.match(toolbarStyle, /flexDirection: 'row'/u);
  assert.match(toolbarStyle, /justifyContent: 'center'/u);
  assert.match(toolbarStyle, /gap: 4/u);
  assert.match(i18n, /reorder_registration_order: 'Registration order',\s*reorder_random: 'Random'/u);
  assert.match(i18n, /reorder_registration_order: '登録順',\s*reorder_random: 'ランダム'/u);
});

test('Reorder keeps changes local until Save and discards them on Cancel or navigation', () => {
  const useCards = read('src/features/cards/useCards.ts');
  const app = read('App.tsx');
  const replace = useCards.match(/const replaceFolderOrder = useCallback\([\s\S]*?\n  \}, \[allFolderCards\]\);/u)?.[0] ?? '';
  const save = useCards.match(/const exitReorderMode = \(\) => \{([\s\S]*?)\n  \};/u)?.[1] ?? '';
  const cancel = useCards.match(/const cancelReorderMode = \(\) => \{([\s\S]*?)\n  \};/u)?.[1] ?? '';

  assert.match(replace, /setPendingFolderCards/u);
  assert.doesNotMatch(replace, /setCards/u);
  assert.match(save, /setCards\(previous =>/u);
  assert.match(save, /mergeVisibleCardOrder\(currentFolderCards, pendingFolderCards\)/u);
  assert.match(cancel, /setPendingFolderCards\(null\)/u);
  assert.doesNotMatch(cancel, /setCards/u);
  assert.equal((app.match(/cancelReorderMode\(\);/gu) ?? []).length, 2);
});

test('Random runs only on an explicit tap and Registration order does not modify timestamps', () => {
  const useCards = read('src/features/cards/useCards.ts');
  const randomHandler = useCards.match(/const handleRandomOrder = \(\) => \{([\s\S]*?)\n  \};/u)?.[1] ?? '';
  const registrationHandler = useCards.match(/const handleRegistrationOrder = \(\) => \{([\s\S]*?)\n  \};/u)?.[1] ?? '';

  assert.equal((useCards.match(/shuffleCards\(/gu) ?? []).length, 1);
  assert.match(randomHandler, /setPendingFolderCards/u);
  assert.match(randomHandler, /shuffleCards\(filteredFolderCards\)/u);
  assert.match(registrationHandler, /sortByRegistrationOrder\(filteredFolderCards\)/u);
  assert.doesNotMatch(`${randomHandler}\n${registrationHandler}`, /createdAt|setCards/u);
});
