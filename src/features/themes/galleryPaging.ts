/**
 * Where a paged theme-preview gallery has to be scrolled to show a given page.
 *
 * The gallery is two pages — the Word List screen, then the Test screen — and
 * the fullscreen viewer opens on whichever one was tapped. Working out the
 * scroll offset for that looks trivial until right-to-left is involved: React
 * Native lays a horizontal `ScrollView` out in reverse under RTL, so page 0
 * sits at the far *right* and its offset is the largest, not zero. Getting that
 * backwards opens the viewer on the wrong page for Arabic readers.
 *
 * Pure — no react-native import — so both directions are tested rather than
 * assumed. The caller passes `I18nManager.isRTL`.
 */

/** Word List, then Test. The gallery is deliberately not open-ended. */
export const GALLERY_PAGE_COUNT = 2;

/** A page position in the gallery, in reading order regardless of direction. */
export type GalleryPageIndex = 0 | 1;

export function galleryPageOffsetX(
  index: GalleryPageIndex,
  pageWidth: number,
  isRTL: boolean,
  pageCount: number = GALLERY_PAGE_COUNT,
): number {
  // Defensive rather than clever: a zero or negative width means the layout has
  // not been measured, and scrolling to a negative offset would leave the pager
  // somewhere no page occupies.
  if (pageWidth <= 0 || pageCount <= 0) return 0;
  const clamped = Math.min(Math.max(index, 0), pageCount - 1);
  // Under RTL the content is mirrored, so the first page is the last offset.
  const visualIndex = isRTL ? pageCount - 1 - clamped : clamped;
  return visualIndex * pageWidth;
}

/**
 * The page a settled scroll offset corresponds to.
 *
 * The inverse of the above, and it has to be, or a swipe under RTL would report
 * the page the user just left. Used to decide which video is on screen.
 */
export function galleryPageAtOffsetX(
  offsetX: number,
  pageWidth: number,
  isRTL: boolean,
  pageCount: number = GALLERY_PAGE_COUNT,
): GalleryPageIndex {
  if (pageWidth <= 0 || pageCount <= 0) return 0;
  const visualIndex = Math.min(Math.max(Math.round(offsetX / pageWidth), 0), pageCount - 1);
  const index = isRTL ? pageCount - 1 - visualIndex : visualIndex;
  return (index === 1 ? 1 : 0);
}
