import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IDLE_FLIP_GESTURE,
  reduceFlipGesture,
  shouldFlipOnPress,
  type FlipGestureEvent,
} from '../../src/features/cards/flipGesture';

/**
 * Tap-to-flip versus long-press-to-copy on a card face.
 *
 * Each case is a sequence of the events React Native's Pressability delivers,
 * run through the same reducer `CardScrollFace` uses. "Did the card flip?" is
 * therefore answered by the real rule rather than by a description of it.
 */

/** Replays a gesture sequence and reports every flip it would have caused. */
function flips(...events: FlipGestureEvent[]): number {
  let state = IDLE_FLIP_GESTURE;
  let count = 0;
  for (const event of events) {
    state = reduceFlipGesture(state, event);
    if (event === 'press' && shouldFlipOnPress(state)) count += 1;
  }
  return count;
}

/** A tap: touch down, release. */
const TAP: FlipGestureEvent[] = ['press-in', 'press'];
/** A hold long enough for the platform to report a long press, then release. */
const LONG_PRESS: FlipGestureEvent[] = ['press-in', 'long-press', 'press'];

// ── 1–2: an ordinary tap still flips, on either side ─────────────────────────

test('1. a short tap on the front flips the card to the back', () => {
  assert.equal(flips(...TAP), 1);
});

test('2. a short tap on the back flips the card to the front', () => {
  // The same face component renders both sides, so one rule governs both and a
  // tap is a flip regardless of which side is showing.
  assert.equal(flips(...TAP), 1);
});

// ── 3–5: a long press copies and never flips ─────────────────────────────────

test('3. long-pressing the front word does not flip the card', () => {
  assert.equal(flips(...LONG_PRESS), 0);
});

test('4. long-pressing the back meaning does not flip the card', () => {
  assert.equal(flips(...LONG_PRESS), 0);
});

test('5. long-pressing the back note does not flip the card', () => {
  // Meaning and note sit inside the same Pressable, so a hold on either is the
  // same gesture to this rule.
  assert.equal(flips(...LONG_PRESS), 0);
});

test('a release without the long press being reported still flips', () => {
  // The ordinary path: nothing about this rule slows down or second-guesses a
  // normal tap, because only an actual `long-press` event changes the outcome.
  assert.equal(shouldFlipOnPress(reduceFlipGesture(IDLE_FLIP_GESTURE, 'press')), true);
});

// ── 6–7: the Copy menu leaves the card where it is ───────────────────────────

test('6. dismissing the Copy menu leaves the card on the same side', () => {
  // Closing the menu can deliver a stray press to the face underneath. The
  // gesture is still the long-pressed one, so it cannot flip.
  assert.equal(flips('press-in', 'long-press', 'press', 'press'), 0);
});

test('7. tapping Copy leaves the card on the same side', () => {
  // Same shape as dismissing: whatever presses arrive before the next touch
  // begins belong to the gesture that was a long press.
  assert.equal(flips('press-in', 'long-press', 'press', 'press', 'press'), 0);
});

// ── 8: tap-to-flip is never disabled beyond its own gesture ──────────────────

test('8. a normal tap after using Copy flips the card again', () => {
  assert.equal(flips(...LONG_PRESS, ...TAP), 1);
});

test('tap-to-flip survives any number of long presses', () => {
  assert.equal(flips(...LONG_PRESS, ...LONG_PRESS, ...TAP, ...LONG_PRESS, ...TAP), 2);
});

test('a new touch resets the gesture even if the last one never released', () => {
  // A press cancelled by a scroll or a swipe emits no `press`; the next
  // `press-in` must still start from a clean state.
  assert.equal(flips('press-in', 'long-press', 'press-in', 'press'), 1);
});

test('a repeated long press within one gesture stays one long press', () => {
  const held = reduceFlipGesture(
    reduceFlipGesture(reduceFlipGesture(IDLE_FLIP_GESTURE, 'press-in'), 'long-press'),
    'long-press',
  );
  assert.equal(held.longPressed, true);
  assert.equal(shouldFlipOnPress(held), false);
});

test('the rule reads no clock, so a slow tap is still a tap', () => {
  // The reducer takes only the events it is given. There is no duration in the
  // state and no threshold in the module, which is what keeps an ordinary but
  // unhurried tap from being reclassified as a hold.
  assert.deepEqual(Object.keys(IDLE_FLIP_GESTURE), ['longPressed']);
  assert.equal(typeof IDLE_FLIP_GESTURE.longPressed, 'boolean');
});
