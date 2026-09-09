import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GALLERY_PAGE_COUNT,
  galleryPageAtOffsetX,
  galleryPageOffsetX,
} from '../../src/features/themes/galleryPaging';

/**
 * The two-page theme preview, in both reading directions.
 *
 * Under RTL a horizontal ScrollView lays its pages out mirrored, so page 0 is
 * at the largest offset rather than at zero. Tapping the Word List frame in
 * Arabic would otherwise open the viewer on the Test screen.
 */

const W = 390;

test('the gallery is two pages', () => {
  assert.equal(GALLERY_PAGE_COUNT, 2);
});

test('left-to-right: page 0 is at the start, page 1 one width along', () => {
  assert.equal(galleryPageOffsetX(0, W, false), 0);
  assert.equal(galleryPageOffsetX(1, W, false), W);
});

test('right-to-left: the order is mirrored, so page 0 is the far offset', () => {
  assert.equal(galleryPageOffsetX(0, W, true), W);
  assert.equal(galleryPageOffsetX(1, W, true), 0);
});

test('reading a settled offset is the exact inverse, in both directions', () => {
  for (const isRTL of [false, true]) {
    for (const index of [0, 1] as const) {
      const offset = galleryPageOffsetX(index, W, isRTL);
      assert.equal(galleryPageAtOffsetX(offset, W, isRTL), index, `${isRTL ? 'rtl' : 'ltr'} page ${index}`);
    }
  }
});

test('a part-way scroll settles to the nearer page', () => {
  assert.equal(galleryPageAtOffsetX(W * 0.4, W, false), 0);
  assert.equal(galleryPageAtOffsetX(W * 0.6, W, false), 1);
  assert.equal(galleryPageAtOffsetX(W * 0.6, W, true), 0);
});

test('an unmeasured or over-scrolled pager never lands off the gallery', () => {
  // Width zero is a layout that has not happened yet; a negative or oversized
  // offset is rubber-banding at either end.
  assert.equal(galleryPageOffsetX(1, 0, false), 0);
  assert.equal(galleryPageAtOffsetX(123, 0, false), 0);
  assert.equal(galleryPageAtOffsetX(-500, W, false), 0);
  assert.equal(galleryPageAtOffsetX(W * 9, W, false), 1);
  assert.equal(galleryPageAtOffsetX(W * 9, W, true), 0);
  // An index beyond the last page clamps rather than scrolling past the end.
  assert.equal(galleryPageOffsetX(1, W, false, 1), 0);
});
