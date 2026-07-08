import { Animated, Modal, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { INTERVAL_OPTIONS } from '../constants';
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
        <TouchableOpacity activeOpacity={1} style={[s.bottomSheet, { backgroundColor: pal.dialog }]}>

          {/* Header row: title + Send Test button */}
          <View style={styles.headerRow}>
            <Text style={[s.dialogTitle, { color: pal.text, marginBottom: 0 }]}>{t('notifications')}</Text>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={() => {
                onTest();
                setTestSent(true);
                setTimeout(() => setTestSent(false), 4000);
              }}
            >
              <Ionicons name="notifications-outline" size={13} color={pal.sub} />
              <Text style={[styles.testBtnText, { color: pal.sub }]}>
                {testSent ? t('test_sending') : t('test_send')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Interval options */}
          <View style={styles.list}>
            {INTERVAL_OPTIONS.map(option => {
              const selected = option.seconds === intervalSeconds;
              const isOff = option.seconds === 0;
              return (
                <TouchableOpacity
                  key={option.seconds}
                  style={[s.intervalRow, {
                    backgroundColor: selected ? themeColor + '15' : pal.chip,
                    borderColor:     selected ? themeColor : pal.border,
                  }]}
                  onPress={() => onPickInterval(option.seconds)}
                >
                  <Text style={[
                    s.intervalRowText,
                    { color: selected ? themeColor : isOff ? '#E05C5C' : pal.text },
                    selected && s.intervalRowTextSelected,
                  ]}>
                    {option.label}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color={themeColor} />}
                </TouchableOpacity>
              );
            })}

            {/* Display-only-word toggle */}
            <View style={[s.intervalRow, {
              backgroundColor: displayOnlyWord ? themeColor + '15' : pal.chip,
              borderColor:     displayOnlyWord ? themeColor : pal.border,
              marginBottom: 0,
            }]}>
              <Text style={[s.intervalRowText, { color: displayOnlyWord ? themeColor : pal.text, fontSize: 13 }, displayOnlyWord && s.intervalRowTextSelected]}>
                {t('display_only_word')}
              </Text>
              <Switch
                value={displayOnlyWord}
                onValueChange={onToggleDisplayOnlyWord}
                trackColor={{ false: pal.border, true: themeColor }}
                thumbColor="#fff"
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>
          </View>

          <TouchableOpacity style={[s.cancelBtn, { marginTop: 6 }]} onPress={handleClose}>
            <Text style={[s.cancelBtnText, { color: pal.sub }]}>{t('close')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:    { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  list: { marginBottom: 4 },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  testBtnText: { fontSize: 12 },
});
