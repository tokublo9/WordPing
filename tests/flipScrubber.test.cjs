const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScriptModule(path) {
  const source = fs.readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

const { scrubberXForIndex, scrubberIndexForX } =
  loadTypeScriptModule('src/features/cards/flipScrubber.ts');

const TRACK = 300;

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('tick positions span the track and are evenly spaced', () => {
  assert.equal(scrubberXForIndex(0, 5, TRACK), 0);
  assert.equal(scrubberXForIndex(4, 5, TRACK), TRACK);
  assert.equal(scrubberXForIndex(2, 5, TRACK), TRACK / 2);
  const gaps = [1, 2, 3, 4].map(i =>
    scrubberXForIndex(i, 5, TRACK) - scrubberXForIndex(i - 1, 5, TRACK));
  for (const gap of gaps) assert.equal(gap, TRACK / 4);
  // A single card has nowhere to travel.
  assert.equal(scrubberXForIndex(0, 1, TRACK), 0);
  assert.equal(scrubberXForIndex(3, 1, TRACK), 0);
  // Out-of-range indices clamp instead of running off the track.
  assert.equal(scrubberXForIndex(-2, 5, TRACK), 0);
  assert.equal(scrubberXForIndex(99, 5, TRACK), TRACK);
});

test('a thumb parked on a tick shows that tick\'s card', () => {
  for (const count of [2, 5, 17, 120]) {
    for (let i = 0; i < count; i += 1) {
      const x = scrubberXForIndex(i, count, TRACK);
      assert.equal(scrubberIndexForX(x, count, TRACK), i, `count ${count}, index ${i}`);
    }
  }
});

test('the card commits as the thumb crosses the midpoint between ticks', () => {
  const count = 5;
  const step = TRACK / (count - 1);
  // Just before the midpoint the previous card still shows; just past it the next one
  // does — the card changes on reaching the tick, not on release.
  assert.equal(scrubberIndexForX(step * 0.5 - 0.01, count, TRACK), 0);
  assert.equal(scrubberIndexForX(step * 0.5 + 0.01, count, TRACK), 1);
  assert.equal(scrubberIndexForX(step * 1.5 + 0.01, count, TRACK), 2);
  // Positions beyond either end clamp to the first and last card.
  assert.equal(scrubberIndexForX(-500, count, TRACK), 0);
  assert.equal(scrubberIndexForX(TRACK + 500, count, TRACK), count - 1);
  // Degenerate inputs never produce NaN or a negative index.
  assert.equal(scrubberIndexForX(120, 1, TRACK), 0);
  assert.equal(scrubberIndexForX(120, 5, 0), 0);
});

test('the thumb has a large touch target around an unchanged circle', () => {
  const source = read('src/components/FlipCardBrowser.tsx');
  // Visible circle is still 18pt; only the invisible target grew.
  assert.match(source, /thumb: \{\s*width: 18,\s*height: 18,\s*borderRadius: 9,\s*\}/u);
  const hit = Number(/const THUMB_HIT_SIZE = (\d+);/u.exec(source)[1]);
  assert.ok(hit >= 44, `touch target ${hit}pt should meet the 44pt minimum`);
  assert.match(
    source,
    /thumbHit: \{[\s\S]*?width: THUMB_HIT_SIZE,\s*height: THUMB_HIT_SIZE,[\s\S]*?\}/u,
  );
  // The pan handlers live on the target, not on the small circle.
  assert.match(source, /style=\{\[\s*s\.thumbHit[\s\S]*?\{\.\.\.progressPan\.panHandlers\}/u);
  // iOS will not hit-test outside the parent, so the wrapper carries matching slack and
  // the surrounding margins shed it again — the track must not move.
  assert.match(source, /width: FLIP_CARD_W \+ THUMB_HIT_SIZE,\s*height: THUMB_HIT_SIZE,/u);
  assert.match(source, /marginHorizontal: -HIT_PAD,/u);
  // The invariant: the elements above and below the scrubber row shed the slack it
  // gained, so the track keeps its old baseline. Above is progressWrap's own marginTop;
  // below is whichever element follows it — the action row.
  assert.equal((hit - 26) / 2, 9);
  assert.match(source, /progressWrap: \{[\s\S]*?marginTop: 20 - HIT_OVERHANG,/u);
  assert.match(source, /actionRow: \{[\s\S]*?marginTop: 20 - HIT_OVERHANG,/u);
});

test('press and hold shows a tick per card and dragging updates the card live', () => {
  const source = read('src/components/FlipCardBrowser.tsx');
  // Claimed on touch down, so a hold owns the gesture before any movement, and nothing
  // can steal it mid-drag.
  assert.match(source, /onStartShouldSetPanResponder: \(\) => true/u);
  assert.match(source, /onPanResponderTerminationRequest: \(\) => false/u);
  // Ticks appear on grant and are removed when the gesture ends.
  assert.match(source, /onPanResponderGrant: \(\) => \{[\s\S]*?setScrubbing\(true\)/u);
  assert.match(source, /onPanResponderRelease: \(\) => \{[\s\S]*?setScrubbing\(false\)/u);
  assert.match(source, /onPanResponderTerminate: \(\) => \{[\s\S]*?setScrubbing\(false\)/u);
  assert.match(source, /\{scrubbing && \(\s*<View style=\{s\.tickLayer\} pointerEvents="none">/u);
  // One tick per card, positioned by the same geometry the thumb uses.
  assert.match(source, /Array\.from\(\{ length: n \}, \(_, i\) => \(/u);
  assert.match(source, /left: HIT_PAD \+ xForIndex\(i, n\) - TICK_W \/ 2/u);
  // The thumb follows the finger continuously while the card commits per tick, and it
  // does so by writing the one value that already drives the circle — not by swapping
  // a second animated node in for the duration of the drag.
  assert.match(source, /setThumbX\(x\);[\s\S]*?const target = indexForX\(x, n\);/u);
  assert.match(
    source,
    /const setThumbX = useCallback\(\(x: number\) => \{\s*thumbXRef\.current = x;\s*thumbX\.setValue\(x\);/u,
  );
  // A drag can never carry the thumb past the last card's tick — on a one-card list
  // that tick is 0, so the circle cannot leave its only position.
  assert.match(source, /const maxX = xForIndex\(n - 1, n\);\s*const x = Math\.max\(0, Math\.min\(maxX, dragStartXRef\.current \+ dx\)\);/u);
  assert.match(source, /if \(target !== scrubIdxRef\.current\) \{[\s\S]*?scrubIdxRef\.current = target;[\s\S]*?goToRef\.current\(target, false\);/u);
  // Ticks are built per card count, so a drag never rebuilds them.
  assert.match(source, /const ticks = useMemo\([\s\S]*?\[cards\.length, pal\.sub\]\)/u);
});

test('tapping anywhere on the track jumps to that card', () => {
  const source = read('src/components/FlipCardBrowser.tsx');
  // A full-bleed tap layer over the whole padded wrapper, so both ends are reachable.
  assert.match(
    source,
    /trackTap: \{\s*position: 'absolute',\s*left: 0,\s*right: 0,\s*top: 0,\s*bottom: 0,\s*\}/u,
  );
  assert.match(source, /<View style=\{s\.trackTap\} \{\.\.\.trackTapPan\.panHandlers\} \/>/u);
  // The tap position is converted with the same geometry the thumb and ticks use, so
  // all three agree on which card a given x means.
  assert.match(source, /tapXRef\.current = event\.nativeEvent\.locationX - HIT_PAD;/u);
  assert.match(
    source,
    /onPanResponderRelease: \(\) => \{\s*const target = indexForX\(tapXRef\.current, cardsLenRef\.current\);\s*if \(target !== idxRef\.current\) goToRef\.current\(target\);/u,
  );
  // The thumb's responder is declared after the tap layer, so it renders on top and
  // owns any touch that starts on the thumb — a drag is never read as a track tap.
  assert.ok(
    source.indexOf('s.trackTap') < source.indexOf('s.thumbHit'),
    'the tap layer must sit under the thumb',
  );
  // goTo drives `idx`, which the counter renders and the sync effect feeds to the thumb,
  // so card, indicator and thumb all move from that one call.
  assert.match(source, /\{`\$\{idx \+ 1\} \/ \$\{cards\.length\}`\}/u);
});

test('taps past either end of the track clamp to the first and last card', () => {
  // The tap layer extends HIT_PAD beyond both ends of the track, so those x values are
  // negative or greater than the track width and must clamp rather than wrap.
  const count = 24;
  assert.equal(scrubberIndexForX(-22, count, TRACK), 0);
  assert.equal(scrubberIndexForX(-1, count, TRACK), 0);
  assert.equal(scrubberIndexForX(TRACK + 1, count, TRACK), count - 1);
  assert.equal(scrubberIndexForX(TRACK + 22, count, TRACK), count - 1);
});

test('the card position indicator sits above the word card', () => {
  const source = read('src/components/FlipCardBrowser.tsx');
  const counter = source.indexOf('s.counter');
  const progress = source.indexOf('s.progressWrap');
  const deck = source.indexOf('s.deckWrap');
  const actions = source.indexOf('s.actionRow');
  assert.ok(counter < deck, 'the indicator comes before the card');
  assert.ok(deck < progress, 'the card before the scrollbar');
  assert.ok(progress < actions, 'and the scrollbar before the action buttons');
  // Original spacing: a gap below the indicator, separating it from the card.
  assert.match(source, /counter: \{[\s\S]*?marginBottom: 16,\s*\}/u);
  assert.doesNotMatch(source, /counter: \{[^}]*marginTop/u);
});

test('the index sync does not fight the finger mid-drag', () => {
  const source = read('src/components/FlipCardBrowser.tsx');
  // Committing a card sets `idx`; without this guard the effect would snap the thumb
  // onto that card's tick while the finger is still moving.
  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*?if \(scrubbingRef\.current\) return;\s*setThumbX\(xForIndex\(idx, cards\.length\)\);/u,
  );
  // `goTo` commits a card on every tick the drag crosses, so it has to stand aside too.
  assert.match(source, /if \(!scrubbingRef\.current\) setThumbX\(xForIndex\(target, c\.length\)\);/u);
  // Release settles on the tick whose card is showing, so thumb and card never disagree.
  assert.match(
    source,
    /const target = scrubIdxRef\.current;[\s\S]*?setThumbX\(xForIndex\(target, n\)\);/u,
  );
  // A cancelled gesture returns the thumb to the card that is actually on screen.
  assert.match(
    source,
    /onPanResponderTerminate: \(\) => \{[\s\S]*?setThumbX\(xForIndex\(idxRef\.current, cardsLenRef\.current\)\);/u,
  );
});

test('card navigation moves the circle through the same value a drag writes', () => {
  const source = read('src/components/FlipCardBrowser.tsx');
  // A settled swipe, a track tap and a scrubber release all end in setThumbX, so the
  // circle can never disagree with the card or with the `n / total` counter.
  assert.match(source, /setThumbX\(xForIndex\(newIdx, c\.length\)\);/u);
  // ...and during a swipe the circle tracks the finger through the shared graph rather
  // than waiting for the animation to land.
  assert.match(source, /Animated\.add\(thumbX, Animated\.multiply\(swipeX, -step \/ SCREEN_W\)\)/u);
});
