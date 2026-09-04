import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Palette } from '../types';
import { useLang } from '../i18n';
import { VOICE_LIFETIME_CREDITS } from '../lib/planLimits';

/**
 * Basic's one-time AI Voice grant has run out.
 *
 * Raised only by the Worker's answer, never predicted on the device: the app
 * holds no credit count, so this cannot appear while credits remain, and it
 * cannot fail to appear when they are gone. It is also the reason the balance
 * is not mirrored locally — a stale count would either block a user who still
 * has credits or promise generations that no longer exist.
 *
 * It appears on a *new* generation only. Audio already in the device's file
 * cache never reaches the Worker, so replaying a word the user has heard before
 * keeps working after the credits are spent, and shows nothing.
 *
 * There is no dismiss-by-backdrop and no close button, deliberately: both
 * buttons resolve the situation, and a third way out would leave the user on a
 * card whose voice button had just silently failed. Android back is mapped to
 * the free-voice choice — the outcome that leaves the app working.
 */

interface Props {
  visible: boolean;
  /** Opens the Upgrade Plan sheet on the Premium option. */
  onUpgrade(): void;
  /** Switch to the device voice, now and from now on. */
  onUseFreeVoice(): void;
  pal: Palette;
  themeColor: string;
}

export function VoiceCreditsExhaustedDialog({
  visible, onUpgrade, onUseFreeVoice, pal, themeColor,
}: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  const grant = VOICE_LIFETIME_CREDITS.basic ?? 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onUseFreeVoice}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
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
            {t('voice_credits_title')}
          </Text>
          <ScrollView
            style={styles.bodyScroll}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={[styles.body, { color: pal.sub }]}>
              {t('voice_credits_body').replace('{limit}', String(grant))}
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: themeColor }]}
            onPress={onUpgrade}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.primaryLabel}>{t('voice_credits_upgrade')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: pal.border }]}
            onPress={onUseFreeVoice}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryLabel, { color: pal.text }]}>
              {t('voice_credits_use_free')}
            </Text>
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
  body: { fontSize: 14, lineHeight: 21 },
  primaryButton: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryLabel: { fontSize: 15, fontWeight: '600' },
});
