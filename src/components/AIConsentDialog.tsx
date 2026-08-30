import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Palette } from '../types';
import { useLang } from '../i18n';
import {
  dismissAIConsentPrompt,
  registerAIConsentPromptHost,
  resolveAIConsentPrompt,
} from '../lib/aiConsentPrompt';

/**
 * The AI data-sharing consent dialog.
 *
 * Shown immediately before the first AI request of a session that needs it, and
 * again any time consent is not currently granted. It is the only place in the
 * app that can grant consent, so the disclosure and the decision are never
 * separated — accepting the Terms of Service elsewhere does not grant it.
 *
 * Built on the same shape as `SettingsInfoPopup`: the app's dialog palette,
 * hairline border, 44pt controls, safe-area margins, and a body that scrolls
 * rather than clipping under large Dynamic Type on a small iPhone.
 *
 * Mount one wherever a dialog must be able to appear above what is on screen —
 * React Native presents each `Modal` from its own native controller, so a host
 * declared outside the currently presented modal would be covered by it. Pass
 * `active` so a host registers only while its own screen is really on top.
 */

interface Props {
  /** Registers this host while true. */
  active: boolean;
  pal: Palette;
  themeColor: string;
}

export function AIConsentDialog({ active, pal, themeColor }: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    return registerAIConsentPromptHost({
      open: () => setVisible(true),
      close: () => setVisible(false),
    });
  }, [active]);

  // Dismissing without choosing — backdrop, swipe, Android back — is not a
  // decision and is never consent. Nothing is stored, so the next AI action
  // asks again.
  const dismiss = useCallback(() => {
    setVisible(false);
    dismissAIConsentPrompt();
  }, []);

  const decide = useCallback((state: 'granted' | 'declined') => {
    setVisible(false);
    void resolveAIConsentPrompt(state);
  }, []);

  if (!active) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={t('ai_consent_decline')}
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
            {t('ai_consent_title')}
          </Text>
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={[styles.body, { color: pal.sub }]}>{t('ai_consent_body')}</Text>
          </ScrollView>

          {/* Stacked rather than side by side: the two labels are full phrases,
              and at the largest Dynamic Type sizes a row would either truncate
              them or shrink both below a comfortable target on a small iPhone. */}
          <TouchableOpacity
            style={[styles.allowButton, { backgroundColor: themeColor }]}
            onPress={() => decide('granted')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('ai_consent_allow')}
          >
            <Text style={styles.allowLabel}>{t('ai_consent_allow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={() => decide('declined')}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('ai_consent_decline')}
          >
            <Text style={[styles.declineLabel, { color: pal.sub }]}>{t('ai_consent_decline')}</Text>
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
  allowButton: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  allowLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  declineButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  declineLabel: { fontSize: 15, fontWeight: '600' },
});
