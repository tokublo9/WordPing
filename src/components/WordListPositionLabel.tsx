import { forwardRef, useImperativeHandle, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

export interface WordListPositionLabelHandle {
  /** 1-based index of the last visible row, a partially visible one included. */
  setLastVisibleIndex(index: number): void;
  /** Whether the list is resting at the very top. */
  setAtTop(atTop: boolean): void;
}

interface Props {
  /** Number of rows in the list currently on screen. */
  total: number;
  /** What to show at the top of the list — the usual "N words" summary. */
  topContent: string;
  style?: StyleProp<TextStyle>;
}

/**
 * The word list's top-left label. Reads "N words" at the top of the list and switches to
 * "28 / 350" once scrolled, naming the last word visible at the bottom of the screen —
 * so scrolling to the end shows "350 / 350".
 *
 * "At the top" is passed in rather than inferred from the index: with the last visible row
 * as the position, the top of the list already reads as row 9 or so, not row 1.
 *
 * Both values live here and are set imperatively, so a scroll repaints this one line
 * instead of re-rendering the screen on every row that crosses the bottom edge.
 */
export const WordListPositionLabel = forwardRef<WordListPositionLabelHandle, Props>(
  function WordListPositionLabel({ total, topContent, style }, ref) {
    const [state, setState] = useState({ index: 1, atTop: true });

    // Each setter no-ops when the value is unchanged: viewability reports the same last
    // row repeatedly while scrolling within it, and the scroll listener fires per frame.
    useImperativeHandle(ref, () => ({
      setLastVisibleIndex: (index: number) => setState(
        prev => prev.index === index ? prev : { ...prev, index },
      ),
      setAtTop: (atTop: boolean) => setState(
        prev => prev.atTop === atTop ? prev : { ...prev, atTop },
      ),
    }), []);

    // Clamped because the list can shrink under a scrolled position (a delete, a filter)
    // before the next viewability report arrives.
    const position = Math.min(Math.max(state.index, 1), Math.max(total, 1));
    const showPosition = !state.atTop && total > 0;

    return (
      <Text style={style} numberOfLines={1}>
        {showPosition ? `${position} / ${total}` : topContent}
      </Text>
    );
  },
);
