import { Animated, Modal, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { INTERVAL_OPTIONS } from '../constants';
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
}

export function NotificationModal({
  visible, onClose, intervalSeconds, onPickInterval,
  displayOnlyWord, onToggleDisplayOnlyWord, pal, themeColor,
}: Props) {
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
          <Text style={[s.dialogTitle, { color: pal.text }]}>Notifications</Text>

          {INTERVAL_OPTIONS.map(option => {
            const selected = option.seconds === intervalSeconds;
            const isOff = option.seconds === 0;
            return (
              <TouchableOpacity
                key={option.seconds}
                style={[s.intervalRow, { backgroundColor: selected ? themeColor + '18' : 'transparent' }]}
                onPress={() => onPickInterval(option.seconds)}
              >
                <Text style={[
                  s.intervalRowText,
                  { color: selected ? themeColor : isOff ? '#E05C5C' : pal.sub },
                  selected && s.intervalRowTextSelected,
                ]}>
                  {option.label}
                </Text>
                {selected && <Ionicons name="checkmark" size={16} color={themeColor} />}
              </TouchableOpacity>
            );
          })}

          <View style={[s.intervalRow, { backgroundColor: displayOnlyWord ? themeColor + '18' : 'transparent', marginTop: 4 }]}>
            <Text style={[s.intervalRowText, { color: displayOnlyWord ? themeColor : pal.sub, fontSize: 13 }, displayOnlyWord && s.intervalRowTextSelected]}>Display Only Word</Text>
            <Switch
              value={displayOnlyWord}
              onValueChange={onToggleDisplayOnlyWord}
              trackColor={{ false: pal.border, true: themeColor }}
              thumbColor="#fff"
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>

          <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
            <Text style={[s.cancelBtnText, { color: pal.sub }]}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
