/**
 * Which of the Word List screen's two mode layers is visible.
 *
 * List and Flip both stay mounted, so this only decides visibility. During a
 * mode change, the current layer stays on screen while the hidden destination
 * restores its saved card or scroll position. Visibility then switches in one
 * render, so the user never sees the destination's corrective positioning
 * commit. A fresh screen can render its selected layer immediately.
 *
 * The earlier rule was `showFlip = !reorder.active && !showList`, which made
 * Flip the fallback for "the list has not reported its position yet". A freshly
 * mounted list has never reported its position, so every folder open rendered a
 * frame of Flip before the list appeared.
 */

export type ModeLayer = 'list' | 'flip';

export interface ModeLayerInput {
  cardViewMode: ModeLayer;
  /** Reorder always takes place in the list. */
  reorderActive: boolean;
  /** The list has confirmed it is showing the current word at the expected row. */
  listPositionPrepared: boolean;
  /** The mounted Flip deck has confirmed the current word is centred. */
  flipPositionPrepared?: boolean;
  /** The layer the user is looking at right now, or null on a fresh screen. */
  visibleLayer: ModeLayer | null;
}

export interface ModeLayerVisibility {
  showListLayer: boolean;
  showFlipLayer: boolean;
}

export function resolveModeLayers({
  cardViewMode,
  reorderActive,
  listPositionPrepared,
  flipPositionPrepared = false,
  visibleLayer,
}: ModeLayerInput): ModeLayerVisibility {
  const listIsTargetLayer = reorderActive || cardViewMode === 'list';
  const listLayerReady = reorderActive || (cardViewMode === 'list' && listPositionPrepared);
  const flipIsTargetLayer = !reorderActive && cardViewMode === 'flip';
  // A freshly mounted Flip deck derives its initial slot from currentWordId, so
  // it is ready on its first render. A deck hidden behind List may be stale and
  // must explicitly confirm its centred card before becoming visible.
  const flipLayerReady = flipIsTargetLayer
    && (flipPositionPrepared || visibleLayer !== 'list');

  // An already-visible Flip may cover a pending transition to List.
  const flipCoversModeChange = listIsTargetLayer && !listLayerReady && visibleLayer === 'flip';
  const showFlipLayer = !reorderActive && (flipLayerReady || flipCoversModeChange);
  // Symmetric with the Flip hold above: List stays visible while the hidden
  // Flip deck centres the destination card.
  const listCoversModeChange = flipIsTargetLayer && !flipLayerReady && visibleLayer === 'list';

  return {
    showFlipLayer,
    showListLayer: listCoversModeChange
      || listLayerReady
      || (listIsTargetLayer && !showFlipLayer),
  };
}

/** The layer to remember for the next render, given what was just displayed. */
export function committedLayer({ showFlipLayer, showListLayer }: ModeLayerVisibility): ModeLayer | null {
  if (showFlipLayer) return 'flip';
  if (showListLayer) return 'list';
  return null;
}
