/**
 * Whether a completed press on a card face should flip it.
 *
 * A card face whose text is selectable has two gestures layered on the same
 * pixels: a tap flips the card, and a long press starts the OS text selection
 * and its Copy menu. React Native's `Pressable` reports both, and on release it
 * reports `onPress` — so without this, holding a word to copy it also flipped
 * the card out from under the selection.
 *
 * The rule is per-gesture, not time-based: a press that became a long press
 * cannot also be a flip. Nothing here reads a clock or a duration, so an
 * ordinary tap is never at risk of being misread as a hold.
 *
 * Pure — no react-native import — so the sequences below are tested directly
 * rather than by holding a finger on a simulator.
 */

export interface FlipGesture {
  /** Set when the current gesture was reported as a long press. */
  longPressed: boolean;
}

/** No gesture in progress. Also the state every new press starts from. */
export const IDLE_FLIP_GESTURE: FlipGesture = { longPressed: false };

export type FlipGestureEvent =
  /** Pressability's `onPressIn` — a new gesture is starting. */
  | 'press-in'
  /** Pressability's `onLongPress` — the hold passed the platform threshold. */
  | 'long-press'
  /** Pressability's `onPress` — the gesture completed on this face. */
  | 'press';

/**
 * Advances the gesture state.
 *
 * `press-in` is the only reset. That matters for the Copy menu: dismissing it
 * or tapping Copy can deliver a stray `press` to the face underneath, and
 * because the state is still "long pressed" that press cannot flip the card.
 * The next real touch begins with `press-in` and behaves completely normally.
 */
export function reduceFlipGesture(state: FlipGesture, event: FlipGestureEvent): FlipGesture {
  switch (event) {
    case 'press-in':
      return IDLE_FLIP_GESTURE;
    case 'long-press':
      return state.longPressed ? state : { longPressed: true };
    case 'press':
      return state;
  }
}

/** True only for a press that never became a long press. */
export function shouldFlipOnPress(state: FlipGesture): boolean {
  return !state.longPressed;
}
