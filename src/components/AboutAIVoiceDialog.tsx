import { useCallback } from 'react';
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
import { DESTRUCTIVE_ACTION_COLOR } from '../constants';
import { useAIConsent } from '../hooks/useAIConsent';
import { setAIConsent } from '../lib/aiConsent';

/**
 * About AI Voice, and the one place permission can be withdrawn.
 *
 * The standalone "AI Data Sharing" row was removed from Settings, so this
 * dialog carries the withdrawal in its place — a subscriber must always be able
 * to take back a permission they gave, and burying that is not an option.
 *
 * The action appears only while permission is actually granted. Offering
 * "Withdraw" to someone who has not granted anything would be a lie about the
 * current state, so a plain status line is shown instead.
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

  /**
   * Withdrawing takes effect immediately and destroys nothing.
   *
   * Confirmed first because it turns a working feature off. It writes
   * `declined` and stops there: no card, meaning, note or cached clip is
   * touched, the subscription is untouched, and the next AI Voice tap asks for
   * permission again through the ordinary prompt.
   */
  const withdraw = useCallback(() => {
    Alert.alert(
      t('ai_consent_withdraw'),
      t('ai_consent_withdraw_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('ai_consent_withdraw'),
          style: 'destructive',
          onPress: () => { void setAIConsent('declined'); },
        },
      ],
    );
  }, [t]);

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
            <Text style={[styles.body, { color: pal.sub }]}>{t('ai_voice_info_body')}</Text>

            {consent === 'granted' ? (
              <TouchableOpacity
                style={[styles.withdrawButton, { borderColor: DESTRUCTIVE_ACTION_COLOR }]}
                onPress={withdraw}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('ai_consent_withdraw')}
              >
                <Text style={[styles.withdrawLabel, { color: DESTRUCTIVE_ACTION_COLOR }]}>
                  {t('ai_consent_withdraw')}
                </Text>
              </TouchableOpacity>
            ) : (
              // Nothing to withdraw. Stated plainly rather than offering an
              // action that would do nothing.
              <Text style={[styles.status, { color: pal.sub }]}>
                {`${t('ai_consent_setting')}: ${t(
                  consent === 'declined' ? 'ai_consent_status_declined' : 'ai_consent_status_unknown',
                )}`}
              </Text>
            )}
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
  withdrawButton: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  withdrawLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  status: { fontSize: 13, lineHeight: 18, marginTop: 14 },
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
