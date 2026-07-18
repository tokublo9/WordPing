import {
  Animated, Dimensions, Modal, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
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

const SCREEN_H = Dimensions.get('window').height;
const SHEET_H  = Math.min(Math.round(SCREEN_H * 0.88), SCREEN_H - 56);

export function LanguageModal({
  visible, onClose, language, onPickLanguage, pal, themeColor,
}: Props) {
  const t = useLang();
  const slideY          = useRef(new Animated.Value(SHEET_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Scrollbar — Animated.Value driven by Animated.event; no React state on scroll.
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const scrollFade = useRef(new Animated.Value(0.28)).current; // constant: always visible at low opacity

  // Layout dimensions for the scrollbar geometry (infrequent updates).
  const [contentH, setContentH] = useState(0);
  const [viewH,    setViewH]    = useState(0);

  // Stable scroll event handler — created once.
  const scrollEvent = useRef(
    Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollAnim } } }],
      { useNativeDriver: true }
    )
  ).current;

  useEffect(() => {
    if (visible) {
      slideY.setValue(SHEET_H);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: SHEET_H, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const handlePick = (code: string) => {
    onPickLanguage(code);
    dismiss();
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={dismiss}>

      {/* Dimmed backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropOpacity }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={dismiss} />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { height: SHEET_H, backgroundColor: pal.dialog, transform: [{ translateY: slideY }] },
        ]}
      >
        {/* Header row: title + close button */}
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: pal.text }]}>{t('language')}</Text>
          <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={pal.sub} />
          </TouchableOpacity>
        </View>

        {/* Language list + absolute scrollbar overlay */}
        <View style={styles.listContainer}>
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            bounces={false}
            scrollEventThrottle={16}
            onScroll={scrollEvent}
            onContentSizeChange={(_, h) => setContentH(h)}
            onLayout={e => setViewH(e.nativeEvent.layout.height)}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 36 : 20 }}
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
          </ScrollView>

          <ScrollBar
            scrollAnim={scrollAnim}
            contentH={contentH}
            viewH={viewH}
            fadeAnim={scrollFade}
            color={pal.sub}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },

  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'column',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 8,
  },

  title: { fontSize: 20, fontWeight: '700' },

  listContainer: { flex: 1 },

  list: { flex: 1 },

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
