import {
  Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '../types';
import { useLang } from '../i18n';
import { appStyles as s } from '../styles';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  pal: Palette;
  themeColor: string;
  initialName?: string;
  mode?: 'create' | 'rename';
}

export function AddFolderModal({
  visible, onClose, onCreate, pal, themeColor,
  initialName = '', mode = 'create',
}: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) setName(initialName);
  }, [visible, initialName]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    onClose();
  };

  const actionText = mode === 'rename' ? t('save') : t('create');

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* Backdrop dismiss area */}
      <TouchableOpacity
        style={[StyleSheet.absoluteFillObject, styles.backdrop]}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Dialog fixed near the top — does not move when keyboard opens */}
      <View
        style={[styles.positioner, { paddingTop: insets.top + 56 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity activeOpacity={1} style={styles.dialogWrap}>
          <View style={[styles.dialog, { backgroundColor: pal.dialog }]}>
            {/* Rename mode shows a title; create mode is intentionally labelless */}
            {mode === 'rename' && (
              <Text style={[s.dialogTitle, { color: pal.text }]}>{t('rename_folder')}</Text>
            )}

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="New Folder name"
              placeholderTextColor={pal.sub}
              style={[s.input, { borderColor: pal.border, backgroundColor: pal.input, color: pal.text, marginBottom: 16 }]}
              autoFocus
              maxLength={50}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: pal.chip }]} onPress={onClose}>
                <Text style={[styles.btnText, { color: pal.sub }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: themeColor }]} onPress={handleCreate}>
                <Text style={[styles.btnText, { color: '#fff' }]}>{actionText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  positioner: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 24,
  },
  dialogWrap: { width: '100%' },
  dialog: {
    borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  btn:       { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnText:   { fontSize: 16, fontWeight: '700' },
});
