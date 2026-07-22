export type GestureDirection = 'pending' | 'horizontal' | 'vertical';

// Resolve below the native ScrollView's usual touch slop. Whichever axis is
// dominant at this point owns the full touch interaction until release.
const DIRECTION_LOCK_DISTANCE = 4;

export function lockGestureDirection(
  current: GestureDirection,
  dx: number,
  dy: number,
): GestureDirection {
  if (current !== 'pending') return current;

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < DIRECTION_LOCK_DISTANCE) return 'pending';

  return absX > absY ? 'horizontal' : 'vertical';
}
