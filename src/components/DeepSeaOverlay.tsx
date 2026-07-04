import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { useEffect, useRef } from 'react';

const { width: W, height: H } = Dimensions.get('window');

// ── Bubble definitions ────────────────────────────────────────────────────────
// Each bubble rises from bottom to top at a unique speed and horizontal position.
// The `delay` staggers their initial start so they aren't all in sync.

interface BubbleConfig {
  xFrac: number;   // horizontal position as fraction of screen width
  size: number;    // diameter in px
  opacity: number;
  duration: number; // ms to rise from bottom to top
  delay: number;    // initial delay in ms (only affects first rise)
}

const BUBBLES: BubbleConfig[] = [
  { xFrac: 0.08, size: 5,  opacity: 0.30, duration: 5200, delay: 0    },
  { xFrac: 0.20, size: 8,  opacity: 0.18, duration: 7000, delay: 1200 },
  { xFrac: 0.33, size: 4,  opacity: 0.25, duration: 4600, delay: 600  },
  { xFrac: 0.47, size: 10, opacity: 0.14, duration: 8500, delay: 2400 },
  { xFrac: 0.56, size: 5,  opacity: 0.28, duration: 5800, delay: 1800 },
  { xFrac: 0.66, size: 7,  opacity: 0.20, duration: 6200, delay: 400  },
  { xFrac: 0.75, size: 4,  opacity: 0.22, duration: 4200, delay: 3000 },
  { xFrac: 0.84, size: 9,  opacity: 0.15, duration: 7800, delay: 800  },
  { xFrac: 0.13, size: 6,  opacity: 0.24, duration: 5500, delay: 3600 },
  { xFrac: 0.41, size: 5,  opacity: 0.26, duration: 4800, delay: 2000 },
  { xFrac: 0.62, size: 8,  opacity: 0.18, duration: 6800, delay: 1400 },
  { xFrac: 0.91, size: 5,  opacity: 0.23, duration: 5100, delay: 2800 },
];

// ── Single animated bubble ────────────────────────────────────────────────────

function Bubble({ xFrac, size, opacity, duration, delay }: BubbleConfig) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    // setTimeout gives the initial stagger without adding a gap between loops.
    const timer = setTimeout(() => {
      anim = Animated.loop(
        Animated.timing(y, { toValue: 1, duration, useNativeDriver: true })
      );
      anim.start();
    }, delay);
    return () => {
      clearTimeout(timer);
      anim?.stop();
    };
  }, []);

  const translateY = y.interpolate({
    inputRange: [0, 1],
    // Start just below the bottom edge, end just above the top edge
    outputRange: [0, -(H + size + 20)],
  });

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left: xFrac * W - size / 2,
          bottom: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
}

// ── Overlay component ─────────────────────────────────────────────────────────

interface Props {
  // Animated.Value driven by the word-list FlatList's onScroll event.
  // Controls how deep the gradient shifts toward navy/abyss.
  scrollY: Animated.Value;
}

export function DeepSeaOverlay({ scrollY }: Props) {
  // Color interpolation: scroll drives the transition from ocean surface to abyss.
  // Values chosen to feel gradual — still clearly blue at 400px scroll.
  const bgColor = scrollY.interpolate({
    inputRange: [0, 200, 600, 1400],
    outputRange: ['#0B5EA8', '#073B7A', '#021B3F', '#020D1F'],
    extrapolate: 'clamp',
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Scroll-depth gradient — covers the whole screen */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]} />
      {/* Rising air bubbles */}
      {BUBBLES.map((b, i) => (
        <Bubble key={i} {...b} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.88)',
  },
});
