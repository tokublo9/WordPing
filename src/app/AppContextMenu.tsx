import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Palette } from '../types';
import { useLang } from '../i18n';

export interface AppContextMenuProps {
  visible: boolean;
  anchor: { top: number; right: number };
  context: 'cards' | 'folders';
  pal: Palette;
  showLevelLabels: boolean;
  onDismiss(): void;
  onSelectEntries(): void;
  onReorder(): void;
  onToggleLevelLabels(): void;
  onOpenSettings(): void;
}

export function AppContextMenu({
  visible, anchor, context, pal, showLevelLabels,
  onDismiss, onSelectEntries, onReorder, onToggleLevelLabels, onOpenSettings,
}: AppContextMenuProps) {
  const t = useLang();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        activeOpacity={0}
        onPress={onDismiss}
      />
      <View style={[
        styles.card,
        { top: anchor.top, right: anchor.right, backgroundColor: pal.dialog, borderWidth: 1, borderColor: pal.border },
      ]}>
        {/* Group 1: Management actions */}
        <TouchableOpacity style={styles.item} onPress={onSelectEntries}>
          <Ionicons name="checkmark-circle-outline" size={17} color={pal.text} />
          <Text style={[styles.itemText, { color: pal.text }]}>{t('select_entries')}</Text>
        </TouchableOpacity>
        <View style={[styles.sep, { backgroundColor: pal.border }]} />
        <TouchableOpacity style={styles.item} onPress={onReorder}>
          <Ionicons name="swap-vertical-outline" size={17} color={pal.text} />
          <Text style={[styles.itemText, { color: pal.text }]}>{t('reorder_cards')}</Text>
        </TouchableOpacity>
        {context === 'cards' && (
          <>
            <View style={[styles.sep, { backgroundColor: pal.border }]} />
            <TouchableOpacity style={styles.item} onPress={onToggleLevelLabels}>
              <Ionicons
                name={showLevelLabels ? 'eye-off-outline' : 'eye-outline'}
                size={17}
                color={pal.text}
              />
              <Text style={[styles.itemText, { color: pal.text }]}>
                {t(showLevelLabels ? 'hide_level_labels' : 'show_level_labels')}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Thicker divider before settings group */}
        <View style={[styles.groupSep, { backgroundColor: pal.border }]} />

        <TouchableOpacity style={styles.item} onPress={onOpenSettings}>
          <Ionicons name="settings-outline" size={17} color={pal.text} />
          <Text style={[styles.itemText, { color: pal.text }]}>{t('settings')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    minWidth: 190,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  itemText: { fontSize: 15 },
  sep:      { height: StyleSheet.hairlineWidth },
  groupSep: { height: 3 },
});
