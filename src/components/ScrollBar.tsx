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
  /** JS-driven shape value. Never connect this node to native-driven style properties. */
  shapeAnim?: Animated.Value;
}

export interface ScrollBarMetrics {
  show: boolean;
  thumbH: number;
  maxTravel: number;
  maxScroll: number;
}

export function getScrollBarMetrics(contentH: number, viewH: number): ScrollBarMetrics {
  const show = contentH > viewH + 4 && viewH > 0 && contentH > 0;
  const thumbH = show ? Math.max(28, (viewH / contentH) * viewH) : 0;
  return {
    show,
    thumbH,
    maxTravel: show ? Math.max(0, viewH - thumbH) : 0,
    maxScroll: show ? Math.max(0, contentH - viewH) : 0,
  };
}

export function getScrollOffsetForThumb(
  pageY: number,
  containerPageY: number,
  grabOffset: number,
  metrics: ScrollBarMetrics,
): number {
  if (!metrics.show || metrics.maxTravel <= 0 || metrics.maxScroll <= 0) return 0;
  const thumbTop = Math.max(
    0,
    Math.min(metrics.maxTravel, pageY - containerPageY - grabOffset),
  );
  return (thumbTop / metrics.maxTravel) * metrics.maxScroll;
}

export function ScrollBar({ scrollAnim, contentH, viewH, fadeAnim, color, shapeAnim }: Props) {
  const { show, thumbH, maxTravel, maxScroll } = getScrollBarMetrics(contentH, viewH);

  // Separate fallbacks keep the JS-only and native-only animated graphs disjoint even
  // when this shared component is used without an interactive shape value.
  const zeroShapeAnim = useRef(new Animated.Value(0)).current;
  const zeroScrollAnim = useRef(new Animated.Value(0)).current;
  const thumbWidth = useMemo(
    () => (shapeAnim ?? zeroShapeAnim).interpolate({
      inputRange: [0, 1],
      outputRange: [3, 9],
      extrapolate: 'clamp',
    }),
    [shapeAnim, zeroShapeAnim],
  );
  const thumbBorderRadius = useMemo(
    () => (shapeAnim ?? zeroShapeAnim).interpolate({
      inputRange: [0, 1],
      outputRange: [2, 9],
      extrapolate: 'clamp',
    }),
    [shapeAnim, zeroShapeAnim],
  );

  // Interpolation recomputed only when layout dimensions change — never during scroll.
  const thumbTranslateY = useMemo(() => {
    if (!show) return zeroScrollAnim;
    return scrollAnim.interpolate({
      inputRange:  [0, Math.max(1, maxScroll)],
      outputRange: [0, maxTravel],
      extrapolate: 'clamp',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, maxScroll, maxTravel]);

  if (!show) return null;

  return (
    <View style={styles.track} pointerEvents="none">
      {/* Native-only layer: scroll translation and auto-hide opacity. */}
      <Animated.View
        style={[
          styles.thumbPosition,
          {
            height:    thumbH,
            opacity:   fadeAnim,
            transform: [{ translateY: thumbTranslateY as any }],
          },
        ]}
      >
        {/* JS-only layer: unsupported width and border-radius properties. */}
        <Animated.View
          style={[
            styles.thumb,
            {
              width: thumbWidth,
              borderRadius: thumbBorderRadius,
              backgroundColor: color,
            },
          ]}
        />
      </Animated.View>
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
  thumbPosition: {
    position:     'absolute',
    top:          0,
    right:        2,
    width:        3,
  },
  thumb: {
    position:     'absolute',
    top:          0,
    right:        0,
    bottom:       0,
    width:        3,
    borderRadius: 2,
  },
});
