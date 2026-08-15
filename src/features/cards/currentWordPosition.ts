import type { WordCard } from '../../types';

/** Resolve a stable word ID in the current displayed order, with a nearest-index fallback. */
export function resolveCurrentWordIndex(
  cards: readonly WordCard[],
  currentWordId: string | null,
  fallbackIndex = 0,
  previousCards: readonly WordCard[] = cards,
): number {
  if (cards.length === 0) return -1;

  if (currentWordId) {
    const currentIndex = cards.findIndex(card => card.id === currentWordId);
    if (currentIndex >= 0) return currentIndex;

    // When filtering or deletion removes the current word, walk outward from its old
    // position and choose the closest ID that still exists in the new displayed order.
    const previousIndex = previousCards.findIndex(card => card.id === currentWordId);
    if (previousIndex >= 0) {
      const newIndexesById = new Map(cards.map((card, index) => [card.id, index]));
      for (let distance = 1; distance < previousCards.length; distance += 1) {
        const nextId = previousCards[previousIndex + distance]?.id;
        if (nextId && newIndexesById.has(nextId)) return newIndexesById.get(nextId)!;
        const previousId = previousCards[previousIndex - distance]?.id;
        if (previousId && newIndexesById.has(previousId)) return newIndexesById.get(previousId)!;
      }
    }
  }

  return Math.max(0, Math.min(Math.trunc(fallbackIndex), cards.length - 1));
}
