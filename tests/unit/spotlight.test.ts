import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPOTLIGHT_GAP,
  anchorBelowRect,
  isMeasuredRect,
  type SpotlightRect,
} from '../../src/features/onboarding/spotlight';

const CARD: SpotlightRect = {
  x: 24,
  y: 180,
  width: 342,
  height: 280,
  radius: 20,
};

test('the popup is anchored below the measured target', () => {
  const placement = anchorBelowRect({
    rect: CARD,
    windowHeight: 844,
    bottomInset: 34,
  });

  assert.equal(placement.top, CARD.y + CARD.height + SPOTLIGHT_GAP);
  assert.equal(
    placement.top + placement.maxHeight,
    844 - 34 - SPOTLIGHT_GAP,
    'the available popup area ends before the bottom safe area',
  );
});

test('a short window never creates a negative popup height', () => {
  const placement = anchorBelowRect({
    rect: CARD,
    windowHeight: 460,
    bottomInset: 20,
  });

  assert.equal(placement.top, CARD.y + CARD.height + SPOTLIGHT_GAP);
  assert.equal(placement.maxHeight, 0);
});

test('only a real non-empty measurement can open a spotlight', () => {
  assert.equal(isMeasuredRect(CARD), true);
  assert.equal(isMeasuredRect(null), false);
  assert.equal(isMeasuredRect({ ...CARD, width: 0 }), false);
  assert.equal(isMeasuredRect({ ...CARD, height: 0 }), false);
  assert.equal(isMeasuredRect({ ...CARD, x: Number.NaN }), false);
  assert.equal(isMeasuredRect({ ...CARD, radius: -1 }), false);
});
