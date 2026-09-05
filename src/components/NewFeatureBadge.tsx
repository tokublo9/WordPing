import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * The "!" marker on a feature a new subscription just unlocked.
 *
 * It is pinned to the bottom-right corner of the feature's own icon, the same
 * way `TestStatusIcon` pins its count: the icon and the marker are wrapped
 * together, and the marker is absolutely positioned with a small negative inset
 * so it overhangs the corner. Anchoring to the icon rather than to the row means
 * a longer label, a wider screen or a different language moves the icon and the
 * marker together — the marker cannot drift away from the thing it points at.
 *
 * The wrapper is sized by the icon alone and sets no overflow, so the overhang
 * is drawn, not clipped. Callers must not put it inside a clipping container.
 *
 * Small, and deliberately not a control: it is `pointerEvents="none"`, so it can
 * never intercept a tap meant for the icon underneath it, and the row's own
 * touch target is unchanged.
 *
 * The meaning is never carried by colour alone. The glyph itself says "!", and
 * the marker carries its own accessibility label so VoiceOver announces "New
 * feature" rather than reading a coloured dot or nothing at all.
 *
 * The theme colour is the fill in both light and dark, on white text, which is
 * the same treatment every other accent in the app uses.
 */

interface Props {
  /** Draws nothing when false; the icon is still rendered unchanged. */
  visible: boolean;
  themeColor: string;
  /** Localized "New feature". */
  label: string;
  /** The feature's icon. The marker is pinned to its bottom-right corner. */
  children: ReactNode;
}

export function NewFeatureBadge({ visible, themeColor, label, children }: Props) {
  return (
    <View style={styles.anchor}>
      {children}
      {visible && (
        <View
          style={[styles.badge, { backgroundColor: themeColor }]}
          pointerEvents="none"
          accessible
          accessibilityRole="text"
          accessibilityLabel={label}
        >
          <Text style={styles.glyph} allowFontScaling={false}>!</Text>
        </View>
      )}
    </View>
  );
}

// Smaller than the count badge on the 24pt Test icon, because these sit on the
// 18pt Settings icons and the 16pt glyph in the word editor. The corner it
// occupies is the same one.
const BADGE_SIZE = 14;
// How far the badge overhangs the icon's bottom-right corner. Matches the count
// badge's overhang, and is what keeps the glyph clear of the icon's own strokes.
const BADGE_OVERHANG = 4;

const styles = StyleSheet.create({
  // Sized by the icon, so the row lays out exactly as it did without a marker.
  // No overflow, no padding: the overhang is meant to be drawn outside these
  // bounds, and a padding here would move the icon instead.
  anchor: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -BADGE_OVERHANG,
    bottom: -BADGE_OVERHANG,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fixed size: the marker is decoration on an icon, and letting it grow with
  // Dynamic Type would push it off the corner it is anchored to.
  glyph: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
  },
});
