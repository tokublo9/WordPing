import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostHogMaskView } from 'posthog-react-native';

import type { Palette } from '../types';
import { useLang } from '../i18n';
import { fetchPremiumAiUsage } from '../lib/api/client';
import {
  formatAiUsageReset,
  remainingAiRequests,
  type PremiumAiUsage,
  type PremiumAiUsageWindow,
} from '../lib/premiumAiUsage';

function UsageCard({ title, window, now, language, pal }: {
  title: string;
  window: PremiumAiUsageWindow;
  now: number;
  language: string;
  pal: Palette;
}) {
  const t = useLang();
  const remaining = remainingAiRequests(window);
  const count = new Intl.NumberFormat(language);
  const amount = t('ai_usage_remaining')
    .replace('{remaining}', count.format(remaining))
    .replace('{limit}', count.format(window.limit));
  const reset = t('ai_usage_resets_in')
    .replace('{time}', formatAiUsageReset(window.resetsAt, now, language));
  const percentage = window.limit > 0 ? Math.min(100, remaining / window.limit * 100) : 0;

  return (
    <PostHogMaskView style={[styles.card, { backgroundColor: pal.card, borderColor: pal.border }]}>
      <Text style={[styles.cardTitle, { color: pal.text }]}>{title}</Text>
      <View style={styles.cardDetails}>
        <Text style={[styles.reset, { color: pal.sub }]}>{reset}</Text>
        <Text style={[styles.remaining, { color: pal.text }]}>{amount}</Text>
      </View>
      <View
        style={[styles.track, { backgroundColor: pal.border }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${title}. ${amount}. ${reset}`}
        accessibilityValue={{ min: 0, max: window.limit, now: remaining }}
      >
        <View style={[styles.fill, { width: `${percentage}%`, backgroundColor: pal.text }]} />
      </View>
    </PostHogMaskView>
  );
}

export function PremiumAiUsageDialog({ visible, onClose, pal, themeColor, language }: {
  visible: boolean;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
  language: string;
}) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  const [usage, setUsage] = useState<PremiumAiUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(Date.now());
  const lastResetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setUsage(null);
      setFailed(false);
      return;
    }
    let active = true;
    setNow(Date.now());
    setLoading(true);
    setFailed(false);
    setUsage(null);
    void fetchPremiumAiUsage().then(result => {
      if (active) setUsage(result);
    }).catch(() => {
      if (active) setFailed(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [visible, refreshKey]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible || !usage) return;
    const nextReset = [usage.day.resetsAt, usage.month.resetsAt]
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
    if (nextReset && now >= Date.parse(nextReset) && lastResetRef.current !== nextReset) {
      lastResetRef.current = nextReset;
      setRefreshKey(value => value + 1);
    }
  }, [now, usage, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
        <View style={[
          styles.dialog,
          { backgroundColor: pal.dialog, borderColor: pal.border,
            marginTop: insets.top + 24, marginBottom: insets.bottom + 24 },
        ]} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={[styles.title, { color: pal.text }]} accessibilityRole="header">
              {t('ai_usage_title')}
            </Text>
            <TouchableOpacity
              onPress={() => setRefreshKey(value => value + 1)}
              disabled={loading}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('ai_usage_refresh')}
            >
              <Ionicons name="refresh-outline" size={20} color={pal.sub} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {loading && <ActivityIndicator color={themeColor} style={styles.loading} />}
            {failed && (
              <View style={styles.error}>
                <Text style={[styles.errorText, { color: pal.sub }]}>{t('ai_usage_unavailable')}</Text>
                <TouchableOpacity onPress={() => setRefreshKey(value => value + 1)} accessibilityRole="button">
                  <Text style={[styles.retry, { color: themeColor }]}>{t('ai_usage_retry')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {usage && (
              <>
                {remainingAiRequests(usage.month) > 0 && (
                  <UsageCard title={t('ai_usage_daily_limit')} window={usage.day} now={now} language={language} pal={pal} />
                )}
                <UsageCard title={t('ai_usage_monthly_limit')} window={usage.month} now={now} language={language} pal={pal} />
                <Text style={[styles.scope, { color: pal.sub }]}>{t('ai_usage_scope')}</Text>
              </>
            )}
          </ScrollView>
          <TouchableOpacity
            style={[styles.close, { backgroundColor: themeColor }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Text style={styles.closeText}>{t('close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.48)' },
  dialog: { width: '100%', maxWidth: 460, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 19, fontWeight: '700' },
  scroll: { flexGrow: 0 },
  content: { gap: 12, paddingBottom: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardDetails: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8,
    marginTop: 10 },
  reset: { color: '#999', fontSize: 14, flex: 1 },
  remaining: { fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  fill: { height: '100%', borderRadius: 3 },
  scope: { fontSize: 12, lineHeight: 17 },
  loading: { marginVertical: 42 },
  error: { alignItems: 'center', gap: 12, paddingVertical: 30 },
  errorText: { fontSize: 14, textAlign: 'center' },
  retry: { fontSize: 15, fontWeight: '600' },
  close: { minHeight: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  closeText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
