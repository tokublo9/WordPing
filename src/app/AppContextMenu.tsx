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
  pal: Palette;
  // Temporarily disabled with the Hide Labels menu row:
  // context: 'cards' | 'folders';
  // showLevelLabels: boolean;
  onDismiss(): void;
  onSelectEntries(): void;
  onReorder(): void;
  // onToggleLevelLabels(): void;
  /**
   * Opens the AI Voice explanation. Owned by App rather than raised here: this
   * menu is itself a Modal, and presenting a second one from inside it would
   * change two native modals in a single commit.
   */
  onOpenAiVoiceInfo(): void;
  /**
   * Whether the AI Voice explanation belongs in this menu at all.
   *
   * High-Quality AI Voice is a Basic and Premium feature (VOICE_MONTHLY_LIMITS
   * gives Free zero generations), so on Free there is nothing for the
   * explanation to describe. The row and its separator are left out together —
   * a hidden row must not leave a divider behind it.
   *
   * This hides an explanation, not an offer: the Upgrade Plan sheet and every
   * other upgrade prompt are untouched.
   */
  showAiVoiceInfo: boolean;
  onOpenSettings(): void;
}

export function AppContextMenu({
  visible, anchor, pal,
  onDismiss, onSelectEntries, onReorder, onOpenAiVoiceInfo, showAiVoiceInfo, onOpenSettings,
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
        {/* Hide Labels is temporarily disabled. The complete row, including its
            separator, is kept here so restoring it cannot leave layout debris.
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
        */}

        {/* Thicker divider before settings group */}
        <View style={[styles.groupSep, { backgroundColor: pal.border }]} />

        {showAiVoiceInfo && (
          <>
            <TouchableOpacity
              style={styles.item}
              onPress={onOpenAiVoiceInfo}
              accessibilityRole="button"
              accessibilityLabel={t('ai_voice_info_menu')}
            >
              <Ionicons name="information-circle-outline" size={17} color={pal.text} />
              <Text style={[styles.itemText, { color: pal.text }]}>{t('ai_voice_info_menu')}</Text>
            </TouchableOpacity>
            {/* Belongs to the row above, so it disappears with it and Settings
                sits directly under the group divider on Free. */}
            <View style={[styles.sep, { backgroundColor: pal.border }]} />
          </>
        )}
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
  itemText: { flexShrink: 1, fontSize: 15 },
  sep:      { height: StyleSheet.hairlineWidth },
  groupSep: { height: 3 },
});
