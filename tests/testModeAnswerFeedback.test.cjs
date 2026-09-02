const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const SCREEN = 'src/components/TestModeScreen.tsx';
const WORD_LIST = 'src/screens/WordListScreen/WordListScreen.tsx';
const GRADING = 'src/features/cards/grading.ts';
const REDUCE_MOTION = 'src/hooks/useReduceMotion.ts';

/** The colour-filter row: the chips and the Test button beside them. */
function filterBar(source) {
  return source.slice(
    source.indexOf('const filterBar ='),
    source.indexOf('// ── Card list content'),
  );
}

// ── 1. The colour filter marks the count that just went up ───────────────────

test('each result chip owns an animated value, created once', () => {
  const wordList = read(WORD_LIST);

  // One value per filter key, held in a ref so a flash repaints the chip
  // instead of re-rendering the screen, and so the values survive the
  // re-render the changed count itself causes.
  assert.match(wordList, /useRef<Record<LevelFilterKey, Animated\.Value> \| null>\(null\)/u);
  for (const level of ['good', 'slightly', 'unknown', 'none']) {
    assert.match(
      wordList,
      new RegExp(`${level}: new Animated\\.Value\\(0\\)`, 'u'),
      `${level} needs its own flash value`,
    );
  }
});

test('only a count that increased is flashed, and only during a test', () => {
  const wordList = read(WORD_LIST);

  // Previous counts are kept so the effect can tell an increase from the
  // decrease that happens on the same answer: grading an untested card raises
  // its result category and lowers the grey untested one.
  assert.match(wordList, /const prevLevelCounts = useRef\(levelCounts\);/u);
  assert.match(
    wordList,
    /const risen = ALL_LEVEL_KEYS\.filter\(level => levelCounts\[level\] > prev\[level\]\);/u,
  );
  assert.match(wordList, /if \(risen\.length === 0\) return;/u);

  // Restricted to a running test. Adding, importing or restoring words also
  // raises the untested count, and none of those is an answer being given.
  assert.match(wordList, /if \(!testMode\.active\) return;/u);
  assert.match(wordList, /\}, \[levelCounts, testMode\.active\]\);/u);

  // The previous flash is stopped rather than left to overlap a new one, and
  // nothing is left running after the screen goes away.
  assert.match(wordList, /chipFlashAnim\.current\?\.stop\(\);/u);
  assert.match(wordList, /useEffect\(\(\) => \(\) => chipFlashAnim\.current\?\.stop\(\), \[\]\);/u);
});

test('the flash is a swell and a colour fill, driven natively', () => {
  const wordList = read(WORD_LIST);
  const bar = filterBar(wordList);

  // In then out, so the chip returns to its resting appearance on its own.
  assert.match(
    wordList,
    /Animated\.sequence\(\[\s*Animated\.timing\(value, \{ toValue: 1, duration: CHIP_FLASH_IN_MS, useNativeDriver: true \}\),\s*Animated\.timing\(value, \{ toValue: 0, duration: CHIP_FLASH_OUT_MS, useNativeDriver: true \}\),/u,
  );
  assert.match(wordList, /const CHIP_FLASH_IN_MS = \d+;/u);
  assert.match(wordList, /const CHIP_FLASH_OUT_MS = \d+;/u);

  // The swell wraps the chip; the tint sits inside it.
  assert.match(bar, /outputRange: \[1, CHIP_FLASH_SCALE\]/u);
  assert.match(bar, /outputRange: \[0, CHIP_FLASH_TINT_OPACITY\]/u);
  assert.match(bar, /style=\{\[\s*filterStyles\.chipFlash,/u);
  assert.match(wordList, /chipFlash: \{\s*position: 'absolute',/u);

  // The tint is behind the icon and the number and cannot take a touch.
  assert.match(bar, /<Animated\.View\s*pointerEvents="none"\s*style=\{\[\s*filterStyles\.chipFlash/u);
  const chipJsx = bar.slice(bar.indexOf('filterStyles.chipFlash'));
  assert.ok(
    chipJsx.indexOf('<Ionicons') > 0 && chipJsx.indexOf('filterStyles.chipCount') > 0,
    'the tint must be rendered before the icon and the count',
  );

  // No JS-driven colour interpolation: both halves of the flash are opacity and
  // transform, so the row stays smooth while the list below it is live.
  const flashEffect = wordList.slice(
    wordList.indexOf('const risen = ALL_LEVEL_KEYS'),
    wordList.indexOf('chipFlashAnim.current.start();'),
  );
  assert.doesNotMatch(flashEffect, /useNativeDriver: false/u);
});

test('Reduce Motion keeps the mark and drops the movement', () => {
  const wordList = read(WORD_LIST);
  const bar = filterBar(wordList);

  assert.match(wordList, /const reduceMotion = useReduceMotion\(\);/u);
  // The scale wrapper is what is dropped — the colour fill still runs, so the
  // count that changed is still pointed at.
  assert.match(bar, /style=\{reduceMotion \? undefined : \{\s*transform: \[\{/u);
});

// ── 2. Perfect takes the card out of the test, visibly ───────────────────────

test('Perfect gets an exit animation the other answers do not', () => {
  const screen = read(SCREEN);

  assert.match(screen, /const leavesTest = kind === 'perfect' && !reduceMotion;/u);
  // Shrinks and lifts away, rather than dissolving where it stands.
  assert.match(
    screen,
    /const exit = leavesTest\s*\? Animated\.parallel\(\[/u,
  );
  for (const [value, target] of [
    ['cardOpacity', '0'],
    ['cardScale', 'PERFECT_EXIT_SCALE'],
    ['cardLift', 'PERFECT_EXIT_LIFT'],
  ]) {
    assert.match(
      screen,
      new RegExp(
        `Animated\\.timing\\(${value}, \\{\\s*toValue: ${target}, duration: PERFECT_EXIT_MS,[\\s\\S]{0,80}useNativeDriver: true,`,
        'u',
      ),
      `the Perfect exit must animate ${value}`,
    );
  }

  // Every other answer keeps the card in the test and keeps the plain fade.
  assert.match(
    screen,
    /: Animated\.timing\(cardOpacity, \{\s*toValue: 0, duration: ADVANCE_FADE_OUT_MS, useNativeDriver: true,\s*\}\);/u,
  );
  assert.ok(
    Number(/const PERFECT_EXIT_MS = (\d+);/u.exec(screen)[1])
      > Number(/const ADVANCE_FADE_OUT_MS = (\d+);/u.exec(screen)[1]),
    'the exit has to last longer than the ordinary swap to read as different',
  );
});

test('the departing card leaves nothing behind for the next one', () => {
  const screen = read(SCREEN);

  // The wrapper actually carries both, or the animation would run on values
  // nothing is reading.
  assert.match(
    screen,
    /opacity: cardOpacity,\s*transform: \[\{ scale: cardScale \}, \{ translateY: cardLift \}\],/u,
  );

  // Reset inside the completion callback, before the next card is shown, so it
  // fades in at full size in the card slot.
  assert.match(
    screen,
    /exit\.start\(\(\) => \{[\s\S]*?cardScale\.setValue\(1\);\s*cardLift\.setValue\(0\);[\s\S]*?setIdx\(i => i \+ 1\);/u,
  );
  // Shuffle and Reset rebuild the queue from card 0, so they clear it too.
  assert.match(
    screen,
    /cardOpacity\.setValue\(1\);\s*cardScale\.setValue\(1\);\s*cardLift\.setValue\(0\);/u,
  );
});

test('the animation decorates the grade and never decides it', () => {
  const screen = read(SCREEN);
  const grading = read(GRADING);

  // The grade is written before anything animates, so a card is graded even if
  // the callback never runs.
  const advance = screen.slice(
    screen.indexOf('const advance = useCallback'),
    screen.indexOf('// ── Layout'),
  );
  assert.ok(
    advance.indexOf('onDeleteCard(card.id)') < advance.indexOf('const exit ='),
    'the grade must be applied before the exit animation starts',
  );
  // The rule module stays pure — no presentation crossed into it.
  assert.doesNotMatch(grading, /Animated|reduceMotion|useNativeDriver/u);
});

// ── 3. The reduce-motion hook is shared, not copied ──────────────────────────

test('Reduce Motion is read in one place', () => {
  const hook = read(REDUCE_MOTION);
  assert.match(hook, /export function useReduceMotion\(\): boolean/u);
  assert.match(hook, /AccessibilityInfo\.isReduceMotionEnabled\(\)/u);
  assert.match(hook, /addEventListener\('reduceMotionChanged', setReduce\)/u);
  // Subscription torn down, and a late resolve after unmount ignored.
  assert.match(hook, /return \(\) => \{ alive = false; sub\.remove\(\); \};/u);

  // Every caller imports it rather than keeping a local copy.
  for (const path of [SCREEN, WORD_LIST, 'src/components/ProSheet.tsx']) {
    const source = read(path);
    assert.match(source, /import \{ useReduceMotion \} from '\.\.?\/[^']*hooks\/useReduceMotion';/u, path);
    assert.doesNotMatch(source, /function useReduceMotion/u, `${path} must not redefine the hook`);
  }
});
