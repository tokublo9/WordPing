import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { useLang } from '../i18n';
import { appStyles as s } from '../styles';

interface Props {
  visible: boolean;
  reason: 'words' | 'voice';
  onClose: () => void;
  onSubscribe: () => Promise<void>;
  onRestore: () => Promise<void>;
  pal: Palette;
  themeColor: string;
}

export function PaywallModal({
  visible, reason, onClose, onSubscribe, onRestore, pal, themeColor,
}: Props) {
  const t = useLang();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); onClose(); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.overlayCenter}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />

        <View style={[s.dialog, { backgroundColor: pal.dialog }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={pal.sub} />
          </TouchableOpacity>

          {/* Icon + headline */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: themeColor + '22' }]}>
              <Ionicons name="star" size={26} color={themeColor} />
            </View>
            <Text style={[styles.title, { color: pal.text }]}>{t('wordping_pro')}</Text>
            <Text style={[styles.subtitle, { color: pal.sub }]}>
              {t(reason === 'words' ? 'reached_word_limit' : 'voice_limited')}
            </Text>
          </View>

          {/* Feature rows */}
          <View style={styles.features}>
            <Feature
              icon="library-outline"
              label={t('unlimited_words')}
              freeTier={t('up_to_words_free')}
              themeColor={themeColor}
              pal={pal}
            />
            <Feature
              icon="volume-high-outline"
              label={t('ai_voice_all')}
              freeTier={t('first_words_free')}
              themeColor={themeColor}
              pal={pal}
            />
          </View>

          {/* Subscribe */}
          <TouchableOpacity
            style={[styles.subscribeBtn, { backgroundColor: themeColor }]}
            onPress={() => run(onSubscribe)}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.subscribeBtnText}>{t('subscribe_price')}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelBtn} onPress={() => run(onRestore)} disabled={busy}>
            <Text style={[s.cancelBtnText, { color: pal.sub }]}>{t('restore_purchases')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Feature({ icon, label, freeTier, themeColor, pal }: {
  icon: string; label: string; freeTier: string; themeColor: string; pal: Palette;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={[styles.featureIcon, { backgroundColor: themeColor + '18' }]}>
        <Ionicons name={icon as any} size={16} color={themeColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.featureLabel, { color: pal.text }]}>{label}</Text>
        <Text style={[styles.featureSub, { color: pal.sub }]}>{freeTier}</Text>
      </View>
      <Ionicons name="checkmark-circle" size={18} color={themeColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 4 },
  header: { alignItems: 'center', marginBottom: 24, paddingTop: 4 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  features: { gap: 12, marginBottom: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  featureLabel: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  featureSub: { fontSize: 12 },
  subscribeBtn: { borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 4 },
  subscribeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
