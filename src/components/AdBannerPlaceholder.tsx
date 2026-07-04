import { StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../types';

// Replace with <BannerAd> from react-native-google-mobile-ads once a dev build is available.
export function AdBannerPlaceholder({ pal, bottomInset = 0 }: { pal: Palette; bottomInset?: number }) {
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
  return (
    <View style={[styles.square, { backgroundColor: pal.chip, borderColor: pal.border }]}>
      <Text style={[styles.label, { color: pal.sub }]}>Advertisement</Text>
    </View>
  );
}

export const AD_BANNER_HEIGHT = 50;
export const AD_SQUARE_HEIGHT = 167;

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
