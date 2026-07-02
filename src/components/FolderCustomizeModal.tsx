import {
  Modal, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Palette } from '../types';
import { useLang } from '../i18n';
import { appStyles as s } from '../styles';

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
  mode: 'icon' | 'color';
  currentValue: string;
  folderName: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
}

export function FolderCustomizeModal({
  visible, mode, currentValue, folderName, onSelect, onClose, pal, themeColor,
}: Props) {
  const t = useLang();
  const [selectedIcon, setSelectedIcon] = useState(currentValue);

  useEffect(() => {
    if (visible) setSelectedIcon(currentValue);
  }, [visible, currentValue]);

  const handleSave = () => {
    onSelect(selectedIcon);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />

        <TouchableOpacity activeOpacity={1} style={styles.dialogWrap}>
          <View style={[styles.dialog, { backgroundColor: pal.dialog }]}>
            <Text style={[s.dialogTitle, { color: pal.text }]}>
              {t(mode === 'icon' ? 'change_icon' : 'change_color')}
            </Text>

            {/* Folder preview — shows live as user taps icons */}
            <View style={[styles.preview, { backgroundColor: pal.chip }]}>
              <View style={[styles.previewIconWrap, { backgroundColor: themeColor + '22' }]}>
                <Ionicons name={selectedIcon as any} size={26} color={themeColor} />
              </View>
              <Text style={[styles.previewName, { color: pal.text }]} numberOfLines={1}>
                {folderName}
              </Text>
            </View>

            {mode === 'icon' ? (
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
            ) : (
              <View style={styles.colorGrid}>
                {FOLDER_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[styles.colorSwatch, { backgroundColor: color }]}
                    onPress={() => { onSelect(color); onClose(); }}
                  >
                    {currentValue === color && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: pal.chip }]}
                onPress={onClose}
              >
                <Text style={[styles.btnText, { color: pal.sub }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: themeColor }]}
                onPress={handleSave}
              >
                <Text style={[styles.btnText, { color: '#fff' }]}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 24,
  },
  dialogWrap: { width: '100%' },
  dialog: {
    borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
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
  iconGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20,
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
  buttonRow: { flexDirection: 'row', gap: 10 },
  btn:       { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnText:   { fontSize: 16, fontWeight: '700' },
});
