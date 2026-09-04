const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('src/components/WordModal.tsx', 'utf8');

test('all three Word sheet fields use the same stationary-tap gate', () => {
  assert.equal((source.match(/<StationaryTapTextInput\b/gu) ?? []).length, 3);
  assert.equal((source.match(/scrollEnabled=\{false\}/gu) ?? []).length, 3);
});

test('an unfocused field never reaches the native input on touch-down', () => {
  assert.match(
    source,
    /onStartShouldSetPanResponderCapture: event => \{\s*if \(focusedRef\.current\) return false;[\s\S]*?return true;/u,
  );
  assert.match(source, /pointerEvents=\{focused \? 'auto' : 'none'\}/u);
  const gate = source.slice(
    source.indexOf('function StationaryTapTextInput'),
    source.indexOf('// ── TTS language options'),
  );
  const moveHandler = gate.slice(
    gate.indexOf('onPanResponderMove:'),
    gate.indexOf('onPanResponderRelease:'),
  );
  assert.doesNotMatch(gate, /onPanResponderGrant:[\s\S]*?\.focus\(/u);
  assert.doesNotMatch(moveHandler, /\.focus\(/u);
});

test('movement in either direction permanently cancels pending focus', () => {
  assert.match(source, /const FIELD_TAP_MOVEMENT_SLOP = 2/u);
  assert.match(
    source,
    /gesture\.numberActiveTouches !== 1\s*\|\| Math\.hypot\(gesture\.dx, gesture\.dy\) > FIELD_TAP_MOVEMENT_SLOP/u,
  );
  assert.match(source, /tapCancelledRef\.current = true/u);
  assert.match(
    source,
    /onPanResponderRelease: \(_event, gesture\) => \{[\s\S]*?if \(!tapCancelledRef\.current\) inputRef\.current\?\.focus\(\);/u,
  );
  assert.doesNotMatch(source, /FIELD_VERTICAL_DRAG_SLOP|Math\.abs\(gesture\.dy\) > Math\.abs\(gesture\.dx\)/u);
});

test('only a short single tap may focus, with no delayed focus callback', () => {
  assert.match(source, /const FIELD_TAP_MAX_DURATION_MS = 350/u);
  assert.match(source, /tapStartedAtRef\.current = Date\.now\(\)/u);
  assert.match(
    source,
    /Date\.now\(\) - tapStartedAtRef\.current > FIELD_TAP_MAX_DURATION_MS/u,
  );
  assert.doesNotMatch(source, /setTimeout\([^)]*focus|requestAnimationFrame\([^)]*focus/u);
});

test('a drag is yielded to the sheet and focused fields retain native editing', () => {
  assert.match(
    source,
    /onPanResponderTerminationRequest: \(\) => \{\s*tapCancelledRef\.current = true;\s*return true;/u,
  );
  assert.match(source, /onShouldBlockNativeResponder: \(\) => false/u);
  assert.match(source, /if \(focusedRef\.current\) return false/u);
  assert.match(source, /onFocus=\{event => \{\s*focusedRef\.current = true;\s*setFocused\(true\)/u);
  assert.match(source, /onBlur=\{event => \{\s*focusedRef\.current = false;\s*setFocused\(false\)/u);
  assert.doesNotMatch(source, /selectTextOnFocus|contextMenuHidden|caretHidden|editable=\{false\}/u);
});
