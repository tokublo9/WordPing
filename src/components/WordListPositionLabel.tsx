import { forwardRef, useImperativeHandle, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

export interface WordListPositionLabelHandle {
  /** 1-based index of the top visible row. */
  setCurrentVisibleIndex(index: number): void;
  /** Whether the list is resting at the very top. */
  setAtTop(atTop: boolean): void;
}

interface Props {
  /** Number of rows in the list currently on screen. */
  total: number;
  /** What to show at the top of the list — the usual "N words" summary. */
  topContent: string;
  /** Shared 1-based position, used to keep List and Flip indicators identical. */
  currentIndex?: number;
  /** Whether to show the current position even while the list is at its first word. */
  showCurrentPosition?: boolean;
  /**
   * Whether the content actually spans more than one screen.
   *
   * Supplied by the caller from the real measurement — the list's content and
   * viewport heights, or the number of cards in Flip Mode — never from a word
   * count guess. When everything fits on one page there is no position to
   * report, so the label falls back to its count summary instead of showing a
   * "1 / 1" that can never change.
   */
  hasMultiplePages?: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * The word list's top-left label. Shows the supplied count summary at the top and
 * switches to "28 / 350" once scrolled, naming the word currently at the top.
 *
 * "At the top" is passed separately so the existing word-count summary remains visible
 * while the first word is at the top.
 *
 * Both values live here and are set imperatively, so a scroll repaints this one line
 * instead of re-rendering the screen on every row that crosses the bottom edge.
 */
export const WordListPositionLabel = forwardRef<WordListPositionLabelHandle, Props>(
  function WordListPositionLabel({
    total, topContent, currentIndex, showCurrentPosition = false,
    hasMultiplePages = true, style,
  }, ref) {
    const [state, setState] = useState({ index: 1, atTop: true });

    // Each setter no-ops when the value is unchanged: viewability reports the same top
    // row repeatedly while scrolling within it, and the scroll listener fires per frame.
    useImperativeHandle(ref, () => ({
      setCurrentVisibleIndex: (index: number) => setState(
        prev => prev.index === index ? prev : { ...prev, index },
      ),
      setAtTop: (atTop: boolean) => setState(
        prev => prev.atTop === atTop ? prev : { ...prev, atTop },
      ),
    }), []);

    // Clamped because the list can shrink under a scrolled position (a delete, a filter)
    // before the next viewability report arrives.
    const position = Math.min(Math.max(currentIndex ?? state.index, 1), Math.max(total, 1));
    // Single-page content keeps the count summary. The line itself never
    // disappears, so nothing collapses and no placeholder is left behind — the
    // same one line simply keeps saying the more useful of the two things.
    const showPosition = hasMultiplePages && (showCurrentPosition || !state.atTop) && total > 0;

    return (
      <Text style={style} numberOfLines={1}>
        {showPosition ? `${position} / ${total}` : topContent}
      </Text>
    );
  },
);
