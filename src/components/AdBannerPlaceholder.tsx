import { StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../types';

// Replace this component with <BannerAd> from react-native-google-mobile-ads
// once a development build is available.
export function AdBannerPlaceholder({ pal }: { pal: Palette }) {
  return (
    <View style={[styles.banner, { backgroundColor: pal.chip, borderTopColor: pal.border }]}>
      <Text style={[styles.label, { color: pal.sub }]}>Advertisement</Text>
    </View>
  );
}

export const AD_BANNER_HEIGHT = 50;

const styles = StyleSheet.create({
  banner: {
    height: AD_BANNER_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, letterSpacing: 0.5 },
});
