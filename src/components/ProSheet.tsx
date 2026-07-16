import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OnboardingChoices, Palette } from '../types';
import { FREE_THEME_COLOR, ONBOARDING_KEY, SKINS } from '../constants';
import { useLang } from '../i18n';
import { speak, stopPlayback } from '../lib/tts';
import { PremiumSkinPreview } from './ThemeSkinPreview';
import { SHOP_ITEMS } from './KisekaeShopSheet';

const { height: SH, width: SW } = Dimensions.get('window');

// The Basic Plan screen always uses WordMemo blue regardless of the user's current theme.
const PLAN_BLUE = FREE_THEME_COLOR;

// ── Demo word + sentence ──────────────────────────────────────────────────────
interface DemoContent { word: string; sentence: string }

const DEMO_SAMPLES: Record<string, DemoContent> = {
  en: { word: 'Spontaneous',     sentence: 'The morning light filtered through the trees.' },
  ja: { word: '自発的',           sentence: '朝の光が木々の間から差し込んでいた。' },
  ko: { word: '자연스러운',       sentence: '아침 햇살이 나무 사이로 스며들었다.' },
  zh: { word: '自发的',           sentence: '清晨的阳光透过树木洒落下来。' },
  es: { word: 'Espontáneo',      sentence: 'La luz de la mañana se filtraba entre los árboles.' },
  fr: { word: 'Spontané',        sentence: 'La lumière du matin filtrait à travers les arbres.' },
  de: { word: 'Spontan',         sentence: 'Das Morgenlicht drang durch die Bäume.' },
  it: { word: 'Spontaneo',       sentence: 'La luce del mattino filtrava tra gli alberi.' },
  pt: { word: 'Espontâneo',      sentence: 'A luz da manhã filtrava-se pelas árvores.' },
  ru: { word: 'Спонтанный',      sentence: 'Утренний свет проникал сквозь деревья.' },
  ar: { word: 'عفوي',            sentence: 'تسرَّب ضوء الصباح عبر الأشجار.' },
  hi: { word: 'स्वतःस्फूर्त',  sentence: 'सुबह की रोशनी पेड़ों के बीच से छनकर आ रही थी।' },
  tr: { word: 'Kendiliğinden',   sentence: 'Sabah ışığı ağaçların arasından süzülüyordu.' },
  nl: { word: 'Spontaan',        sentence: 'Het ochtendlicht filterde door de bomen.' },
  vi: { word: 'Ngẫu hứng',       sentence: 'Ánh sáng ban mai lọc qua tán cây.' },
  th: { word: 'โดยธรรมชาติ',     sentence: 'แสงเช้ากรองผ่านต้นไม้อย่างงดงาม' },
  id: { word: 'Spontan',         sentence: 'Cahaya pagi menyaring melalui pepohonan.' },
  pl: { word: 'Spontaniczny',    sentence: 'Poranne światło przesączało się przez drzewa.' },
  el: { word: 'Αυθόρμητος',      sentence: 'Το πρωινό φως διαπερνούσε τα δέντρα.' },
  sv: { word: 'Spontan',         sentence: 'Morgonljuset filtrerades genom träden.' },
};

function normalizeLangCode(code: string | undefined): string {
  if (!code || code === 'other') return 'en';
  return code.split(/[-_]/)[0].toLowerCase();
}

type DemoKey = 'word_default' | 'word_ai' | 'sentence_default' | 'sentence_ai';

const FREE_IDS           = new Set(['solid_blue', 'solid_gray']);
const PREMIUM_SHOP_ITEMS = SHOP_ITEMS.filter(i => !FREE_IDS.has(i.id));
const SKIN_BY_ID         = new Map(SKINS.map(s => [s.id, s]));

const STRIP_W = 84;
const STRIP_H = Math.round(STRIP_W * 1.5);

const CARD_PADDING = 26;
// card margin 16×2=32, padding 26×2=52, gap between two blocks = 12
const TOOL_BLOCK_W = (SW - 32 - CARD_PADDING * 2 - 12) / 2;

// Scattered decorative star positions for the hero section
const HERO_STARS = [
  { name: 'sparkles' as const, size: 16, top: 16,  left: 20,         opacity: 0.5 },
  { name: 'star'     as const, size: 8,  top: 28,  left: 58,         opacity: 0.35 },
  { name: 'star'     as const, size: 10, top: 10,  left: 108,        opacity: 0.25 },
  { name: 'sparkles' as const, size: 11, top: 55,  left: 30,         opacity: 0.3 },
  { name: 'sparkles' as const, size: 18, top: 10,  right: 22,        opacity: 0.5 },
  { name: 'star'     as const, size: 9,  top: 34,  right: 62,        opacity: 0.4 },
  { name: 'star'     as const, size: 12, top: 58,  right: 105,       opacity: 0.25 },
  { name: 'sparkles' as const, size: 10, top: 72,  right: 28,        opacity: 0.3 },
];

// ── Sub-components ────────────────────────────────────────────────────────────
// All sub-components use PLAN_BLUE directly — no themeColor prop needed.

interface PalProps { pal: Palette }

// ── Hero ──────────────────────────────────────────────────────────────────────

const HeroSection = React.memo(({ pal, t }: PalProps & { t: (k: any) => string }) => (
  <LinearGradient
    colors={[`${PLAN_BLUE}26`, `${PLAN_BLUE}08`] as [string, string]}
    style={s.heroGradient}
  >
    {/* Decorative scattered stars (non-interactive) */}
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {HERO_STARS.map((star, i) => (
        <Ionicons
          key={i}
          name={star.name}
          size={star.size}
          color={PLAN_BLUE}
          style={[
            { position: 'absolute', top: star.top, opacity: star.opacity },
            star.left  !== undefined ? { left:  star.left  } : {},
            star.right !== undefined ? { right: star.right } : {},
          ]}
        />
      ))}
    </View>

    {/* Promo badge */}
    <View style={s.heroBadge}>
      <Ionicons name="sparkles" size={12} color={PLAN_BLUE} style={{ marginRight: 5 }} />
      <Text style={s.heroBadgeText}>{t('plan_promo_label')}</Text>
    </View>

    {/* Headline */}
    <Text style={[s.heroHeadline, { color: pal.text }]}>{t('plan_hero_headline')}</Text>
    <Text style={[s.heroSubtitle, { color: pal.sub }]}>{t('plan_hero_subtitle')}</Text>

    {/* Feature icon trio */}
    <View style={s.heroIconRow}>
      {(['mic', 'bulb', 'color-palette'] as const).map(icon => (
        <View key={icon} style={s.heroIconBubble}>
          <Ionicons name={icon} size={24} color="#fff" />
        </View>
      ))}
    </View>
  </LinearGradient>
));

// ── Ribbon banner ─────────────────────────────────────────────────────────────

const RibbonBanner = React.memo(({ label }: { label: string }) => (
  <View style={s.ribbonWrap}>
    <View style={s.ribbon}>
      <Text style={s.ribbonText}>{label}</Text>
    </View>
  </View>
));

// ── Plan chip ─────────────────────────────────────────────────────────────────

const PlanChip = React.memo(({ label }: { label: string }) => (
  <View style={s.planChip}>
    <Ionicons name="checkmark-circle" size={13} color="#fff" style={{ marginRight: 4 }} />
    <Text style={s.planChipText}>{label}</Text>
  </View>
));

// ── Voice row ─────────────────────────────────────────────────────────────────

interface VoiceRowProps extends PalProps {
  text: string;
  demoKeyDefault: DemoKey;
  demoKeyAi: DemoKey;
  playingDemo: DemoKey | null;
  onPlay: (key: DemoKey) => void;
  defaultLabel: string;
}

const VoiceRow = React.memo(({
  text,
  demoKeyDefault, demoKeyAi,
  playingDemo, onPlay,
  pal, defaultLabel,
}: VoiceRowProps) => (
  <View style={s.voiceRow}>
    <View style={s.voiceTextCol}>
      <Text style={[s.voiceText, { color: pal.text }]} numberOfLines={2}>{text}</Text>
    </View>
    <View style={s.voiceButtonCol}>
      {/* Default voice button */}
      <TouchableOpacity
        style={[s.voiceBtn, { borderColor: pal.border, backgroundColor: pal.chip }]}
        onPress={() => onPlay(demoKeyDefault)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={playingDemo === demoKeyDefault ? 'pause-circle' : 'volume-medium-outline'}
          size={20}
          color={pal.sub}
        />
        <Text style={[s.voiceBtnLabel, { color: pal.sub }]} numberOfLines={1}>{defaultLabel}</Text>
      </TouchableOpacity>
      {/* AI voice button — filled blue, visually emphasized */}
      <TouchableOpacity
        style={s.voiceBtnAI}
        onPress={() => onPlay(demoKeyAi)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={playingDemo === demoKeyAi ? 'pause-circle' : 'volume-medium'}
          size={20}
          color="#fff"
        />
        <Text style={s.voiceBtnAILabel}>AI</Text>
      </TouchableOpacity>
    </View>
  </View>
));

// ── Natural AI Voice card ──────────────────────────────────────────────────────

interface AIVoiceCardProps extends PalProps {
  demo: DemoContent;
  playingDemo: DemoKey | null;
  onPlay: (key: DemoKey) => void;
  t: (k: any) => string;
}

const AIVoiceCard = React.memo(({ demo, playingDemo, onPlay, t, pal }: AIVoiceCardProps) => (
  <View style={[s.featureCard, { backgroundColor: pal.card, borderColor: pal.border }]}>
    <Text style={[s.cardTitle, { color: pal.text }]}>{t('feature_ai_voice')}</Text>

    {/* Demo playback area */}
    <View style={s.voiceDemoBox}>
      <VoiceRow
        text={demo.word}
        demoKeyDefault="word_default"
        demoKeyAi="word_ai"
        playingDemo={playingDemo}
        onPlay={onPlay}
        pal={pal}
        defaultLabel={t('default_voice')}
      />
      <View style={[s.voiceDivider, { backgroundColor: pal.border }]} />
      <VoiceRow
        text={demo.sentence}
        demoKeyDefault="sentence_default"
        demoKeyAi="sentence_ai"
        playingDemo={playingDemo}
        onPlay={onPlay}
        pal={pal}
        defaultLabel={t('default_voice')}
      />
    </View>

    <PlanChip label={t('basic_plan_name')} />
    <Text style={[s.cardDesc, { color: pal.sub }]}>{t('ai_voice_promo_desc')}</Text>
  </View>
));

// ── AI Learning Tools card ────────────────────────────────────────────────────

const AI_TOOLS = [
  { icon: 'bulb-outline'          as const, key: 'feature_ai_meaning' as const },
  { icon: 'document-text-outline' as const, key: 'feature_ai_example' as const },
  { icon: 'layers-outline'        as const, key: 'feature_breakdown'   as const },
  { icon: 'language-outline'      as const, key: 'feature_translate'   as const },
];

const AiFeaturesCard = React.memo(({ t, pal }: PalProps & { t: (k: any) => string }) => (
  <View style={[s.featureCard, { backgroundColor: pal.card, borderColor: pal.border }]}>
    <Text style={[s.cardTitle, { color: pal.text }]}>{t('ai_tools_title')}</Text>

    {/* 2×2 tool blocks */}
    <View style={s.toolsGrid}>
      {AI_TOOLS.map(({ icon, key }) => (
        <View key={key} style={[s.toolBlock, { width: TOOL_BLOCK_W }]}>
          <View style={s.toolIconBubble}>
            <Ionicons name={icon} size={22} color={PLAN_BLUE} />
          </View>
          <Text style={[s.toolLabel, { color: pal.text }]}>{t(key)}</Text>
        </View>
      ))}
    </View>

    <PlanChip label={t('basic_plan_name')} />
    <Text style={[s.cardDesc, { color: pal.sub }]}>{t('ai_tools_desc')}</Text>
  </View>
));

// ── Premium Themes card ───────────────────────────────────────────────────────

const PremiumThemesCard = React.memo(({ t, pal }: PalProps & { t: (k: any) => string }) => (
  <View style={[s.featureCard, { backgroundColor: pal.card, borderColor: pal.border }]}>
    <Text style={[s.cardTitle, { color: pal.text }]}>{t('feature_all_themes')}</Text>

    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.themeStrip}
      bounces={false}
    >
      {PREMIUM_SHOP_ITEMS.map(item => (
        <View key={item.id} style={[s.themeStripCard, { borderColor: pal.border }]}>
          {item.category === 'premium' ? (
            <PremiumSkinPreview item={item} skinData={SKIN_BY_ID.get(item.id)} width={STRIP_W} height={STRIP_H} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: item.previewBg, borderRadius: 10 }]} />
          )}
        </View>
      ))}
    </ScrollView>

    <PlanChip label={t('basic_plan_name')} />
    <Text style={[s.cardDesc, { color: pal.sub }]}>{t('themes_switch_desc')}</Text>
  </View>
));

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => Promise<void>;
  onRestore: () => Promise<void>;
  themeColor: string;
  pal: Palette;
  isSubscribed?: boolean;
  learningLang?: string;
  nativeLang?: string;
  onManageSubscription?: () => void;
}

export function ProSheet({
  visible,
  onClose,
  onSubscribe,
  onRestore,
  themeColor,
  pal,
  isSubscribed = false,
  learningLang,
  nativeLang = 'en-US',
  onManageSubscription,
}: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();
  const slideY    = useRef(new Animated.Value(SH)).current;
  const backdropO = useRef(new Animated.Value(0)).current;

  const [loading, setLoading]                         = useState(false);
  const [playingDemo, setPlayingDemo]                 = useState<DemoKey | null>(null);
  const [resolvedSampleLang, setResolvedSampleLang]   = useState('en-US');

  // Read onboarding choices directly from AsyncStorage each time the sheet opens.
  // This bypasses any App.tsx state-threading timing issues.
  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(ONBOARDING_KEY).then(raw => {
      if (!raw) {
        setResolvedSampleLang(learningLang ?? nativeLang ?? 'en-US');
        return;
      }
      try {
        const ob: OnboardingChoices = JSON.parse(raw);
        const lang =
          ob.purpose === 'language' && ob.learningLang && ob.learningLang !== 'other'
            ? ob.learningLang
            : ob.nativeLang && ob.nativeLang !== 'other'
            ? ob.nativeLang
            : null;
        setResolvedSampleLang(lang ?? learningLang ?? nativeLang ?? 'en-US');
      } catch {
        setResolvedSampleLang(learningLang ?? nativeLang ?? 'en-US');
      }
    });
  }, [visible]);

  const sampleKey = normalizeLangCode(resolvedSampleLang);
  const demo      = DEMO_SAMPLES[sampleKey] ?? DEMO_SAMPLES.en;

  // Slide-in / slide-out animation
  useEffect(() => {
    if (visible) {
      slideY.setValue(SH);
      backdropO.setValue(0);
      Animated.parallel([
        Animated.timing(backdropO, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropO, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: SH, duration: 220, useNativeDriver: true }),
      ]).start();
      setPlayingDemo(null);
      stopPlayback();
    }
  }, [visible]);

  // Reset playback when resolved language changes while sheet is open
  useEffect(() => {
    setPlayingDemo(null);
    stopPlayback();
  }, [sampleKey]);

  const handlePlayDemo = async (key: DemoKey) => {
    if (playingDemo === key) {
      stopPlayback();
      setPlayingDemo(null);
      return;
    }
    stopPlayback();
    setPlayingDemo(key);
    const text = key.startsWith('word') ? demo.word : demo.sentence;
    const isAI = key.endsWith('ai');
    try {
      await speak(text, isAI, resolvedSampleLang);
    } finally {
      setPlayingDemo(null);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try { await onSubscribe(); } finally { setLoading(false); }
  };

  if (!visible) return null;

  const BOTTOM_BAR_H = 130 + insets.bottom;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdropO }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[s.sheet, { backgroundColor: pal.bg, transform: [{ translateY: slideY }] }]}>
        {/* Fixed header */}
        <View style={[s.header, {
          paddingTop: insets.top + 10,
          backgroundColor: pal.dialog,
          borderBottomColor: pal.border,
        }]}>
          <TouchableOpacity
            style={s.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={pal.sub} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: pal.text }]}>{t('basic_plan_name')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ paddingBottom: BOTTOM_BAR_H }}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* Hero */}
          <HeroSection pal={pal} t={t} />

          {/* Ribbon section banner */}
          <RibbonBanner label={t('whats_included')} />

          {/* Feature cards */}
          <AIVoiceCard
            demo={demo}
            playingDemo={playingDemo}
            onPlay={handlePlayDemo}
            t={t}
            pal={pal}
          />
          <AiFeaturesCard t={t} pal={pal} />
          <PremiumThemesCard t={t} pal={pal} />
        </ScrollView>

        {/* Fixed bottom purchase bar */}
        <View style={[s.bottomBar, {
          backgroundColor: pal.dialog,
          borderTopColor: pal.border,
          paddingBottom: insets.bottom + 16,
        }]}>
          {/* Plan name label */}
          <Text style={[s.bottomPlanLabel, { color: pal.sub }]}>{t('basic_plan_name')}</Text>

          {isSubscribed ? (
            <TouchableOpacity
              style={[s.subscribeBtn, { backgroundColor: `${PLAN_BLUE}14`, borderWidth: 1.5, borderColor: PLAN_BLUE }]}
              onPress={onManageSubscription}
              activeOpacity={0.8}
            >
              <Text style={[s.subscribeBtnText, { color: PLAN_BLUE }]}>Manage Subscription</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[s.subscribeBtn, { backgroundColor: loading ? `${PLAN_BLUE}80` : PLAN_BLUE }]}
              onPress={handleSubscribe}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={[s.subscribeBtnText, { color: '#fff' }]}>
                {loading ? '···' : t('subscribe_price')}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.restoreBtn} onPress={onRestore} activeOpacity={0.7}>
            <Text style={[s.restoreBtnText, { color: pal.sub }]}>{t('restore_purchases')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: 0,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0.2 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  scroll: { flex: 1 },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroGradient: {
    paddingTop: 44,
    paddingBottom: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: PLAN_BLUE,
    backgroundColor: '#fff',
    marginBottom: 22,
  },
  heroBadgeText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2, color: PLAN_BLUE },
  heroHeadline: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 36,
  },
  heroIconRow: { flexDirection: 'row', gap: 24 },
  heroIconBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PLAN_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.18)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },

  // ── Ribbon banner ─────────────────────────────────────────────────────────
  ribbonWrap: { alignItems: 'center', marginTop: 32, marginBottom: 28 },
  ribbon: {
    width: SW - 52,
    height: 54,
    borderRadius: 10,
    backgroundColor: PLAN_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.15)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  },
  ribbonText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.4 },

  // ── Plan chip ─────────────────────────────────────────────────────────────
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: PLAN_BLUE,
    marginTop: 22,
  },
  planChipText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  // ── Feature cards ─────────────────────────────────────────────────────────
  featureCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 22,
    borderWidth: 1,
    padding: CARD_PADDING,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 28,
    marginBottom: 20,
  },
  cardDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 14,
  },

  // ── Voice demo ────────────────────────────────────────────────────────────
  voiceDemoBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    backgroundColor: PLAN_BLUE + '07',
    borderColor: PLAN_BLUE + '22',
  },
  voiceDivider: { height: StyleSheet.hairlineWidth, marginVertical: 18 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  voiceTextCol: { flex: 1 },
  voiceText: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  voiceButtonCol: { flexDirection: 'row', gap: 8 },
  voiceBtn: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 56,
    gap: 3,
  },
  voiceBtnAI: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: PLAN_BLUE,
    minWidth: 56,
    gap: 3,
    shadowColor: 'rgba(0,0,0,0.2)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 2,
  },
  voiceBtnLabel:   { fontSize: 9,  fontWeight: '700', letterSpacing: 0.3 },
  voiceBtnAILabel: { fontSize: 9,  fontWeight: '800', letterSpacing: 0.5, color: '#fff' },

  // ── AI tools 2×2 grid ────────────────────────────────────────────────────
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  toolBlock: {
    paddingVertical: 20,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: PLAN_BLUE + '08',
    borderColor: PLAN_BLUE + '20',
    alignItems: 'center',
    gap: 12,
  },
  toolIconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PLAN_BLUE + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },

  // ── Theme carousel ────────────────────────────────────────────────────────
  themeStrip: { gap: 10, paddingVertical: 6, paddingHorizontal: 2 },
  themeStripCard: {
    width: STRIP_W,
    height: STRIP_H,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },

  // ── Bottom purchase bar ───────────────────────────────────────────────────
  bottomBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  bottomPlanLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  subscribeBtn: {
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeBtnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  restoreBtn: { alignItems: 'center', paddingVertical: 8 },
  restoreBtnText: { fontSize: 13 },
});
