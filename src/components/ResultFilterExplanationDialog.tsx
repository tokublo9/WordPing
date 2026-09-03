import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Palette } from '../types';
import { useLang } from '../i18n';
import {
  RESULT_FILTER_EXPLANATION_KEYS,
  RESULT_FILTER_INTERVAL_KEYS,
  emphasiseInterval,
  type ResultColorFilter,
} from '../features/cards/resultFilterCopy';
import { LEVEL_FILTER_OPTIONS, TEST_LEVEL_LABEL_KEYS } from '../features/cards/levels';

/**
 * What a coloured chip means, shown when one is tapped.
 *
 * Tapping a colour no longer narrows the Word List. A colour is a holding area —
 * words resting until their interval runs out — and that is not obvious from a
 * number on a chip, so the tap explains it first. "Edit" is the way through to
 * the words themselves; closing changes nothing at all.
 *
 * What is drawn is deliberately not the `level` prop but a copy of it that lags
 * behind: clearing the selection also empties the dialog, and on iOS the fade-out
 * then plays over blank content, which reads as a small empty popup flashing on
 * the way out. `shown` keeps the last colour until the dismissal has actually
 * finished, so the dialog fades out still showing what it said.
 *
 * It reads nothing and writes nothing: no card, no result, no interval.
 */

interface Props {
  /** The colour whose explanation to show, or null when nothing is open. */
  level: ResultColorFilter | null;
  onClose: () => void;
  /**
   * Called with the colour once this dialog has finished dismissing, never
   * during it. Two modals presented in the same frame can lose the second one
   * on iOS, so the sheet is opened after this one is actually gone.
   */
  onEdit: (level: ResultColorFilter) => void;
  pal: Palette;
  themeColor: string;
}

export function ResultFilterExplanationDialog({ level, onClose, onEdit, pal, themeColor }: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  // Set by Edit and consumed once the dialog is off screen. A ref rather than
  // state: it must survive the close without causing a render of its own.
  const editRequested = useRef<ResultColorFilter | null>(null);
  // The colour actually on screen. Follows `level` on the way in, and holds its
  // last value all the way through the fade-out.
  const [shown, setShown] = useState<ResultColorFilter | null>(null);

  useEffect(() => {
    if (level !== null) setShown(level);
  }, [level]);

  // Everything that must wait for the dialog to be gone: emptying it, and handing
  // the colour to the sheet so two modals are never presented in the same frame.
  const finishDismiss = useCallback(() => {
    setShown(null);
    const requested = editRequested.current;
    if (requested === null) return;
    editRequested.current = null;
    onEdit(requested);
  }, [onEdit]);

  // `onDismiss` is iOS-only. On Android the modal is gone the moment `visible`
  // turns false, so the same handoff runs from this post-commit effect instead.
  useEffect(() => {
    if (Platform.OS === 'android' && level === null) finishDismiss();
  }, [level, finishDismiss]);

  const requestEdit = () => {
    if (level === null) return;
    editRequested.current = level;
    onClose();
  };
  // Every piece of content reads `shown`, never `level` — including the accent,
  // which would otherwise fall back to the theme colour mid-fade.
  const option = LEVEL_FILTER_OPTIONS.find(entry => entry.level === shown);
  const accent = option?.color ?? themeColor;
  const explanation = shown === null
    ? { before: '', emphasis: '', after: '' }
    : emphasiseInterval(t(RESULT_FILTER_EXPLANATION_KEYS[shown]), t(RESULT_FILTER_INTERVAL_KEYS[shown]));

  return (
    <Modal
      visible={level !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={finishDismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
        <View
          style={[
            styles.dialog,
            {
              backgroundColor: pal.dialog,
              borderColor: pal.border,
              marginTop: insets.top + 24,
              marginBottom: insets.bottom + 24,
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.titleRow}>
            <View style={[styles.swatch, { backgroundColor: accent + '22', borderColor: accent }]}>
              <Ionicons
                name={(option?.icon ?? 'ellipse-outline') as never}
                size={14}
                color={accent}
              />
            </View>
            <Text style={[styles.title, { color: pal.text }]} accessibilityRole="header">
              {shown === null ? '' : t(TEST_LEVEL_LABEL_KEYS[shown])}
            </Text>
          </View>

          {/* Scrolls rather than clips at the largest Dynamic Type sizes. */}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* One sentence, with only the interval bold. Nested Text keeps it a
                single run for line breaking and for the screen reader. */}
            <Text style={[styles.body, { color: pal.sub }]}>
              {explanation.before}
              {explanation.emphasis !== '' && (
                <Text style={styles.bodyInterval}>{explanation.emphasis}</Text>
              )}
              {explanation.after}
            </Text>
          </ScrollView>

          {/* Below the explanation, as the way through to the words it describes. */}
          <TouchableOpacity
            style={[styles.editButton, { backgroundColor: themeColor }]}
            onPress={requestEdit}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('edit')}
          >
            <Text style={styles.editLabel}>{t('edit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Text style={[styles.closeLabel, { color: pal.sub }]}>{t('close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  bodyScroll: { flexGrow: 0 },
  bodyContent: { paddingBottom: 4 },
  body: { fontSize: 14, lineHeight: 21 },
  // Only the interval. Weight alone — no colour or size change, so the sentence
  // still reads as one sentence.
  bodyInterval: { fontWeight: '700' },
  editButton: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  editLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  closeButton: {
    marginTop: 6,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: { fontSize: 15, fontWeight: '600' },
});
