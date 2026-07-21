import {
  Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { useLang, type TranslationKey } from '../i18n';

const SW = Dimensions.get('window').width;

interface Props {
  visible: boolean;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
}

const STEP_KEYS: { icon: string; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { icon: 'folder-outline',        titleKey: 'tut1_title', descKey: 'tut1_desc' },
  { icon: 'add-circle-outline',    titleKey: 'tut2_title', descKey: 'tut2_desc' },
  { icon: 'albums-outline',        titleKey: 'tut3_title', descKey: 'tut3_desc' },
  { icon: 'school-outline',        titleKey: 'tut4_title', descKey: 'tut4_desc' },
  { icon: 'notifications-outline', titleKey: 'tut5_title', descKey: 'tut5_desc' },
  { icon: 'volume-high-outline',   titleKey: 'tut6_title', descKey: 'tut6_desc' },
  { icon: 'flash-outline',         titleKey: 'tut7_title', descKey: 'tut7_desc' },
];

export function TutorialModal({ visible, onClose, pal, themeColor }: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();
  const slideX = useRef(new Animated.Value(SW)).current;

  useEffect(() => {
    if (visible) {
      slideX.setValue(SW);
      Animated.spring(slideX, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    }
  }, [visible]);

  const dismiss = () => {
    Animated.timing(slideX, { toValue: SW, duration: 220, useNativeDriver: true })
      .start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: pal.bg, paddingTop: insets.top, transform: [{ translateX: slideX }] },
      ]}
    >
      {/* Navigation bar */}
      <View style={[styles.navBar, { borderBottomColor: pal.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={dismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={pal.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: pal.text }]}>{t('how_to_use')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Decorative icon */}
        <View style={styles.iconHeader}>
          <View style={[styles.iconCircle, { backgroundColor: themeColor + '22' }]}>
            <Ionicons name="help-circle-outline" size={28} color={themeColor} />
          </View>
        </View>

        {/* Steps */}
        {STEP_KEYS.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.iconWrap, { backgroundColor: themeColor + '18' }]}>
              <Ionicons name={step.icon as any} size={22} color={themeColor} />
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, { color: pal.text }]}>{t(step.titleKey)}</Text>
              <Text style={[styles.stepDesc,  { color: pal.sub  }]}>{t(step.descKey)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:  { width: 44, alignItems: 'center' },
  navTitle: { fontSize: 17, fontWeight: '600' },

  content:    { paddingHorizontal: 24, paddingBottom: 56 },
  iconHeader: { alignItems: 'center', paddingTop: 24, paddingBottom: 28 },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },

  step: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14, flexShrink: 0,
  },
  stepText:  { flex: 1 },
  stepTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  stepDesc:  { fontSize: 14, lineHeight: 20 },
});
