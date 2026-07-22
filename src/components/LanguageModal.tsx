import {
  Animated, Dimensions, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { SUPPORTED_LANGUAGES, useLang } from '../i18n';
import { ScrollBar } from './ScrollBar';

interface Props {
  visible: boolean;
  onClose: () => void;
  language: string;
  onPickLanguage: (code: string) => void;
  pal: Palette;
  themeColor: string;
}

const SW = Dimensions.get('window').width;

export function LanguageModal({
  visible, onClose, language, onPickLanguage, pal, themeColor,
}: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();
  const slideX = useRef(new Animated.Value(SW)).current;

  // Scrollbar — Animated.Value driven by Animated.event; no React state on scroll.
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const scrollFade = useRef(new Animated.Value(0.28)).current;

  const [contentH, setContentH] = useState(0);
  const [viewH,    setViewH]    = useState(0);

  const scrollEvent = useRef(
    Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollAnim } } }],
      { useNativeDriver: true }
    )
  ).current;

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

  const handlePick = (code: string) => {
    onPickLanguage(code);
    dismiss();
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
      <View style={[styles.header, { borderBottomColor: pal.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={pal.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: pal.text }]}>{t('language')}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Language list + absolute scrollbar overlay */}
      <View style={styles.listContainer}>
        <Animated.ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEventThrottle={16}
          onScroll={scrollEvent}
          onContentSizeChange={(_, h) => setContentH(h)}
          onLayout={e => setViewH(e.nativeEvent.layout.height)}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 20 }}
        >
          {SUPPORTED_LANGUAGES.map((lang, i) => {
            const selected = lang.code === language;
            return (
              <View key={lang.code}>
                <TouchableOpacity
                  style={[
                    styles.row,
                    { backgroundColor: selected ? themeColor + '15' : 'transparent' },
                  ]}
                  onPress={() => handlePick(lang.code)}
                  activeOpacity={0.55}
                >
                  <Text style={styles.flag}>{lang.flag}</Text>
                  <Text
                    style={[
                      styles.name,
                      { color: selected ? themeColor : pal.text },
                      selected && styles.nameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {lang.name}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color={themeColor} />}
                </TouchableOpacity>
                {i < SUPPORTED_LANGUAGES.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: pal.border }]} />
                )}
              </View>
            );
          })}
        </Animated.ScrollView>

        <ScrollBar
          scrollAnim={scrollAnim}
          contentH={contentH}
          viewH={viewH}
          fadeAnim={scrollFade}
          color={pal.sub}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, alignItems: 'center' },
  title:   { fontSize: 17, fontWeight: '600' },

  listContainer: { flex: 1 },
  list:          { flex: 1, marginRight: 6 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  flag:         { fontSize: 24 },
  name:         { flex: 1, fontSize: 15 },
  nameSelected: { fontWeight: '600' },

  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 4 },
});
