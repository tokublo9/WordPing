const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

/**
 * The left-swipe reveal on a word row.
 *
 * Three circles, in order: Hide Front Word, Edit, Delete. Move was a fourth and
 * is now reached from the Add/Edit sheet instead. The width is pinned with them,
 * because `actionBg` is a fixed size — a width still sized for four would open
 * onto a blank strip where the removed icon used to be.
 */

const revealOf = source => source.slice(
  source.indexOf('{/* Swipe reveal'),
  source.indexOf('<Animated.View', source.indexOf('{/* Swipe reveal')),
);

test('the reveal holds exactly three actions, and Move is not one of them', () => {
  const reveal = revealOf(read('src/components/SwipeableCard.tsx'));

  assert.equal((reveal.match(/styles\.circleBtn/gu) ?? []).length, 3);
  assert.match(reveal, /name=\{wordHidden \? 'eye-off' : 'eye-outline'\}/u);
  assert.match(reveal, /name="create-outline"/u);
  assert.match(reveal, /name="trash-outline"/u);

  assert.doesNotMatch(reveal, /folder-outline/u, 'the Move icon is gone');
  assert.doesNotMatch(reveal, /onMove/u, 'and so is its action');
});

test('the row no longer takes a move handler at all', () => {
  // Removed rather than passed and ignored, so nothing can quietly re-add a
  // control for it.
  const swipeable = read('src/components/SwipeableCard.tsx');
  assert.doesNotMatch(swipeable, /\bonMove\b(?!ShouldSet)/u);
  assert.doesNotMatch(
    read('src/screens/WordListScreen/WordListScreen.tsx'),
    /onMove=\{\(\) => currentActions\.onMove/u,
  );
});

test('the reveal is only as wide as the actions left in it', () => {
  // 14 left padding + three 44pt circles + two 10pt gaps. The circles are laid
  // out with space-between against this width, so it is what decides whether
  // they sit at the same spacing as before or drift apart.
  assert.match(read('src/constants.ts'), /export const REVEAL_WIDTH = 166;/u);

  const swipeable = read('src/components/SwipeableCard.tsx');
  const style = swipeable.slice(swipeable.indexOf('actionBg: {'), swipeable.indexOf('circleBtn: {'));
  assert.match(style, /width: REVEAL_WIDTH,/u);
  assert.match(style, /justifyContent: 'space-between',/u);
  assert.match(style, /paddingLeft: 14,/u);
  assert.match(swipeable, /circleBtn: \{\s*width: 44, height: 44,/u);
});

test('folder move itself is untouched, including in the Add/Edit sheet', () => {
  // The sheet's Move row, the selection bar and Flip Mode all still reach the
  // same picker — only the row's shortcut went.
  const modal = read('src/components/WordModal.tsx');
  const actions = modal.slice(modal.indexOf('{/* Word actions'), modal.indexOf('{/* Review History'));
  assert.match(actions, /onPress=\{onMove\}/u);
  assert.match(actions, /name="folder-outline"/u);

  const app = read('App.tsx');
  assert.match(app, /openMovePicker\(\[editingCard\.id\]\)/u, 'the Add/Edit sheet');
  assert.match(app, /onMoveSelected: \(\) => openMovePicker\(\[\.\.\.selectedIds\]\)/u, 'the selection bar');
  assert.match(app, /onMove: openMovePicker,/u, 'Flip Mode');
  assert.match(read('src/features/folders/useFolders.ts'), /const moveCardsToFolder = \(targetFolderId: string\)/u);
  assert.match(read('src/screens/WordListScreen/WordListScreen.tsx'), /onMove=\{handleFlipMove\}/u);
});
