import { Dimensions, StyleSheet, Text, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

type EmojiItem = {
  xFrac: number; yFrac: number;
  size: number; opacity: number; rotate: number;
  emoji: string;
};

type DotItem = {
  xFrac: number; yFrac: number;
  size: number; opacity: number;
  color: string;
};

// ── Flower ────────────────────────────────────────────────────────────────────
const FLOWERS: EmojiItem[] = [
  { xFrac: 0.04, yFrac: 0.03, size: 26, opacity: 0.13, rotate: 15,  emoji: '🌸' },
  { xFrac: 0.76, yFrac: 0.02, size: 20, opacity: 0.11, rotate: -18, emoji: '🌸' },
  { xFrac: 0.41, yFrac: 0.07, size: 16, opacity: 0.09, rotate: 8,   emoji: '🌸' },
  { xFrac: 0.88, yFrac: 0.13, size: 28, opacity: 0.12, rotate: -5,  emoji: '🌸' },
  { xFrac: 0.17, yFrac: 0.16, size: 18, opacity: 0.10, rotate: 38,  emoji: '🌸' },
  { xFrac: 0.60, yFrac: 0.21, size: 14, opacity: 0.08, rotate: -12, emoji: '🌸' },
  { xFrac: 0.01, yFrac: 0.33, size: 22, opacity: 0.11, rotate: 22,  emoji: '🌸' },
  { xFrac: 0.84, yFrac: 0.39, size: 18, opacity: 0.09, rotate: 10,  emoji: '🌸' },
  { xFrac: 0.29, yFrac: 0.43, size: 26, opacity: 0.13, rotate: -8,  emoji: '🌸' },
  { xFrac: 0.67, yFrac: 0.49, size: 16, opacity: 0.10, rotate: 30,  emoji: '🌸' },
  { xFrac: 0.09, yFrac: 0.56, size: 20, opacity: 0.11, rotate: -28, emoji: '🌸' },
  { xFrac: 0.51, yFrac: 0.61, size: 14, opacity: 0.08, rotate: 5,   emoji: '🌸' },
  { xFrac: 0.87, yFrac: 0.64, size: 24, opacity: 0.12, rotate: 18,  emoji: '🌸' },
  { xFrac: 0.24, yFrac: 0.71, size: 18, opacity: 0.10, rotate: -15, emoji: '🌸' },
  { xFrac: 0.69, yFrac: 0.77, size: 22, opacity: 0.11, rotate: 25,  emoji: '🌸' },
  { xFrac: 0.04, yFrac: 0.83, size: 16, opacity: 0.09, rotate: -32, emoji: '🌸' },
  { xFrac: 0.44, yFrac: 0.87, size: 20, opacity: 0.11, rotate: 10,  emoji: '🌸' },
  { xFrac: 0.81, yFrac: 0.92, size: 18, opacity: 0.10, rotate: -5,  emoji: '🌸' },
];

// ── Paw ───────────────────────────────────────────────────────────────────────
// Laid out as two crossing animal trails.
const PAWS: EmojiItem[] = [
  // Trail A — enters top-right, wanders toward center-left
  { xFrac: 0.78, yFrac: 0.04, size: 22, opacity: 0.12, rotate: -18, emoji: '🐾' },
  { xFrac: 0.64, yFrac: 0.10, size: 20, opacity: 0.11, rotate: 14,  emoji: '🐾' },
  { xFrac: 0.72, yFrac: 0.17, size: 22, opacity: 0.12, rotate: -8,  emoji: '🐾' },
  { xFrac: 0.56, yFrac: 0.23, size: 20, opacity: 0.10, rotate: 20,  emoji: '🐾' },
  { xFrac: 0.62, yFrac: 0.31, size: 22, opacity: 0.11, rotate: -14, emoji: '🐾' },
  { xFrac: 0.48, yFrac: 0.38, size: 20, opacity: 0.10, rotate: 8,   emoji: '🐾' },
  // Trail B — enters left, crosses toward bottom-right
  { xFrac: 0.04, yFrac: 0.28, size: 22, opacity: 0.12, rotate: 12,  emoji: '🐾' },
  { xFrac: 0.14, yFrac: 0.36, size: 20, opacity: 0.11, rotate: -16, emoji: '🐾' },
  { xFrac: 0.07, yFrac: 0.45, size: 22, opacity: 0.12, rotate: 6,   emoji: '🐾' },
  { xFrac: 0.19, yFrac: 0.53, size: 20, opacity: 0.10, rotate: -20, emoji: '🐾' },
  { xFrac: 0.32, yFrac: 0.59, size: 22, opacity: 0.11, rotate: 10,  emoji: '🐾' },
  { xFrac: 0.44, yFrac: 0.67, size: 20, opacity: 0.10, rotate: -8,  emoji: '🐾' },
  { xFrac: 0.57, yFrac: 0.74, size: 22, opacity: 0.12, rotate: 18,  emoji: '🐾' },
  { xFrac: 0.70, yFrac: 0.80, size: 20, opacity: 0.11, rotate: -12, emoji: '🐾' },
  { xFrac: 0.83, yFrac: 0.87, size: 22, opacity: 0.12, rotate: 6,   emoji: '🐾' },
  { xFrac: 0.20, yFrac: 0.88, size: 20, opacity: 0.10, rotate: -22, emoji: '🐾' },
];

// ── Space — emoji (stars, moon, planet) ───────────────────────────────────────
const SPACE_EMOJI: EmojiItem[] = [
  { xFrac: 0.12, yFrac: 0.05, size: 18, opacity: 0.32, rotate: 0,   emoji: '⭐' },
  { xFrac: 0.83, yFrac: 0.07, size: 14, opacity: 0.26, rotate: 0,   emoji: '⭐' },
  { xFrac: 0.47, yFrac: 0.03, size: 22, opacity: 0.38, rotate: 12,  emoji: '🌟' },
  { xFrac: 0.29, yFrac: 0.14, size: 14, opacity: 0.22, rotate: 0,   emoji: '⭐' },
  { xFrac: 0.68, yFrac: 0.18, size: 16, opacity: 0.25, rotate: -8,  emoji: '⭐' },
  { xFrac: 0.91, yFrac: 0.28, size: 20, opacity: 0.30, rotate: 0,   emoji: '🌟' },
  { xFrac: 0.04, yFrac: 0.38, size: 14, opacity: 0.22, rotate: 0,   emoji: '⭐' },
  { xFrac: 0.43, yFrac: 0.33, size: 28, opacity: 0.20, rotate: 0,   emoji: '🪐' },
  { xFrac: 0.79, yFrac: 0.44, size: 16, opacity: 0.24, rotate: 0,   emoji: '⭐' },
  { xFrac: 0.19, yFrac: 0.53, size: 18, opacity: 0.28, rotate: 14,  emoji: '🌟' },
  { xFrac: 0.59, yFrac: 0.57, size: 14, opacity: 0.20, rotate: 0,   emoji: '⭐' },
  { xFrac: 0.09, yFrac: 0.67, size: 20, opacity: 0.30, rotate: 0,   emoji: '⭐' },
  { xFrac: 0.74, yFrac: 0.71, size: 16, opacity: 0.24, rotate: -6,  emoji: '⭐' },
  { xFrac: 0.36, yFrac: 0.76, size: 26, opacity: 0.22, rotate: 0,   emoji: '🌙' },
  { xFrac: 0.87, yFrac: 0.83, size: 14, opacity: 0.22, rotate: 0,   emoji: '⭐' },
  { xFrac: 0.21, yFrac: 0.87, size: 18, opacity: 0.28, rotate: 18,  emoji: '🌟' },
  { xFrac: 0.54, yFrac: 0.91, size: 16, opacity: 0.22, rotate: 0,   emoji: '⭐' },
];

// Small dot "stars" — rendered as tiny bright circles for a genuine starfield feel.
const SPACE_DOTS: DotItem[] = [
  { xFrac: 0.07, yFrac: 0.11, size: 3, opacity: 0.45, color: '#E0E8FF' },
  { xFrac: 0.24, yFrac: 0.07, size: 2, opacity: 0.38, color: '#E0E8FF' },
  { xFrac: 0.61, yFrac: 0.13, size: 3, opacity: 0.42, color: '#FFE4A0' },
  { xFrac: 0.89, yFrac: 0.05, size: 2, opacity: 0.34, color: '#E0E8FF' },
  { xFrac: 0.34, yFrac: 0.24, size: 4, opacity: 0.48, color: '#FFE4A0' },
  { xFrac: 0.54, yFrac: 0.27, size: 2, opacity: 0.32, color: '#C8D0FF' },
  { xFrac: 0.76, yFrac: 0.31, size: 3, opacity: 0.40, color: '#E0E8FF' },
  { xFrac: 0.14, yFrac: 0.41, size: 2, opacity: 0.30, color: '#E0E8FF' },
  { xFrac: 0.46, yFrac: 0.47, size: 3, opacity: 0.38, color: '#E0E8FF' },
  { xFrac: 0.93, yFrac: 0.50, size: 2, opacity: 0.32, color: '#C8D0FF' },
  { xFrac: 0.31, yFrac: 0.61, size: 4, opacity: 0.45, color: '#FFE4A0' },
  { xFrac: 0.66, yFrac: 0.63, size: 2, opacity: 0.30, color: '#E0E8FF' },
  { xFrac: 0.04, yFrac: 0.73, size: 3, opacity: 0.38, color: '#E0E8FF' },
  { xFrac: 0.50, yFrac: 0.79, size: 2, opacity: 0.32, color: '#C8D0FF' },
  { xFrac: 0.81, yFrac: 0.80, size: 4, opacity: 0.45, color: '#FFE4A0' },
  { xFrac: 0.18, yFrac: 0.94, size: 3, opacity: 0.38, color: '#E0E8FF' },
  { xFrac: 0.63, yFrac: 0.96, size: 2, opacity: 0.30, color: '#E0E8FF' },
  { xFrac: 0.40, yFrac: 0.21, size: 3, opacity: 0.42, color: '#E0E8FF' },
  { xFrac: 0.16, yFrac: 0.31, size: 2, opacity: 0.34, color: '#C8D0FF' },
  { xFrac: 0.84, yFrac: 0.58, size: 4, opacity: 0.44, color: '#FFE4A0' },
  { xFrac: 0.56, yFrac: 0.85, size: 2, opacity: 0.30, color: '#E0E8FF' },
  { xFrac: 0.72, yFrac: 0.95, size: 3, opacity: 0.36, color: '#E0E8FF' },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  patternType: 'flower' | 'paw' | 'space';
}

export function SkinPatternOverlay({ patternType }: Props) {
  if (patternType === 'flower') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {FLOWERS.map((item, i) => (
          <Text
            key={i}
            style={{
              position: 'absolute',
              left: item.xFrac * W,
              top:  item.yFrac * H,
              fontSize: item.size,
              opacity:  item.opacity,
              transform: [{ rotate: `${item.rotate}deg` }],
            }}
          >
            {item.emoji}
          </Text>
        ))}
      </View>
    );
  }

  if (patternType === 'paw') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {PAWS.map((item, i) => (
          <Text
            key={i}
            style={{
              position: 'absolute',
              left: item.xFrac * W,
              top:  item.yFrac * H,
              fontSize: item.size,
              opacity:  item.opacity,
              transform: [{ rotate: `${item.rotate}deg` }],
            }}
          >
            {item.emoji}
          </Text>
        ))}
      </View>
    );
  }

  // space
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {SPACE_EMOJI.map((item, i) => (
        <Text
          key={`e${i}`}
          style={{
            position: 'absolute',
            left: item.xFrac * W,
            top:  item.yFrac * H,
            fontSize: item.size,
            opacity:  item.opacity,
            transform: [{ rotate: `${item.rotate}deg` }],
          }}
        >
          {item.emoji}
        </Text>
      ))}
      {SPACE_DOTS.map((item, i) => (
        <View
          key={`d${i}`}
          style={{
            position: 'absolute',
            left:         item.xFrac * W,
            top:          item.yFrac * H,
            width:        item.size,
            height:       item.size,
            borderRadius: item.size / 2,
            backgroundColor: item.color,
            opacity: item.opacity,
          }}
        />
      ))}
    </View>
  );
}
