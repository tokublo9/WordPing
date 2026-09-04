/**
 * Whether a card's front text is hidden.
 *
 * Hide Word is available on every plan. Keeping this small shared predicate
 * makes List, Flip, Test and the editor read the stored per-word flag in exactly
 * the same way without involving subscription state.
 */
export function isWordTextHidden(
  card: { hideWord?: boolean } | null | undefined,
): boolean {
  return card?.hideWord === true;
}
