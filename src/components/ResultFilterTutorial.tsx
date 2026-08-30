import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Palette } from '../types';
import { useLang, type TranslationKey } from '../i18n';
import { RESULT_FILTER_LEGEND } from '../features/cards/levels';

/**
 * Explains the result-colour filters, once, after the first Test Mode answer.
 *
 * The legend comes from `RESULT_FILTER_LEGEND`, which is derived from the same
 * `LEVEL_FILTER_OPTIONS` the chips render from — so this dialog cannot end up
 * describing a colour the filter bar no longer uses.
 *
 * Colour never carries the meaning on its own: every row pairs the swatch with
 * the result's own name, and each row is one accessibility element reading
 * "Pretty good, blue" rather than an unlabelled colour.
 *
 * Built on the same dialog shape as `SettingsInfoPopup`: app dialog palette,
 * hairline border, safe-area margins, 44pt button, and a body that scrolls
 * instead of clipping under large Dynamic Type on a small iPhone.
 */

interface Props {
  visible: boolean;
  onDismiss: () => void;
  pal: Palette;
  themeColor: string;
}

export function ResultFilterTutorial({ visible, onDismiss, pal, themeColor }: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Dismissing by any route is the same acknowledgement: the tutorial has
      // been shown, and the filters appear either way.
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('result_filter_got_it')}
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
          <Text style={[styles.title, { color: pal.text }]} accessibilityRole="header">
            {t('result_filter_title')}
          </Text>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={[styles.intro, { color: pal.sub }]}>{t('result_filter_intro')}</Text>

            {RESULT_FILTER_LEGEND.map(({ level, icon, color, labelKey }) => (
              <View
                key={level}
                style={[styles.legendRow, { borderColor: pal.border }]}
                accessible
                accessibilityRole="text"
                accessibilityLabel={t(labelKey as TranslationKey)}
              >
                <View style={[styles.swatch, { backgroundColor: color + '22', borderColor: color }]}>
                  {icon !== null && <Ionicons name={icon as never} size={14} color={color} />}
                </View>
                <Text style={[styles.legendLabel, { color: pal.text }]}>
                  {t(labelKey as TranslationKey)}
                </Text>
              </View>
            ))}

            {/* Named explicitly: there are four answers but only three of them
                become a filter, and a user who looked for "Know perfectly"
                should find out why it is missing here rather than guess. */}
            <Text style={[styles.footnote, { color: pal.sub }]}>
              {t('result_filter_perfect_note')}
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: themeColor }]}
            onPress={onDismiss}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('result_filter_got_it')}
          >
            <Text style={styles.buttonLabel}>{t('result_filter_got_it')}</Text>
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
    paddingBottom: 16,
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  bodyScroll: { flexGrow: 0 },
  bodyContent: { paddingBottom: 4 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 14 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  legendLabel: { flex: 1, fontSize: 14, lineHeight: 19 },
  footnote: { fontSize: 12, lineHeight: 17, marginTop: 12 },
  button: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
