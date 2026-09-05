import { StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Palette } from '../types';
import { useLang } from '../i18n';
import { NewFeatureBadge } from './NewFeatureBadge';

interface Props {
  cardCount: number;
  untestedCount: number;
  themeColor: string;
  pal: Palette;
  /**
   * Draw the new-feature marker instead of the count.
   *
   * Instead of, never as well as: both occupy the same corner, and a "!" beside
   * a number would read as part of it. The count is not computed differently
   * while this is on — it is simply not the thing drawn — so the first tap
   * restores exactly the badge that was always there.
   */
  markNew?: boolean;
}

export function TestStatusIcon({ cardCount, untestedCount, themeColor, pal, markNew = false }: Props) {
  const t = useLang();
  if (cardCount === 0) return null;

  const complete = untestedCount === 0;
  const over99   = !complete && untestedCount > 99;

  if (markNew) {
    // No `rootShifted`: that nudge exists to clear the "99+" pill, and this
    // marker is the same width as the ordinary circle.
    return (
      <NewFeatureBadge visible themeColor={themeColor} label={t('new_feature_badge')}>
        <Ionicons
          name={complete ? 'school' : 'school-outline'}
          size={ICON_SIZE}
          color={complete ? themeColor : pal.sub}
        />
      </NewFeatureBadge>
    );
  }

  return (
    // The "99+" pill reaches further right than the circle, so the whole control nudges
    // left to keep its clearance. A transform moves the icon and badge together without
    // touching the header row's layout, leaving every other count exactly where it was.
    <View style={over99 ? styles.rootShifted : undefined}>
      <Ionicons
        name={complete ? 'school' : 'school-outline'}
        size={ICON_SIZE}
        color={complete ? themeColor : pal.sub}
      />
      {complete ? (
        <View style={[styles.badge, styles.badgeCircle, { backgroundColor: themeColor }]}>
          <MaterialCommunityIcons name="check-bold" size={9} color="#fff" />
        </View>
      ) : untestedCount > 0 ? (
        (() => {
          const label     = over99 ? '99+' : String(untestedCount);
          const twoDigit  = !over99 && untestedCount >= 10;
          return (
            <View style={[
              styles.badge,
              over99 ? styles.badgePill : twoDigit ? styles.badgeCircleWide : styles.badgeCircle,
              { backgroundColor: themeColor, borderColor: themeColor, borderWidth: 1 },
            ]}>
              <Text
                style={[styles.badgeText, { color: '#fff' }]}
                // The badge is a fixed-size chip, so its label must not follow the
                // system font scale: at a large scale "99+" outgrew any box width, and
                // with a line limit it truncated to "9…". No numberOfLines either, so
                // the label can never be ellipsized.
                allowFontScaling={false}
              >
                {label}
              </Text>
            </View>
          );
        })()
      ) : null}
    </View>
  );
}

const ICON_SIZE = 24;
const BADGE_SIZE = 15;
// How far the circular badge overhangs the icon's right edge.
const BADGE_OVERHANG = 5;
// Left edge of the circular badge, measured from the icon's left edge. Anchoring the
// pill here instead of on the right keeps both variants starting at the same x.
const BADGE_LEFT = ICON_SIZE + BADGE_OVERHANG - BADGE_SIZE;
// How far the "99+" pill reaches past the icon's right edge. Setting both `left` and a
// negative `right` gives the pill a width derived from those insets
// (ICON_SIZE - BADGE_LEFT + BADGE_PILL_OVERHANG), which is what lets it exceed the
// icon's own width. Sizing it from content instead capped it at the parent's width, so
// the label wrapped or ellipsized — the "99-" and "9…" both came from that.
const BADGE_PILL_OVERHANG = 16;
// The same width stated as a floor. Insets alone leave the box at the mercy of how the
// parent resolves its own width; a minWidth is honoured regardless, so "99+" always has
// room and can never wrap into the badge's 15pt height either.
const BADGE_PILL_WIDTH = ICON_SIZE - BADGE_LEFT + BADGE_PILL_OVERHANG;
// Leftward nudge applied to the icon and badge together, for the "99+" state only.
const BADGE_PILL_SHIFT = 8;
// Two digits at the full label size need more room than the 15pt circle's ~13pt of
// interior. Growing the circle keeps the label readable instead of shrinking the text,
// and because the badge is pinned bottom-right the extra size extends up and left — the
// corner it sits in does not move.
const BADGE_TWO_DIGIT_SIZE = 16;

const styles = StyleSheet.create({
  rootShifted: {
    transform: [{ translateX: -BADGE_PILL_SHIFT }],
  },
  badge: {
    position: 'absolute',
    bottom: -4,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Single digits and the completion tick — no horizontal padding so it never goes oval.
  badgeCircle: {
    right: -BADGE_OVERHANG,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
  },
  // Two digits: the same circle, slightly larger so "99" fits at the full font size.
  badgeCircleWide: {
    right: -BADGE_OVERHANG,
    width: BADGE_TWO_DIGIT_SIZE,
    height: BADGE_TWO_DIGIT_SIZE,
  },
  // "99+" only: an oval that starts on the circle's own left edge and extends to the
  // right, so the badge sits exactly where every other count sits.
  badgePill: {
    left: BADGE_LEFT,
    right: -BADGE_PILL_OVERHANG,
    minWidth: BADGE_PILL_WIDTH,
    height: BADGE_SIZE,
    paddingHorizontal: 3,
  },
  // One size for every count: two digits widen the badge rather than shrink the label.
  badgeText: { fontSize: 9, fontWeight: '600', lineHeight: 12 },
});
