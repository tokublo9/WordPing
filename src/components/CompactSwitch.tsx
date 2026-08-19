import { StyleSheet, Switch, View } from 'react-native';

/**
 * The Settings toggle control.
 *
 * One component rather than a transform applied at three call sites: the scale,
 * the hit area and the accessibility wiring have to agree on every row, and
 * three separate copies would drift the first time one of them was tweaked.
 *
 * `transform` shrinks only what is drawn — the platform Switch keeps its native
 * layout box (51×31 on iOS), so nothing is clipped and the thumb and track stay
 * crisp because the platform still renders them at their own resolution. The
 * wrapper then holds a full 44×44 target and `hitSlop` widens the Switch's own
 * touchable area back out to it, so the control looks smaller without becoming
 * harder to hit.
 */

/** Drawn size relative to the platform default. */
export const COMPACT_SWITCH_SCALE = 0.8;

/** Apple HIG / Material minimum touch target, in points. */
export const MIN_TAP_TARGET = 44;

// Enough to bring the drawn 40.8 × 24.8 control back past 44 × 44 in both axes.
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

export interface CompactSwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Announced as the control's name; the row's own title text. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  themeColor: string;
  offTrackColor: string;
}

export function CompactSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  themeColor,
  offTrackColor,
}: CompactSwitchProps) {
  return (
    <View style={styles.tapTarget}>
      <Switch
        style={styles.control}
        hitSlop={HIT_SLOP}
        value={value}
        onValueChange={onValueChange}
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked: value }}
        {...(accessibilityHint ? { accessibilityHint } : {})}
        trackColor={{ false: offTrackColor, true: themeColor + '88' }}
        thumbColor={value ? themeColor : '#fff'}
        ios_backgroundColor={offTrackColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // No overflow clipping: the scaled control shrinks inward from its centre and
  // must stay fully drawn.
  tapTarget: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  control: { transform: [{ scale: COMPACT_SWITCH_SCALE }] },
});
