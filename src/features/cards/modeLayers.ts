/**
 * Which of the Word List screen's two mode layers is visible.
 *
 * List and Flip both stay mounted, so this only decides visibility. The rule
 * that matters:
 *
 *   **Flip is a destination, never a placeholder.**
 *
 * Flip owns the screen when it is the selected mode. It may additionally *keep*
 * the screen for the few frames a Flip → List toggle needs to scroll the list to
 * the current word, so the user does not watch that scroll happen — but only
 * when Flip was already the layer on screen. Opening a folder shows no layer
 * beforehand, so the list is displayed from the very first render.
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
  visibleLayer,
}: ModeLayerInput): ModeLayerVisibility {
  const listIsTargetLayer = reorderActive || cardViewMode === 'list';
  const listLayerReady = reorderActive || (cardViewMode === 'list' && listPositionPrepared);

  // Only a Flip that is already on screen may cover a pending mode change.
  const flipCoversModeChange = listIsTargetLayer && !listLayerReady && visibleLayer === 'flip';
  const showFlipLayer = !reorderActive && (cardViewMode === 'flip' || flipCoversModeChange);

  return {
    showFlipLayer,
    showListLayer: listLayerReady || (listIsTargetLayer && !showFlipLayer),
  };
}

/** The layer to remember for the next render, given what was just displayed. */
export function committedLayer({ showFlipLayer, showListLayer }: ModeLayerVisibility): ModeLayer | null {
  if (showFlipLayer) return 'flip';
  if (showListLayer) return 'list';
  return null;
}
