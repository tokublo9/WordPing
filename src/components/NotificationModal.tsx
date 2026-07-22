import { Animated, Modal, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { INTERVAL_OPTIONS, TOGGLE_OFF_TRACK_COLOR } from '../constants';
import { useLang } from '../i18n';
import { appStyles as s } from '../styles';

interface Props {
  visible: boolean;
  onClose: () => void;
  intervalSeconds: number;
  onPickInterval: (seconds: number) => void;
  displayOnlyWord: boolean;
  onToggleDisplayOnlyWord: (value: boolean) => void;
  pal: Palette;
  themeColor: string;
  onTest: () => void;
}

export function NotificationModal({
  visible, onClose, intervalSeconds, onPickInterval,
  displayOnlyWord, onToggleDisplayOnlyWord, pal, themeColor, onTest,
}: Props) {
  const t = useLang();
  const [testSent, setTestSent] = useState(false);
  const slideY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideY.setValue(600);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 600, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      {/* Backdrop — fades in place, does not slide */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropOpacity }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      {/* Sheet — slides up independently */}
      <Animated.View style={[styles.sheetWrapper, { transform: [{ translateY: slideY }] }]}>
        <TouchableOpacity
          activeOpacity={1}
          style={[s.bottomSheet, styles.sheet, { backgroundColor: pal.dialog, borderColor: pal.border }]}
        >

          {/* Header row: title + Send Test button + close */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleRow}>
              <Text style={[s.dialogTitle, styles.headerTitle, { color: pal.text }]} numberOfLines={1}>
                {t('notifications')}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.testBtn, { backgroundColor: themeColor + '0F', borderColor: themeColor + '45' }]}
                onPress={() => {
                  onTest();
                  setTestSent(true);
                  setTimeout(() => setTestSent(false), 4000);
                }}
              >
                <Text style={[styles.testBtnText, { color: themeColor }]} numberOfLines={1}>
                  {testSent ? t('test_sending') : t('test_send')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: pal.input }]}
                onPress={handleClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={19} color={pal.sub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Interval options */}
          <View style={styles.list}>
            <View style={styles.intervalGrid}>
              {INTERVAL_OPTIONS.map(option => {
                const selected = option.seconds === intervalSeconds;
                const isOff = option.seconds === 0;
                return (
                  <TouchableOpacity
                    key={option.seconds}
                    style={[
                      styles.intervalOption,
                      {
                        backgroundColor: selected ? themeColor + '12' : pal.input,
                        borderColor: selected ? themeColor : pal.border,
                        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                    onPress={() => onPickInterval(option.seconds)}
                    activeOpacity={0.76}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.intervalText,
                        { color: selected ? themeColor : isOff ? '#E05C5C' : pal.text },
                        selected && styles.intervalTextSelected,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Content preference — deliberately separate from schedule choices. */}
            <View style={styles.contentSeparator}>
              <View style={[styles.separatorLine, { backgroundColor: pal.border }]} />
            </View>

            <TouchableOpacity
              style={[
                styles.contentCard,
                {
                  backgroundColor: displayOnlyWord ? themeColor + '10' : pal.card,
                  borderColor: displayOnlyWord ? themeColor + '80' : pal.border,
                },
              ]}
              onPress={() => onToggleDisplayOnlyWord(!displayOnlyWord)}
              activeOpacity={0.78}
              accessibilityRole="switch"
              accessibilityState={{ checked: displayOnlyWord }}
            >
              <View style={styles.contentTextWrap}>
                <Text style={[styles.contentTitle, { color: displayOnlyWord ? themeColor : pal.text }]}>
                  {t('display_only_word')}
                </Text>
                <Text style={[styles.contentDescription, { color: pal.sub }]}>
                  {t('display_only_word_desc')}
                </Text>
              </View>
              <Switch
                value={displayOnlyWord}
                onValueChange={onToggleDisplayOnlyWord}
                trackColor={{ false: TOGGLE_OFF_TRACK_COLOR, true: themeColor }}
                thumbColor="#fff"
                ios_backgroundColor={TOGGLE_OFF_TRACK_COLOR}
                accessible={false}
                pointerEvents="none"
                style={styles.contentSwitch}
              />
            </TouchableOpacity>
          </View>

        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:    { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { flexShrink: 1, marginBottom: 0, fontSize: 20 },
  list: { marginBottom: 4 },
  headerRight: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1,
  },
  testBtnText: { fontSize: 12, fontWeight: '600' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  intervalGrid: { gap: 6 },
  intervalOption: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  intervalText: { width: '100%', fontSize: 14.5, fontWeight: '500' },
  intervalTextSelected: { fontWeight: '700' },
  contentSeparator: {
    height: 1,
    marginTop: 20,
    marginBottom: 18,
  },
  separatorLine: { height: StyleSheet.hairlineWidth },
  contentCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  contentTextWrap: { flex: 1, paddingRight: 12 },
  contentTitle: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  contentDescription: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  contentSwitch: { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] },
});
