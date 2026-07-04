import React from 'react';
import {
  ActivityIndicator, Animated, Linking, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import type { Palette } from '../types';
import { useLang, type TranslationKey } from '../i18n';

const MANAGE_SUB_URL = 'https://apps.apple.com/account/subscriptions';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => Promise<void>;
  onRestore: () => Promise<void>;
  themeColor: string;
  pal: Palette;
  isSubscribed?: boolean;
  /** DEV ONLY: when provided, tapping "Manage Subscription" calls this instead of opening the App Store URL. */
  onManageSubscription?: () => void;
}

// ── Promotional visuals ────────────────────────────────────────────────────────

function RemoveAdsVisual() {
  return (
    <View style={[vis.box, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
      {/* Mini word card */}
      <View style={vis.miniCard}>
        <Text style={vis.miniWord}>Negotiate</Text>
        <Text style={vis.miniMeaning}>to discuss to reach an agreement</Text>
        <View style={vis.miniDivider} />
        <View style={vis.miniFooter}>
          <Ionicons name="volume-high-outline" size={12} color="#aaa" />
        </View>
      </View>
      {/* Ad banner being removed */}
      <View style={vis.adBanner}>
        <Text style={vis.adText}>Advertisement</Text>
        <View style={vis.adX}>
          <Ionicons name="close" size={11} color="#fff" />
        </View>
      </View>
    </View>
  );
}

function UnlimitedWordsVisual() {
  const WORDS = [
    { word: 'Spontaneous', color: '#EFF6FF', border: '#BFDBFE' },
    { word: 'Awkward',     color: '#F0FDF4', border: '#BBF7D0' },
    { word: 'Negotiate',   color: '#FDF4FF', border: '#E9D5FF' },
  ];
  return (
    <View style={[vis.box, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
      <View style={vis.stackWrapper}>
        {WORDS.map((w, i) => (
          <View
            key={w.word}
            style={[
              vis.stackCard,
              { backgroundColor: w.color, borderColor: w.border,
                top: i * 22, left: i * 10, zIndex: WORDS.length - i },
            ]}
          >
            <Text style={vis.stackWord}>{w.word}</Text>
          </View>
        ))}
      </View>
      <View style={[vis.infinityBadge, { backgroundColor: '#3B82F6' }]}>
        <Text style={vis.infinityText}>∞</Text>
      </View>
    </View>
  );
}

const WAVE_BARS = [0.35, 0.6, 0.85, 0.5, 1, 0.7, 0.45, 0.9, 0.6, 0.35, 0.75, 0.55];

function AIVoiceVisual() {
  return (
    <View style={[vis.box, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
      <View style={[vis.voiceIcon, { backgroundColor: '#8B5CF622' }]}>
        <Ionicons name="volume-high" size={28} color="#8B5CF6" />
      </View>
      <View style={vis.waveform}>
        {WAVE_BARS.map((h, i) => (
          <View
            key={i}
            style={[vis.bar, {
              height: h * 40,
              backgroundColor: '#8B5CF6',
              opacity: 0.5 + h * 0.5,
            }]}
          />
        ))}
      </View>
      <Text style={[vis.voiceLabel, { color: '#8B5CF6' }]}>marin · gpt-4o-mini-tts</Text>
    </View>
  );
}

const SKINS_PREVIEW = [
  { emoji: '🌸', bg: '#FEF0F5', accent: '#E8779A' },
  { emoji: '🌃', bg: '#0D0A1E', accent: '#FF2D78' },
  { emoji: '🐾', bg: '#FFF8EC', accent: '#9B6B2F' },
  { emoji: '🌊', bg: '#071828', accent: '#00C9B1' },
  { emoji: '✨', bg: '#07091A', accent: '#A78BFA' },
];

function SkinsVisual() {
  return (
    <View style={[vis.box, { backgroundColor: '#F8F8FC', borderColor: '#E8E8F0' }]}>
      <View style={vis.skinsRow}>
        {SKINS_PREVIEW.map(s => (
          <View key={s.emoji} style={[vis.skinChip, { backgroundColor: s.bg, borderColor: s.accent + '66' }]}>
            <Text style={vis.skinEmoji}>{s.emoji}</Text>
            <View style={[vis.skinAccentDot, { backgroundColor: s.accent }]} />
          </View>
        ))}
      </View>
      <Text style={vis.skinsNote}>5 exclusive themes</Text>
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const FEATURE_KEYS: { Visual: () => React.JSX.Element; labelKey: TranslationKey; descKey: TranslationKey }[] = [
  { Visual: RemoveAdsVisual,     labelKey: 'remove_ads',       descKey: 'remove_ads_desc' },
  { Visual: UnlimitedWordsVisual, labelKey: 'unlimited_words', descKey: 'unlimited_words_desc' },
  { Visual: AIVoiceVisual,       labelKey: 'ai_voice_all',     descKey: 'ai_voice_desc' },
  { Visual: SkinsVisual,         labelKey: 'theme_skins',      descKey: 'theme_skins_desc' },
];

export function ProSheet({ visible, onClose, onSubscribe, onRestore, themeColor, pal, isSubscribed, onManageSubscription }: Props) {
  const insets = useSafeAreaInsets();
  const t = useLang();
  const slideY = useRef(new Animated.Value(900)).current;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      slideY.setValue(900);
      Animated.spring(slideY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideY, { toValue: 900, duration: 240, useNativeDriver: true })
      .start(() => onClose());
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); handleClose(); } finally { setBusy(false); }
  };

  if (!visible) return null;

  // Align close button with the Settings screen header (insets.top + 8 matches the
  // header paddingTop inside the parent View that already applies paddingTop: insets.top,
  // but since absoluteFillObject ignores parent padding we add insets.top explicitly).
  const closeBtnTop = insets.top + 8;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: pal.bg, transform: [{ translateY: slideY }] },
      ]}
    >
      <TouchableOpacity
        style={[styles.closeBtn, { top: closeBtnTop }]}
        onPress={handleClose}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={22} color={pal.sub} />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: closeBtnTop + 40 }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: themeColor + '22' }]}>
            <Ionicons name="star" size={28} color={themeColor} />
          </View>
          <Text style={[styles.title, { color: pal.text }]}>{t('wordping_pro')}</Text>
          <Text style={[styles.subtitle, { color: pal.sub }]}>{t('unlock_full')}</Text>
        </View>

        {/* Feature sections */}
        {FEATURE_KEYS.map(({ Visual, labelKey, descKey }) => (
          <View key={labelKey} style={styles.featureSection}>
            <Visual />
            <Text style={[styles.featureLabel, { color: pal.text }]}>{t(labelKey)}</Text>
            <Text style={[styles.featureDesc, { color: pal.sub }]}>{t(descKey)}</Text>
          </View>
        ))}

        {isSubscribed ? (
          <>
            {/* Active subscription status */}
            <View style={[styles.proBadge, { backgroundColor: themeColor + '18', borderColor: themeColor + '44' }]}>
              <Ionicons name="checkmark-circle" size={20} color={themeColor} />
              <Text style={[styles.proBadgeText, { color: themeColor }]}>{t('pro')}</Text>
            </View>

            {/* Manage subscription */}
            <TouchableOpacity
              style={[styles.subscribeBtn, { backgroundColor: themeColor }]}
              onPress={() => onManageSubscription
                ? onManageSubscription()
                : Linking.openURL(MANAGE_SUB_URL)}
              activeOpacity={0.85}
            >
              <Text style={styles.subscribeBtnText}>{t('manage_subscription')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Price */}
            <Text style={[styles.price, { color: pal.sub }]}>{t('price_month')}</Text>

            {/* Subscribe */}
            <TouchableOpacity
              style={[styles.subscribeBtn, { backgroundColor: themeColor }]}
              onPress={() => run(onSubscribe)}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.subscribeBtnText}>{t('subscribe')}</Text>
              }
            </TouchableOpacity>

            {/* Restore */}
            <TouchableOpacity style={styles.restoreBtn} onPress={() => run(onRestore)} disabled={busy}>
              <Text style={[styles.restoreBtnText, { color: pal.sub }]}>{t('restore_purchases')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  closeBtn: { position: 'absolute', right: 20, zIndex: 10, padding: 4 },
  content: { paddingHorizontal: 24, paddingBottom: 56 },

  header: { alignItems: 'center', paddingBottom: 28 },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, textAlign: 'center' },

  featureSection: { marginBottom: 28 },
  featureLabel: { fontSize: 18, fontWeight: '700', marginTop: 14, marginBottom: 4 },
  featureDesc: { fontSize: 14, lineHeight: 20 },

  price: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, borderWidth: 1, paddingVertical: 14, marginBottom: 20,
  },
  proBadgeText: { fontSize: 16, fontWeight: '700' },
  subscribeBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 12 },
  subscribeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  restoreBtn: { alignItems: 'center', paddingVertical: 8 },
  restoreBtnText: { fontSize: 14 },
});

const vis = StyleSheet.create({
  box: {
    height: 170, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    padding: 16,
  },

  // Remove Ads
  miniCard: {
    width: 200, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2, marginBottom: 8,
  },
  miniWord: { fontSize: 14, fontWeight: '700', color: '#1A1A2E', marginBottom: 2 },
  miniMeaning: { fontSize: 11, color: '#888', marginBottom: 6 },
  miniDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#eee', marginBottom: 6 },
  miniFooter: { flexDirection: 'row', gap: 6 },
  adBanner: {
    width: 200, height: 28, backgroundColor: '#F3F4F6',
    borderRadius: 6, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, opacity: 0.5,
  },
  adText: { fontSize: 11, color: '#888' },
  adX: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
  },

  // Unlimited Words
  stackWrapper: { width: 200, height: 100, position: 'relative', marginBottom: 4 },
  stackCard: {
    position: 'absolute', width: 180, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  stackWord: { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  infinityBadge: {
    position: 'absolute', right: 0, bottom: 0,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  infinityText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 28 },

  // AI Voice
  voiceIcon: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 8 },
  bar: { width: 4, borderRadius: 2 },
  voiceLabel: { fontSize: 11, fontWeight: '500' },

  // Theme Skins
  skinsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  skinChip: {
    width: 44, height: 56, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  skinEmoji: { fontSize: 18 },
  skinAccentDot: { width: 8, height: 8, borderRadius: 4 },
  skinsNote: { fontSize: 12, color: '#888', fontWeight: '500' },
});
