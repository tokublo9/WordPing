import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import { useAIConsent } from '../hooks/useAIConsent';
import { setAIConsent } from '../lib/aiConsent';

/**
 * About AI Voice, and the one place permission can be given or taken back.
 *
 * The standalone "AI Data Sharing" row was removed from Settings, so this
 * dialog carries the permission control in its place — a subscriber must always
 * be able to take back a permission they gave, and burying that is not an
 * option.
 *
 * This dialog states the whole disclosure itself: what is sent, which voice
 * model, that it goes to OpenAI through the WordCore server, that it is used for
 * nothing else, which anonymous identifiers the server sees and that they never
 * reach OpenAI, that nothing is sent without permission, and that permission can
 * be taken back here. Its body is paragraph-for-paragraph the same text
 * `AIConsentDialog` shows, so granting from here is granting from the same
 * disclosure — which is why the button records the decision directly instead of
 * opening a second dialog to repeat what the user is already reading.
 *
 * Exactly one action is shown, and it names what tapping it will do: Allow while
 * permission is missing, Revoke Permission while it is held. It writes through
 * the shared consent source of truth, so every guard in the app sees the change
 * at once.
 *
 * Built on the same dialog shape as `SettingsInfoPopup`, which is what the
 * other explanation rows use.
 */

interface Props {
  visible: boolean;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
}

export function AboutAIVoiceDialog({ visible, onClose, pal, themeColor }: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  const consent = useAIConsent();

  const granted = consent === 'granted';
  const [busy, setBusy] = useState(false);
  // The tap guard is a ref so a second tap in the same frame sees it, and the
  // unmount flag stops a resolved write from setting state on a gone component.
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  /**
   * Writes the decision through the shared store and nothing else.
   *
   * The button is driven by `useAIConsent`, which subscribes to that store — so
   * it flips only once the write has actually published, and stays as it was if
   * the write throws. Granting sends no text, plays no audio and makes no
   * request; it records permission for whatever the user does next.
   */
  const apply = useCallback(async (next: 'granted' | 'declined') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await setAIConsent(next);
    } catch {
      // The store keeps the previous decision, so the action label is still
      // correct and the user can try again.
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, []);

  /**
   * Revoking takes effect immediately and destroys nothing.
   *
   * Confirmed first because it turns a working feature off. It writes
   * `declined` and stops there: no card, meaning, note or cached clip is
   * touched, the subscription is untouched, and the next AI Voice tap asks for
   * permission again through the ordinary prompt.
   */
  const revoke = useCallback(() => {
    if (busyRef.current) return;
    Alert.alert(
      t('ai_consent_withdraw'),
      t('ai_consent_withdraw_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('ai_consent_withdraw'),
          style: 'destructive',
          onPress: () => { void apply('declined'); },
        },
      ],
    );
  }, [apply, t]);

  const actionKey = granted ? 'ai_consent_withdraw' : 'ai_consent_grant';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
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
          <Text style={[styles.title, { color: pal.text }]} accessibilityRole="header">
            {t('ai_voice_info_title')}
          </Text>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* The privacy disclosure uses the same body treatment throughout
                this dialog so no paragraph receives visual emphasis. */}
            <Text style={[styles.body, styles.leadSpacing, { color: pal.sub }]}>
              {t('ai_data_lead')}
            </Text>
            <Text style={[styles.body, { color: pal.sub }]}>{t('ai_voice_info_body')}</Text>

            {/* One action, in the same subdued style either way: the label is
                the state. `unknown` and `declined` both read Allow, because
                both mean permission is not held. */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                { borderColor: pal.border, backgroundColor: pal.input },
                busy && styles.actionButtonBusy,
              ]}
              onPress={granted ? revoke : () => { void apply('granted'); }}
              disabled={busy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t(actionKey)}
              accessibilityState={{ disabled: busy }}
            >
              <Text style={[styles.actionLabel, { color: pal.sub }]}>
                {t(actionKey)}
              </Text>
            </TouchableOpacity>
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
  leadSpacing: { marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 21 },
  actionButton: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionButtonBusy: { opacity: 0.5 },
  actionLabel: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
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
