import { StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Palette } from '../types';

interface Props {
  cardCount: number;
  untestedCount: number;
  themeColor: string;
  pal: Palette;
}

export function TestStatusIcon({ cardCount, untestedCount, themeColor, pal }: Props) {
  if (cardCount === 0) return null;

  const complete = untestedCount === 0;

  return (
    <View>
      <Ionicons
        name={complete ? 'school' : 'school-outline'}
        size={24}
        color={complete ? themeColor : pal.sub}
      />
      {complete ? (
        <View style={[styles.badge, { backgroundColor: themeColor }]}>
          <MaterialCommunityIcons name="check-bold" size={9} color="#fff" />
        </View>
      ) : untestedCount > 0 ? (
        (() => {
          const over99    = untestedCount > 99;
          const label     = over99 ? '99+' : String(untestedCount);
          const twoDigit  = !over99 && untestedCount >= 10;
          return (
            <View style={[
              styles.badge,
              over99 && styles.badgePill,
              { backgroundColor: themeColor, borderColor: '#fff', borderWidth: 1 },
            ]}>
              <Text style={[styles.badgeText, twoDigit && styles.badgeTextSm, { color: '#fff' }]}>
                {label}
              </Text>
            </View>
          );
        })()
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed circle for all counts 1–99 — no horizontal padding so it never goes oval.
  badge: {
    position: 'absolute',
    bottom: -4,
    right: -5,
    width: 15,
    height: 15,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Wider pill only for "99+" so all three characters remain readable.
  badgePill: {
    width: undefined,
    paddingHorizontal: 3,
  },
  badgeText:   { fontSize: 10, fontWeight: '600', lineHeight: 12 },
  badgeTextSm: { fontSize: 8 },
});
