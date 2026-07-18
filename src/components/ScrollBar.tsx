import { useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface Props {
  /** Animated scroll position — drive with Animated.event, never React state. */
  scrollAnim: Animated.Value;
  /** Total content height from onContentSizeChange. */
  contentH: number;
  /** Visible viewport height from onLayout. */
  viewH: number;
  /** Opacity animated value — caller controls show/hide timing. */
  fadeAnim: Animated.Value;
  /** Thumb background color. */
  color: string;
}

export function ScrollBar({ scrollAnim, contentH, viewH, fadeAnim, color }: Props) {
  const show   = contentH > viewH + 4 && viewH > 0 && contentH > 0;
  const thumbH = show ? Math.max(28, (viewH / contentH) * viewH) : 0;

  // Stable fallback so useMemo always returns the same union type.
  const zeroAnim = useRef(new Animated.Value(0)).current;

  // Interpolation recomputed only when layout dimensions change — never during scroll.
  const thumbTranslateY = useMemo(() => {
    if (!show) return zeroAnim;
    const maxTravel = Math.max(0, viewH - thumbH);
    const maxScroll = Math.max(1, contentH - viewH);
    return scrollAnim.interpolate({
      inputRange:  [0, maxScroll],
      outputRange: [0, maxTravel],
      extrapolate: 'clamp',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, contentH, viewH, thumbH]);

  if (!show) return null;

  return (
    <View style={styles.track} pointerEvents="none">
      <Animated.View
        style={[
          styles.thumb,
          {
            height:          thumbH,
            backgroundColor: color,
            opacity:         fadeAnim,
            transform:       [{ translateY: thumbTranslateY as any }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    right:    0,
    top:      0,
    bottom:   0,
    width:    10,
  },
  thumb: {
    position:     'absolute',
    top:          0,
    right:        2,
    width:        3,
    borderRadius: 2,
  },
});
