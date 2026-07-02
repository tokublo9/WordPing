import {
  Alert, Animated, Easing, Modal,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Folder, Palette } from '../types';
import { useLang } from '../i18n';

// ── Icon & color palettes for folder customisation ────────────────────────────

export const FOLDER_ICONS = [
  'folder-outline', 'folder-open-outline', 'book-outline',
  'star-outline', 'heart-outline', 'briefcase-outline',
  'school-outline', 'globe-outline', 'musical-notes-outline',
  'home-outline', 'leaf-outline', 'flash-outline',
  'cafe-outline', 'airplane-outline', 'ribbon-outline', 'fitness-outline',
] as const;

export const FOLDER_COLORS = [
  '#7C6BF8', '#3B82F6', '#EC4899', '#14B8A6',
  '#FF6B6B', '#F59E0B', '#10B981', '#6366F1',
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  folder: Folder | null;
  onClose: () => void;
  onRename: (folder: Folder) => void;
  onChangeIcon: (id: string, icon: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  pal: Palette;
  themeColor: string;
}

type SheetView = 'main' | 'icon' | 'color';

export function FolderActionSheet({
  visible, folder, onClose,
  onRename, onChangeIcon, onChangeColor, onDelete,
  pal, themeColor,
}: Props) {
  const t      = useLang();
  const slideY = useRef(new Animated.Value(500)).current;
  const fade   = useRef(new Animated.Value(0)).current;
  const [view, setView] = useState<SheetView>('main');

  useEffect(() => {
    if (visible) {
      setView('main');
      slideY.setValue(500);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(fade,   { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(slideY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    }
  }, [visible, slideY, fade]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fade,   { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(slideY, { toValue: 500, duration: 220, useNativeDriver: false }),
    ]).start(() => onClose());
  };

  const handleDelete = () => {
    if (!folder) return;
    Alert.alert(
      t('delete_folder'),
      folder.name,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: () => { onDelete(folder.id); handleClose(); },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: fade }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <View style={styles.outer} pointerEvents="box-none">
        <Animated.View
          style={[styles.sheet, { backgroundColor: pal.dialog, transform: [{ translateY: slideY }] }]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: pal.border }]} />

          {/* Folder name label */}
          {folder && (
            <Text style={[styles.folderLabel, { color: pal.sub }]} numberOfLines={1}>
              {folder.name}
            </Text>
          )}

          {view === 'main' && (
            <>
              <ActionRow
                icon="pencil-outline"
                label={t('rename_folder')}
                pal={pal}
                onPress={() => { if (folder) { onRename(folder); handleClose(); } }}
              />
              <ActionRow
                icon="grid-outline"
                label={t('change_icon')}
                pal={pal}
                onPress={() => setView('icon')}
              />
              <ActionRow
                icon="color-palette-outline"
                label={t('change_color')}
                pal={pal}
                onPress={() => setView('color')}
              />
              <ActionRow
                icon="trash-outline"
                label={t('delete_folder')}
                pal={pal}
                color="#E05C5C"
                onPress={handleDelete}
              />
            </>
          )}

          {view === 'icon' && (
            <>
              <TouchableOpacity style={styles.backRow} onPress={() => setView('main')}>
                <Ionicons name="chevron-back" size={18} color={themeColor} />
                <Text style={[styles.backText, { color: themeColor }]}>{t('change_icon')}</Text>
              </TouchableOpacity>
              <View style={styles.iconGrid}>
                {FOLDER_ICONS.map(icon => {
                  const active = (folder?.icon ?? 'folder-outline') === icon;
                  return (
                    <TouchableOpacity
                      key={icon}
                      style={[
                        styles.iconCell,
                        { backgroundColor: active ? themeColor + '22' : pal.chip },
                      ]}
                      onPress={() => {
                        if (folder) { onChangeIcon(folder.id, icon); handleClose(); }
                      }}
                    >
                      <Ionicons
                        name={icon as any}
                        size={24}
                        color={active ? themeColor : pal.sub}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {view === 'color' && (
            <>
              <TouchableOpacity style={styles.backRow} onPress={() => setView('main')}>
                <Ionicons name="chevron-back" size={18} color={themeColor} />
                <Text style={[styles.backText, { color: themeColor }]}>{t('change_color')}</Text>
              </TouchableOpacity>
              <View style={styles.colorRow}>
                {FOLDER_COLORS.map(color => {
                  const activeColor = folder?.color ?? themeColor;
                  const isActive = activeColor === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[styles.colorSwatch, { backgroundColor: color }]}
                      onPress={() => {
                        if (folder) { onChangeColor(folder.id, color); handleClose(); }
                      }}
                    >
                      {isActive && (
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── ActionRow ─────────────────────────────────────────────────────────────────

function ActionRow({
  icon, label, pal, color, onPress,
}: {
  icon: string; label: string; pal: Palette; color?: string; onPress: () => void;
}) {
  const textColor = color ?? pal.text;
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress}>
      <Ionicons name={icon as any} size={20} color={textColor} />
      <Text style={[styles.actionLabel, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  outer:    { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },
  folderLabel: {
    fontSize: 13, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 15,
  },
  actionLabel: { fontSize: 16 },
  backRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 12, marginBottom: 8,
  },
  backText: { fontSize: 15, fontWeight: '600' },
  iconGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  iconCell: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  colorRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingVertical: 8,
  },
  colorSwatch: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
});
