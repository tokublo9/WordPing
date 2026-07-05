import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';

const { width: W, height: H } = Dimensions.get('window');

// ── Bubbles ───────────────────────────────────────────────────────────────────

interface BubbleConfig {
  xFrac: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
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

function Bubble({ xFrac, size, opacity, duration, delay }: BubbleConfig) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      anim = Animated.loop(
        Animated.timing(y, { toValue: 1, duration, useNativeDriver: true })
      );
      anim.start();
    }, delay);
    return () => { clearTimeout(timer); anim?.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = y.interpolate({
    inputRange: [0, 1],
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

// ── Main overlay ───────────────────────────────────────────────────────────────

interface Props {
  scrollY: Animated.Value;
}

export function DeepSeaOverlay({ scrollY }: Props) {
  // As the user scrolls down, a dark veil grows over the gradient —
  // simulating the loss of light as they descend into the deep ocean.
  const depthOp = scrollY.interpolate({
    inputRange: [0, 250, 900, 2200],
    outputRange: [0, 0.05, 0.48, 0.78],
    extrapolate: 'clamp',
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Single GPU-rendered gradient: seamless top-bright → bottom-dark ocean */}
      <LinearGradient
        colors={['#1585CC', '#0C5290', '#062A54', '#030F28', '#010610']}
        locations={[0, 0.28, 0.55, 0.78, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Depth veil: scroll darkens the whole scene progressively */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: '#010610', opacity: depthOp }]}
      />

      {/* Rising bubbles */}
      {BUBBLES.map((b, i) => <Bubble key={i} {...b} />)}
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
