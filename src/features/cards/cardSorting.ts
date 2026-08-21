interface SortableCard {
  id: string;
  createdAt?: unknown;
  testLevel?: unknown;
  rating?: unknown;
}

const TEST_LEVEL_RATING: Record<string, number> = {
  unknown: 0,
  slightly: 1,
  good: 2,
  perfect: 3,
};

function finiteNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function legacyTimestampFromId(id: string): number | null {
  const match = id.match(/(?:^|-)(\d{10,13})(?:-|$)/u);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Persistent createdAt is authoritative. Legacy cards predate that field, so
 * they remain before newly timestamped cards and use an ID-derived, stable
 * fallback that cannot change after drag-and-drop or filtering.
 */
export function compareRegistrationOrder(a: SortableCard, b: SortableCard): number {
  const aCreatedAt = finiteNonNegativeNumber(a.createdAt);
  const bCreatedAt = finiteNonNegativeNumber(b.createdAt);
  if (aCreatedAt != null && bCreatedAt != null) {
    return aCreatedAt - bCreatedAt || compareIds(a.id, b.id);
  }
  if (aCreatedAt != null) return 1;
  if (bCreatedAt != null) return -1;

  const aLegacyTime = legacyTimestampFromId(a.id);
  const bLegacyTime = legacyTimestampFromId(b.id);
  if (aLegacyTime != null && bLegacyTime != null) {
    return aLegacyTime - bLegacyTime || compareIds(a.id, b.id);
  }
  return compareIds(a.id, b.id);
}

export function sortByRegistrationOrder<T extends SortableCard>(cards: readonly T[]): T[] {
  return [...cards].sort(compareRegistrationOrder);
}

/**
 * Return a new random order without mutating the input. A no-op shuffle is
 * rotated once so every explicit Random tap changes a list with 2+ cards.
 */
export function shuffleCards<T>(cards: readonly T[], random = Math.random): T[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const sampled = random();
    const normalized = Number.isFinite(sampled)
      ? Math.min(Math.max(sampled, 0), 0.9999999999999999)
      : 0;
    const swapIndex = Math.floor(normalized * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  if (shuffled.length > 1 && shuffled.every((card, index) => card === cards[index])) {
    shuffled.push(shuffled.shift() as T);
  }
  return shuffled;
}

/** Monotonic even when two registrations occur within the same millisecond. */
export function nextRegistrationTimestamp(cards: readonly SortableCard[], now = Date.now()): number {
  const latest = cards.reduce((maximum, card) => {
    const createdAt = finiteNonNegativeNumber(card.createdAt);
    return createdAt == null ? maximum : Math.max(maximum, createdAt);
  }, -1);
  const currentTime = finiteNonNegativeNumber(now) ?? 0;
  return Math.max(Math.floor(currentTime), Math.floor(latest) + 1);
}

export function getCardRating(card: SortableCard): number | null {
  // Numeric zero is a real rating. Nullish/empty/dedicated `none` values fall
  // through to testLevel or remain unrated.
  const numericRating = finiteNonNegativeNumber(card.rating);
  if (numericRating != null) return numericRating;
  const numericLevel = finiteNonNegativeNumber(card.testLevel);
  if (numericLevel != null) return numericLevel;
  return typeof card.testLevel === 'string'
    ? (TEST_LEVEL_RATING[card.testLevel] ?? null)
    : null;
}

export function sortByRating<T extends SortableCard>(
  cards: readonly T[],
  direction: 'highest' | 'lowest',
): T[] {
  return [...cards].sort((a, b) => {
    const aRating = getCardRating(a);
    const bRating = getCardRating(b);
    if (aRating == null && bRating == null) return compareRegistrationOrder(a, b);
    if (aRating == null) return 1;
    if (bRating == null) return -1;
    const ratingDifference = direction === 'lowest' ? aRating - bRating : bRating - aRating;
    return ratingDifference || compareRegistrationOrder(a, b);
  });
}

/** Preserve hidden-card slots while applying a visible drag result. */
export function mergeVisibleCardOrder<T extends { id: string }>(
  allCards: readonly T[],
  reorderedVisibleCards: readonly T[],
): T[] {
  const visibleIds = new Set(reorderedVisibleCards.map(card => card.id));
  let visibleIndex = 0;
  return allCards.map(card => visibleIds.has(card.id)
    ? reorderedVisibleCards[visibleIndex++] ?? card
    : card);
}
