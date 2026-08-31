import { StyleSheet, Text, View } from 'react-native';

/**
 * The "!" marker on a feature a new subscription just unlocked.
 *
 * Small, and deliberately not a control: it is `pointerEvents="none"` and sits
 * beside the row's label rather than over it, so it can never intercept a tap
 * meant for the thing it is pointing at, and the row's own touch target is
 * unchanged.
 *
 * The meaning is never carried by colour alone. The glyph itself says "!", and
 * the marker carries its own accessibility label so VoiceOver announces "New
 * feature" rather than reading a coloured dot or nothing at all.
 *
 * The theme colour is the fill in both light and dark, on white text, which is
 * the same treatment every other accent in the app uses.
 */

interface Props {
  /** Callers render this conditionally; it draws nothing when false. */
  visible: boolean;
  themeColor: string;
  /** Localized "New feature". */
  label: string;
}

export function NewFeatureBadge({ visible, themeColor, label }: Props) {
  if (!visible) return null;
  return (
    <View
      style={[styles.badge, { backgroundColor: themeColor }]}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text style={styles.glyph} allowFontScaling={false}>!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    flexShrink: 0,
  },
  // Fixed size: the marker is decoration beside a label, and letting it grow
  // with Dynamic Type would push the row's real content around.
  glyph: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
});
