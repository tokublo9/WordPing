import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useEffect, useRef } from 'react';

import type { Palette, WordCard } from '../types';
import { useLang } from '../i18n';
import { appStyles as s } from '../styles';

interface Props {
  visible: boolean;
  onClose: () => void;
  editingCard: WordCard | null;
  word: string;
  onChangeWord: (v: string) => void;
  meaning: string;
  onChangeMeaning: (v: string) => void;
  note: string;
  onChangeNote: (v: string) => void;
  onSave: () => void;
  pal: Palette;
  themeColor: string;
}

export function WordModal({
  visible, onClose, editingCard,
  word, onChangeWord, meaning, onChangeMeaning, note, onChangeNote,
  onSave, pal, themeColor,
}: Props) {
  const t = useLang();
  const slideY          = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const bottomOffset    = useRef(new Animated.Value(0)).current;

  // Track keyboard height so the sheet anchor always sits above it.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, e => {
      Animated.timing(bottomOffset, {
        toValue: e.endCoordinates.height,
        duration: e.duration ?? 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });

    const onHide = Keyboard.addListener(hideEvent, e => {
      Animated.timing(bottomOffset, {
        toValue: 0,
        duration: e.duration ?? 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });

    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  useEffect(() => {
    if (visible) {
      slideY.setValue(600);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: false }),
        Animated.timing(slideY, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(slideY, { toValue: 600, duration: 220, useNativeDriver: false }),
    ]).start(() => onClose());
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropOpacity }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      {/* Outer: fills the full space between screen top and keyboard top.
          justifyContent 'flex-end' pins the sheet to the bottom of this space. */}
      <Animated.View
        style={[styles.sheetOuter, { bottom: bottomOffset }]}
        pointerEvents="box-none"
      >
        <View style={styles.sheetFill} pointerEvents="box-none">
          {/* Inner: slides in from below */}
          <Animated.View
            style={{ transform: [{ translateY: slideY }] }}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[s.bottomSheet, { backgroundColor: pal.dialog, paddingBottom: 12 }]}
            >
              {/* Scrollable input section — handles the rare case where content
                  doesn't fit in the space above the keyboard */}
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={[s.inputLabel, { color: pal.sub }]}>{t('word_label')}</Text>
                <TextInput
                  style={[s.input, s.inputMultiline, { borderColor: pal.border, backgroundColor: pal.input, color: pal.text }]}
                  value={word}
                  onChangeText={onChangeWord}
                  autoFocus
                  multiline
                  scrollEnabled={false}
                />

                <Text style={[s.inputLabel, { color: pal.sub }]}>{t('meaning_label')}</Text>
                <TextInput
                  style={[s.input, s.inputMultiline, { borderColor: pal.border, backgroundColor: pal.input, color: pal.text }]}
                  value={meaning}
                  onChangeText={onChangeMeaning}
                  multiline
                  scrollEnabled={false}
                />

                <Text style={[s.inputLabel, { color: pal.sub }]}>{t('note_label')}</Text>
                <TextInput
                  style={[s.input, s.inputMultiline, { borderColor: pal.border, backgroundColor: pal.input, color: pal.text }]}
                  value={note}
                  onChangeText={onChangeNote}
                  multiline
                  scrollEnabled={false}
                />
              </ScrollView>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: pal.chip }]}
                  onPress={handleClose}
                >
                  <Text style={[styles.btnText, { color: pal.sub }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: themeColor }]}
                  onPress={onSave}
                >
                  <Text style={[styles.btnText, { color: '#fff' }]}>{t('save')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {/* Fills any gap between the sheet bottom and the keyboard */}
            <View
              style={[styles.bottomCover, { backgroundColor: pal.dialog }]}
              pointerEvents="none"
            />
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:    { backgroundColor: 'rgba(0,0,0,0.45)' },
  // Occupies the full region from screen top to keyboard top.
  sheetOuter:  { position: 'absolute', top: 0, left: 0, right: 0 },
  // Pushes the sheet to the bottom of the available region.
  sheetFill:   { flex: 1, justifyContent: 'flex-end' },
  buttonRow:   { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn:         { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnText:     { fontSize: 16, fontWeight: '700' },
  bottomCover: { position: 'absolute', bottom: -200, left: 0, right: 0, height: 200 },
});
