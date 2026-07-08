import { StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../types';

// ── Kill-switch ───────────────────────────────────────────────────────────────
// Set to true to restore ads throughout the app.
export const ADS_ENABLED = false;

// When ADS_ENABLED is false these evaluate to 0, so every layout calculation
// that uses them automatically collapses — no spacing is left behind.
export const AD_BANNER_HEIGHT = ADS_ENABLED ? 50  : 0;
export const AD_SQUARE_HEIGHT = ADS_ENABLED ? 167 : 0;

// Replace with <BannerAd> from react-native-google-mobile-ads once a dev build is available.
export function AdBannerPlaceholder({ pal, bottomInset = 0 }: { pal: Palette; bottomInset?: number }) {
  if (!ADS_ENABLED) return null;
  return (
    <View style={{ backgroundColor: pal.chip, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.border }}>
      <View style={styles.banner}>
        <Text style={[styles.label, { color: pal.sub }]}>Advertisement</Text>
      </View>
      {bottomInset > 0 && <View style={{ height: bottomInset }} />}
    </View>
  );
}

// Replace with a medium-rectangle (300×250) ad unit when ready.
export function AdSquarePlaceholder({ pal }: { pal: Palette }) {
  if (!ADS_ENABLED) return null;
  return (
    <View style={[styles.square, { backgroundColor: pal.chip, borderColor: pal.border }]}>
      <Text style={[styles.label, { color: pal.sub }]}>Advertisement</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: AD_BANNER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  square: {
    height: AD_SQUARE_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, letterSpacing: 0.5 },
});
