import {
  Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { useLang, type TranslationKey } from '../i18n';

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
  const slideY = useRef(new Animated.Value(900)).current;

  useEffect(() => {
    if (visible) {
      slideY.setValue(900);
      Animated.spring(slideY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    }
  }, [visible]);

  const dismiss = () => {
    Animated.timing(slideY, { toValue: 900, duration: 240, useNativeDriver: true })
      .start(() => onClose());
  };

  if (!visible) return null;

  const closeBtnTop = insets.top + 8;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: pal.bg, transform: [{ translateY: slideY }] },
      ]}
    >
      <TouchableOpacity
        style={[styles.closeBtn, { top: closeBtnTop }]}
        onPress={dismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={22} color={pal.sub} />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: closeBtnTop + 40 }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: themeColor + '22' }]}>
            <Ionicons name="help-circle-outline" size={28} color={themeColor} />
          </View>
          <Text style={[styles.title, { color: pal.text }]}>{t('how_to_use')}</Text>
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
  closeBtn: { position: 'absolute', left: 20, zIndex: 10, padding: 4 },
  content:  { paddingHorizontal: 24, paddingBottom: 56 },

  header: { alignItems: 'center', paddingBottom: 28 },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: { fontSize: 24, fontWeight: '700' },

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
