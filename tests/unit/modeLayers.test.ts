import assert from 'node:assert/strict';
import test from 'node:test';
import {
  committedLayer,
  resolveModeLayers,
  type ModeLayer,
  type ModeLayerInput,
} from '../../src/features/cards/modeLayers';

/**
 * Regression tests for the Word Flip flash on folder navigation.
 *
 * The bug: `showFlip = !reorderActive && !showList` made Flip the fallback
 * whenever the list had not yet reported its position. A freshly mounted list
 * never has, so opening any non-empty folder rendered a frame of Flip first.
 */

const FRESH_SCREEN: ModeLayerInput = {
  cardViewMode: 'list',
  reorderActive: false,
  // A newly mounted list has not reported viewability yet.
  listPositionPrepared: false,
  // Nothing is on screen when a folder is opened from the folder list.
  visibleLayer: null,
};

function layers(overrides: Partial<ModeLayerInput> = {}) {
  return resolveModeLayers({ ...FRESH_SCREEN, ...overrides });
}

/** Replays renders, feeding each one the layer the previous render committed. */
function renderSequence(steps: Omit<ModeLayerInput, 'visibleLayer'>[]): {
  frames: { showListLayer: boolean; showFlipLayer: boolean }[];
  flipEverShown: boolean;
} {
  let visibleLayer: ModeLayer | null = null;
  const frames = steps.map(step => {
    const visibility = resolveModeLayers({ ...step, visibleLayer });
    visibleLayer = committedLayer(visibility);
    return visibility;
  });
  return { frames, flipEverShown: frames.some(frame => frame.showFlipLayer) };
}

// ── Folder item → Word List ──────────────────────────────────────────────────

test('opening a folder shows the list on the very first render', () => {
  const { showListLayer, showFlipLayer } = layers();
  assert.equal(showListLayer, true, 'the Word List must be visible immediately');
  assert.equal(showFlipLayer, false, 'Word Flip must never appear on folder open');
});

test('Word Flip is never rendered while the list settles after a folder open', () => {
  // Frame 1: mounted, position not yet confirmed. Frame 2: viewability reported.
  const { flipEverShown, frames } = renderSequence([
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: false },
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: false },
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: true },
  ]);
  assert.equal(flipEverShown, false, 'Word Flip must not flash during navigation');
  assert.ok(frames.every(frame => frame.showListLayer), 'the list stays visible throughout');
});

test('a folder restored to a saved scroll position still never shows Flip', () => {
  // A saved position means listPositionPrepared stays false until the list has
  // scrolled to that row. The list must cover that itself, not Flip.
  const { flipEverShown } = renderSequence([
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: false },
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: false },
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: false },
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: true },
  ]);
  assert.equal(flipEverShown, false);
});

test('exactly one layer is visible on a fresh folder open', () => {
  const { showListLayer, showFlipLayer } = layers();
  assert.notEqual(showListLayer, showFlipLayer, 'never both, never neither');
});

// ── Direct navigation → Word Flip ────────────────────────────────────────────

test('Flip mode still renders Flip, and only Flip', () => {
  const { showListLayer, showFlipLayer } = layers({ cardViewMode: 'flip' });
  assert.equal(showFlipLayer, true);
  assert.equal(showListLayer, false);
});

test('opening a folder while Flip mode is selected goes straight to Flip', () => {
  // cardViewMode is a persisted preference, so a user who left in Flip mode
  // gets Flip. That is intentional navigation, not a flash.
  const { frames, flipEverShown } = renderSequence([
    { cardViewMode: 'flip', reorderActive: false, listPositionPrepared: false },
    { cardViewMode: 'flip', reorderActive: false, listPositionPrepared: false },
  ]);
  assert.equal(flipEverShown, true);
  assert.ok(frames.every(frame => !frame.showListLayer), 'the list never takes over Flip mode');
});

test('Flip keeps the screen while a Flip to List toggle positions the list', () => {
  // This hold is the reason the gate exists: without it the user watches the
  // list scroll to the current word.
  const { frames } = renderSequence([
    // Reading in Flip.
    { cardViewMode: 'flip', reorderActive: false, listPositionPrepared: false },
    // Toggled to List; the list is still scrolling to the current word.
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: false },
    // The list confirms its position and takes over.
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: true },
  ]);
  assert.deepEqual(frames.map(frame => frame.showFlipLayer), [true, true, false]);
  assert.deepEqual(frames.map(frame => frame.showListLayer), [false, false, true]);
});

test('a held Flip yields as soon as the list is ready', () => {
  const held = resolveModeLayers({
    cardViewMode: 'list', reorderActive: false, listPositionPrepared: false, visibleLayer: 'flip',
  });
  const ready = resolveModeLayers({
    cardViewMode: 'list', reorderActive: false, listPositionPrepared: true, visibleLayer: 'flip',
  });
  assert.equal(held.showFlipLayer, true);
  assert.equal(ready.showFlipLayer, false);
  assert.equal(ready.showListLayer, true);
});

// ── Returning from Word Flip, then opening a folder ──────────────────────────

test('stale Flip state from a previous folder cannot cover a new folder', () => {
  // WordListScreen resets its tracked layer when the folder changes, so the
  // previous folder's Flip is not eligible to hold the screen.
  const { showListLayer, showFlipLayer } = layers({ visibleLayer: null });
  assert.equal(showFlipLayer, false);
  assert.equal(showListLayer, true);
});

test('a leftover visible Flip would otherwise have caused exactly this flash', () => {
  // Documents why the reset on folder change matters: with the stale layer left
  // in place, Flip does hold the screen.
  const stale = resolveModeLayers({
    cardViewMode: 'list', reorderActive: false, listPositionPrepared: false, visibleLayer: 'flip',
  });
  assert.equal(stale.showFlipLayer, true, 'stale Flip state is what the reset prevents');
});

test('leaving Flip for the folder list and reopening in list mode shows the list', () => {
  const { flipEverShown } = renderSequence([
    // Reading in Flip, then the user switches back to list mode and leaves.
    { cardViewMode: 'flip', reorderActive: false, listPositionPrepared: false },
    { cardViewMode: 'list', reorderActive: false, listPositionPrepared: true },
  ]);
  assert.equal(flipEverShown, true, 'the first frame is genuine Flip mode');

  // The screen unmounts on the way back to the folder list, so the next folder
  // starts from a null visible layer.
  const reopened = layers({ visibleLayer: null });
  assert.equal(reopened.showFlipLayer, false);
  assert.equal(reopened.showListLayer, true);
});

// ── Reorder ──────────────────────────────────────────────────────────────────

test('reorder mode always shows the list and never Flip', () => {
  for (const cardViewMode of ['list', 'flip'] as const) {
    for (const listPositionPrepared of [true, false]) {
      for (const visibleLayer of [null, 'list', 'flip'] as const) {
        const { showListLayer, showFlipLayer } = resolveModeLayers({
          cardViewMode, reorderActive: true, listPositionPrepared, visibleLayer,
        });
        assert.equal(showListLayer, true);
        assert.equal(showFlipLayer, false);
      }
    }
  }
});

// ── Invariants across every reachable combination ────────────────────────────

test('Flip is only ever visible as a destination or as an already-visible hold', () => {
  for (const cardViewMode of ['list', 'flip'] as const) {
    for (const reorderActive of [true, false]) {
      for (const listPositionPrepared of [true, false]) {
        for (const visibleLayer of [null, 'list', 'flip'] as const) {
          const input = { cardViewMode, reorderActive, listPositionPrepared, visibleLayer };
          const { showFlipLayer } = resolveModeLayers(input);
          if (!showFlipLayer) continue;
          const isDestination = !reorderActive && cardViewMode === 'flip';
          const isHold = visibleLayer === 'flip';
          assert.ok(
            isDestination || isHold,
            `Flip shown as a placeholder for ${JSON.stringify(input)}`,
          );
        }
      }
    }
  }
});

test('the two layers are never visible at the same time', () => {
  for (const cardViewMode of ['list', 'flip'] as const) {
    for (const reorderActive of [true, false]) {
      for (const listPositionPrepared of [true, false]) {
        for (const visibleLayer of [null, 'list', 'flip'] as const) {
          const { showListLayer, showFlipLayer } = resolveModeLayers({
            cardViewMode, reorderActive, listPositionPrepared, visibleLayer,
          });
          assert.equal(showListLayer && showFlipLayer, false);
        }
      }
    }
  }
});

test('committedLayer reports what was actually displayed', () => {
  assert.equal(committedLayer({ showListLayer: true, showFlipLayer: false }), 'list');
  assert.equal(committedLayer({ showListLayer: false, showFlipLayer: true }), 'flip');
  assert.equal(committedLayer({ showListLayer: false, showFlipLayer: false }), null);
});
