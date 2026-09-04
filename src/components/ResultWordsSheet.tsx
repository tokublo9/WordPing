import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { Palette, WordCard } from '../types';
import { useLang } from '../i18n';
import { LEVEL_FILTER_OPTIONS, TEST_LEVEL_LABEL_KEYS } from '../features/cards/levels';
import type { ResultColorFilter } from '../features/cards/resultFilterCopy';
import { HiddenWordIcon } from './HiddenWordIcon';
import { isWordTextHidden } from '../features/cards/hideWordAccess';

const SCREEN_H = Dimensions.get('window').height;
const SHEET_H = Math.round(SCREEN_H * 0.7);

/**
 * The words being held under one colour, reached from that colour's explanation.
 *
 * Deliberately a narrow surface: select and delete, and nothing else. There is
 * no edit, no move, no notification toggle and no voice — the Word List is where
 * a word is worked on, and this sheet exists to clear out words that are resting
 * out of sight. It writes nothing to a card but its deletion: a word left alone
 * here keeps its result and comes back on its own when its interval ends.
 *
 * The list is a snapshot passed in by the screen. Deleting rebuilds it from the
 * caller's state, so the sheet never has to decide what belongs under a colour —
 * that rule lives in `testSchedule.ts` and has exactly one implementation.
 */

interface Props {
  /** The colour whose words to show, or null when the sheet is closed. */
  level: ResultColorFilter | null;
  words: readonly WordCard[];
  onClose: () => void;
  onDelete: (ids: string[]) => void;
  pal: Palette;
  themeColor: string;
}

export function ResultWordsSheet({
  level, words, onClose, onDelete, pal, themeColor,
}: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  const visible = level !== null;

  const slideY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bottom to top on the way in, and back down on the way out.
  useEffect(() => {
    if (!visible) return;
    setSelectedIds(new Set());
    slideY.setValue(SCREEN_H);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.timing(slideY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [visible, slideY, backdropOpacity]);

  const close = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(slideY, { toValue: SCREEN_H, duration: 220, useNativeDriver: false }),
    ]).start(() => onClose());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(previous => (
      words.length > 0 && words.every(word => previous.has(word.id))
        ? new Set()
        : new Set(words.map(word => word.id))
    ));
  };

  // Deletion is the one destructive thing this sheet can do, and the words it
  // removes are ones the Word List is not currently showing — so it asks first.
  const confirmDelete = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    Alert.alert(
      t('delete'),
      t('result_sheet_delete_confirm').replace('{n}', String(ids.length)),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            setSelectedIds(new Set());
            onDelete(ids);
          },
        },
      ],
    );
  };

  const accent = LEVEL_FILTER_OPTIONS.find(option => option.level === level)?.color ?? themeColor;
  const allSelected = words.length > 0 && words.every(word => selectedIds.has(word.id));
  const nothingSelected = selectedIds.size === 0;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={close}>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropOpacity }]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
      </Animated.View>

      <View style={styles.sheetOuter} pointerEvents="box-none">
        <View style={styles.sheetFill} pointerEvents="box-none">
          <Animated.View style={{ transform: [{ translateY: slideY }] }}>
            <View
              style={[
                styles.sheet,
                { backgroundColor: pal.dialog, height: SHEET_H - insets.bottom },
              ]}
              accessibilityViewIsModal
            >
              <View style={[styles.header, { borderBottomColor: pal.border }]}>
                <View style={[styles.swatch, { backgroundColor: accent + '22', borderColor: accent }]} />
                <Text style={[styles.title, { color: pal.text }]} numberOfLines={1}>
                  {level === null ? '' : t(TEST_LEVEL_LABEL_KEYS[level])}
                </Text>
                {words.length > 0 && (
                  <TouchableOpacity
                    onPress={toggleSelectAll}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('select_all')}
                    accessibilityState={{ selected: allSelected }}
                  >
                    <Text style={[styles.headerAction, { color: themeColor }]}>{t('select_all')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={close}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('close')}
                >
                  <Ionicons name="close" size={22} color={pal.sub} />
                </TouchableOpacity>
              </View>

              {words.length === 0 ? (
                <View style={styles.empty} testID="result-sheet-empty">
                  <View style={[styles.emptyIcon, { backgroundColor: accent + '18' }]}>
                    <Ionicons name="albums-outline" size={30} color={accent} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: pal.text }]}>
                    {t('result_sheet_empty_title')}
                  </Text>
                  <Text style={[styles.emptyHint, { color: pal.sub }]}>
                    {t('result_sheet_empty_hint')}
                  </Text>
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {words.map(word => {
                    const selected = selectedIds.has(word.id);
                    return (
                      <TouchableOpacity
                        key={word.id}
                        style={[styles.row, { borderBottomColor: pal.border }]}
                        onPress={() => toggleSelect(word.id)}
                        activeOpacity={0.7}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={isWordTextHidden(word) ? undefined : word.word}
                      >
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={selected ? themeColor : pal.sub}
                        />
                        <View style={styles.rowText}>
                          {isWordTextHidden(word)
                            ? <HiddenWordIcon color={pal.text} variant="row" />
                            : (
                              <Text style={[styles.word, { color: pal.text }]} numberOfLines={1}>
                                {word.word}
                              </Text>
                            )}
                          {!!word.meaning.trim() && (
                            <Text style={[styles.meaning, { color: pal.sub }]} numberOfLines={1}>
                              {word.meaning}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Delete is the only action. Nothing here edits, moves, or
                  changes a notification — those belong to the Word List. */}
              <View style={[styles.actionBar, { borderTopColor: pal.border }]}>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={confirmDelete}
                  disabled={nothingSelected}
                  accessibilityRole="button"
                  accessibilityLabel={t('delete')}
                  accessibilityState={{ disabled: nothingSelected }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={nothingSelected ? pal.sub : '#EF4444'}
                  />
                  <Text
                    style={[styles.deleteLabel, { color: nothingSelected ? pal.sub : '#EF4444' }]}
                  >
                    {nothingSelected
                      ? t('delete')
                      : `${t('delete')} (${selectedIds.size})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {insets.bottom > 0 && (
              <View style={{ height: insets.bottom, backgroundColor: pal.dialog }} />
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetOuter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetFill: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
  title: { flex: 1, fontSize: 16, fontWeight: '700' },
  headerAction: { fontSize: 15, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  word: { fontSize: 16, fontWeight: '600' },
  meaning: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  emptyHint: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 20 },
  deleteLabel: { fontSize: 15, fontWeight: '600' },
});
