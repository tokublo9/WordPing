import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Palette } from '../types';
import { useLang } from '../i18n';

/**
 * The one explanation dialog behind every Settings information button.
 *
 * Deliberately a single component driven by a single piece of state in
 * SettingsModal rather than one modal per row: with only one `content` slot
 * there is nothing for a second tap to stack on top of, and only one popup can
 * ever be open. Passing `content: null` is what closes it.
 *
 * It reads nothing and writes nothing — it cannot change the setting it
 * describes, so closing it always leaves the toggle exactly as it was.
 */

export interface SettingsInfoContent {
  /** The row's own title, so the popup names what it is explaining. */
  title: string;
  /** The full localized explanation. Wraps and scrolls; never truncated. */
  body: string;
}

interface Props {
  content: SettingsInfoContent | null;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
}

export function SettingsInfoPopup({ content, onClose, pal, themeColor }: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={content !== null}
      transparent
      animationType="fade"
      // Android hardware back and the iOS swipe/dismiss gesture both land here.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Tapping outside dismisses, matching the app's other sheets. */}
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
              // Safe area matters here: the dialog is centred but can grow tall
              // with Dynamic Type, and must not run under a notch or home bar.
              marginTop: insets.top + 24,
              marginBottom: insets.bottom + 24,
            },
          ]}
          accessibilityViewIsModal
        >
          <Text
            style={[styles.title, { color: pal.text }]}
            accessibilityRole="header"
          >
            {content?.title ?? ''}
          </Text>
          {/* Scrolls rather than clips when the largest Dynamic Type sizes or a
              long translation make the body taller than the dialog. */}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={[styles.body, { color: pal.sub }]}>{content?.body ?? ''}</Text>
          </ScrollView>
          <TouchableOpacity
            style={[styles.okButton, { backgroundColor: themeColor }]}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Text style={styles.okLabel}>{t('close')}</Text>
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
  body: { fontSize: 14, lineHeight: 21 },
  okButton: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  okLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
