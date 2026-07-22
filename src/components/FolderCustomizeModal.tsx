import {
  Animated,
  Dimensions,
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
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Palette } from '../types';
import { useLang } from '../i18n';
import { appStyles as s } from '../styles';
import { AdBannerPlaceholder, AD_BANNER_HEIGHT } from './AdBannerPlaceholder';

const SCREEN_H = Dimensions.get('window').height;

export const FOLDER_ICONS = [
  'folder-outline',       'folder-open-outline',  'book-outline',
  'star-outline',         'heart-outline',         'briefcase-outline',
  'school-outline',       'globe-outline',         'musical-notes-outline',
  'home-outline',         'leaf-outline',          'flash-outline',
  'cafe-outline',         'airplane-outline',      'ribbon-outline',
  'fitness-outline',
] as const;

export const FOLDER_COLORS = [
  '#7C6BF8', '#3B82F6', '#EC4899', '#14B8A6',
  '#FF6B6B', '#F59E0B', '#10B981', '#6366F1',
];

interface Props {
  visible: boolean;
  // 'edit' = combined rename + icon picker; 'icon' = icon only; 'color' = color only
  mode: 'edit' | 'icon' | 'color';
  /** When true, the modal title shows "New Folder" instead of "Edit Folder" */
  isNew?: boolean;
  currentValue: string;
  folderName: string;
  onSelect: (value: string) => void;
  // Only used in 'edit' mode — called with (newName, newIcon) on Save
  onSaveEdit?: (name: string, icon: string) => void;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
  isSubscribed?: boolean;
}

export function FolderCustomizeModal({
  visible, mode, isNew, currentValue, folderName,
  onSelect, onSaveEdit, onClose, pal, themeColor, isSubscribed,
}: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();

  const [selectedIcon, setSelectedIcon] = useState(currentValue);
  const [editName,     setEditName]     = useState(folderName);
  const [kbHeight,     setKbHeight]     = useState(0);

  const slideY          = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, e => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (visible) {
      setSelectedIcon(currentValue);
      setEditName(folderName);
      slideY.setValue(SCREEN_H);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(slideY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    }
  }, [visible, currentValue, folderName]);

  const close = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(slideY, { toValue: SCREEN_H, duration: 220, useNativeDriver: false }),
    ]).start(() => onClose());
  };

  const handleSave = () => {
    if (mode === 'edit') {
      const trimmed = editName.trim();
      if (!trimmed) return;
      onSaveEdit?.(trimmed, selectedIcon);
      close();
    } else {
      onSelect(selectedIcon);
      close();
    }
  };

  const title =
    mode === 'edit'  ? (isNew ? t('new_folder') : t('edit_folder')) :
    mode === 'icon'  ? t('change_icon') :
                       t('change_color');

  const totalH  = Math.round(SCREEN_H * 0.88);
  const sheetH  = totalH - (isSubscribed ? 0 : AD_BANNER_HEIGHT) - insets.bottom;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={close}>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropOpacity }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <View style={styles.sheetOuter} pointerEvents="box-none">
        <View style={styles.sheetFill} pointerEvents="box-none">
          <Animated.View style={{ transform: [{ translateY: slideY }] }}>
            {/* Rounded content sheet */}
            <View style={[styles.sheet, { backgroundColor: pal.dialog, height: sheetH }]}>
              {/* Drag handle */}
              <View style={styles.handleArea}>
                <View style={[styles.handle, { backgroundColor: pal.border }]} />
              </View>

              {/* Header */}
              <View style={styles.headerRow}>
                <Text style={[styles.headerTitle, { color: pal.text }]}>{title}</Text>
                <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color={pal.sub} />
                </TouchableOpacity>
              </View>

              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
              >
                {/* Folder preview / name field */}
                <View style={[styles.preview, { backgroundColor: pal.chip }]}>
                  <View style={[styles.previewIconWrap, { backgroundColor: themeColor + '22' }]}>
                    <Ionicons name={selectedIcon as any} size={26} color={themeColor} />
                  </View>
                  {mode === 'edit' ? (
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      style={[styles.previewNameInput, { color: pal.text }]}
                      placeholder={t('folder_name_placeholder')}
                      placeholderTextColor={pal.sub}
                      maxLength={50}
                      returnKeyType="done"
                      onSubmitEditing={handleSave}
                    />
                  ) : (
                    <Text style={[styles.previewName, { color: pal.text }]} numberOfLines={1}>
                      {folderName}
                    </Text>
                  )}
                </View>

                {/* Icon grid — shown in 'edit' and 'icon' modes */}
                {(mode === 'edit' || mode === 'icon') && (
                  <>
                    {mode === 'edit' && (
                      <Text style={[styles.gridLabel, { color: pal.sub }]}>Icon</Text>
                    )}
                    <View style={styles.iconGrid}>
                      {FOLDER_ICONS.map(icon => {
                        const active = selectedIcon === icon;
                        return (
                          <TouchableOpacity
                            key={icon}
                            style={[styles.iconCell, { backgroundColor: active ? themeColor + '22' : pal.chip }]}
                            onPress={() => setSelectedIcon(icon)}
                          >
                            <Ionicons name={icon as any} size={24} color={active ? themeColor : pal.sub} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Color grid — only in 'color' mode */}
                {mode === 'color' && (
                  <View style={styles.colorGrid}>
                    {FOLDER_COLORS.map(color => (
                      <TouchableOpacity
                        key={color}
                        style={[styles.colorSwatch, { backgroundColor: color }]}
                        onPress={() => { onSelect(color); close(); }}
                      >
                        {currentValue === color && <Ionicons name="checkmark" size={18} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

              </ScrollView>

              {/* Button row — fixed at bottom of sheet */}
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: pal.chip }]}
                  onPress={close}
                >
                  <Text style={[styles.btnText, { color: pal.sub }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                {mode !== 'color' && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: themeColor }]}
                    onPress={handleSave}
                  >
                    <Text style={[styles.btnText, { color: '#fff' }]}>{t('save')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Banner — same position as main folder screen */}
            {!isSubscribed && <AdBannerPlaceholder pal={pal} />}

            {/* Safe-area spacer — pal.bg matches main screen's SafeAreaView background */}
            {insets.bottom > 0 && (
              <View style={{ height: insets.bottom, backgroundColor: pal.bg }} />
            )}
          </Animated.View>
        </View>
      </View>

      {/* Floating keyboard toolbar — Save (left) + dismiss (right) */}
      {kbHeight > 0 && (
        <View style={[styles.kbToolbar, { bottom: kbHeight }]}>
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.kbBtn, { backgroundColor: themeColor }]}
          >
            <Text style={[styles.kbBtnText, { color: '#fff' }]}>{t('save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={Keyboard.dismiss}
            style={[styles.kbBtn, { backgroundColor: pal.chip }]}
          >
            <Ionicons name="chevron-down" size={16} color={pal.sub} />
          </TouchableOpacity>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:    { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetOuter:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetFill:   { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 6,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 16,
  },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 12, marginBottom: 16,
  },
  previewIconWrap: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  previewName: { fontSize: 16, fontWeight: '600', flex: 1 },
  previewNameInput: {
    flex: 1, fontSize: 16, fontWeight: '600',
    paddingVertical: 2,
  },
  gridLabel: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 8,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  iconCell: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  colorGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    marginBottom: 20, paddingVertical: 4,
  },
  colorSwatch: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20 },
  btn:       { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnText:   { fontSize: 16, fontWeight: '700' },

  kbToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  kbBtn: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    height: 36,
    shadowColor: '#000',
    shadowOpacity: 0.20,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  kbBtnText: { fontSize: 15, fontWeight: '700' },
});
