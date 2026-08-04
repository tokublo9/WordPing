/**
 * Geometry for the Flip screen's progress scrubber.
 *
 * The thumb's centre travels 0…trackW. Card `i` of `count` sits at
 * `scrubberXForIndex(i)`, and those same positions are where the tick marks are drawn,
 * so the card on screen changes exactly as the thumb passes a tick.
 *
 * Kept free of react-native imports so the maths is unit testable.
 */

/** Track position of a card's tick mark. */
export function scrubberXForIndex(index: number, count: number, trackW: number): number {
  if (count <= 1) return 0;
  const clamped = Math.max(0, Math.min(count - 1, index));
  return (clamped / (count - 1)) * trackW;
}

/**
 * Card shown for a thumb position. Rounds to the nearest tick, so the card commits as
 * the thumb crosses the midpoint between two ticks and lands on the tick it displays.
 */
export function scrubberIndexForX(x: number, count: number, trackW: number): number {
  if (count <= 1 || trackW <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, x / trackW));
  return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
}
