import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Dimensions,
  Easing,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Asset } from 'expo-asset';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { OnboardingChoices, Palette, ThemeSkin } from '../types';
import { FREE_THEME_COLOR, ONBOARDING_KEY, SKINS } from '../constants';
import { useLang, type TranslationKey } from '../i18n';
import { formatPrice } from '../lib/pricing';
import { speak, stopPlayback } from '../lib/tts';
import {
  PremiumSkinPreview,
  THEME_SCREENSHOTS,
  THEME_SCREENSHOTS_FLIP,
  THEME_VIDEOS,
  THEME_VIDEOS_FLIP,
  type ShopItem,
} from './ThemeSkinPreview';
import { SHOP_ITEMS } from './KisekaeShopSheet';
import { ThemeDetailsSheet } from './ThemeDetailsSheet';

const { height: SH, width: SW } = Dimensions.get('window');

const PLAN_BLUE   = FREE_THEME_COLOR;         // #3B82F6
const HERO_DARK   = '#0F2A5E';                // dark navy for headline

// ── Luxury accent palette ─────────────────────────────────────────────────────
// Gold metallic sheen (CTA + premium pills) and rich navy (premium purchase card).
const GOLD_LIGHT  = '#F9DE8A';
const GOLD_MAIN   = '#F5C842';
const GOLD_DEEP   = '#E0A526';
const GOLD_GRAD:  readonly [string, string, string] = [GOLD_LIGHT, GOLD_MAIN, GOLD_DEEP];

// ── Premium accent palettes ───────────────────────────────────────────────────
const HERO_GRAD: readonly [string, string, string] = ['#0C2350', '#173B72', '#0A1C3E'];
const CHECK_GREEN = '#22C55E';
const CROSS_GRAY  = '#B6BAC2';

// Paid plan tiers: Basic (polished blue) · Premium (most luxurious gold).
const BLUE_GRAD:  readonly [string, string] = ['#60A5FA', '#3B82F6'];
const BASIC_ACCENT   = '#1D4ED8';   // blue text/icons on the light-blue Basic column
const PREMIUM_ACCENT = '#B45309';   // deep amber text/icons on the light-gold Premium column

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

const CARD_PADDING = 26;
// App icon display size: 23% of screen width, capped so it doesn't overscale on tablets.
const ICON_SIZE    = Math.min(Math.round(SW * 0.23), 100);
const ICON_RADIUS  = Math.round(ICON_SIZE * 0.225); // matches iOS squircle corner ratio

// ── Theme carousel geometry ───────────────────────────────────────────────────
// Cards keep the real 1260×2736 media aspect ratio and are ~2× the old small
// preview, so one theme is showcased at a time with its neighbours peeking in.
const CARO_W        = 168;
const CARO_H        = Math.round(CARO_W * 2736 / 1260); // ≈ 365
const CARO_GAP      = 14;
const CARO_SLOT     = CARO_W + CARO_GAP;
const CARO_CONTAINER_W = SW - 32;                        // feature-card inner width
const CARO_INSET    = Math.max(CARO_GAP, (CARO_CONTAINER_W - CARO_W) / 2);

// Any shop item (premium skins + solid colors) can appear in the showcase.
const SHOP_BY_ID = new Map(SHOP_ITEMS.map(i => [i.id, i] as const));

// ── Premium feature sections (paywall showcase) ───────────────────────────────
// Static requires so Metro bundles the local PNGs reliably. Filenames map 1:1 to
// features; each screenshot keeps its own source dimensions and aspect ratio.
const PAYWALL_IMAGES = {
  custom:    require('../../screenshots/paywall/custom.png'),
  textToSpeech: require('../../screenshots/paywall/text-to-speech.png'),
  example:   require('../../screenshots/paywall/example.png'),
  breakdown: require('../../screenshots/paywall/breakdown.png'),
  meaning:   require('../../screenshots/paywall/meaning.png'),
  translate: require('../../screenshots/paywall/translate.png'),
  prioritySupport: require('../../screenshots/paywall/priority-support.png'),
  dataTransfer: require('../../screenshots/paywall/data-transfer.png'),
} as const;

// Standard screenshots now use nearly the full feature-card content width,
// while keeping a small inset from the landscape artwork used below.
const FEAT_WIDE_IMG_W = Math.min(SW - 76, 420);
const FEAT_IMG_W = Math.min(Math.round(FEAT_WIDE_IMG_W * 0.94), 395);

interface FeatureConfig {
  key: string;
  titleKey?: TranslationKey;
  descKey?: TranslationKey;
  noteKey?: TranslationKey;
  title?: string;
  description?: string;
  /** Screenshot preview. Omitted → the section renders an icon illustration. */
  image?: number;
  /** Wide landscape artwork should fill the card's usable content width. */
  wideImage?: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
  /** Which plans include this feature (drives the plan labels below the card). */
  basic: boolean;
  premium: boolean;
}

// Order matches the requested feature list. Each shares the luxurious white style
// but gets its own icon + blue-family accent as a small distinctive touch. The AI
// sections show screenshots; Priority Support / Data Transfer use wide artwork.
// `basic`/`premium` mirror the plan comparison table.
const FEATURE_SECTIONS: FeatureConfig[] = [
  { key: 'custom_voice', titleKey: 'cmp_custom_voice', descKey: 'feat_custom_voice_desc', noteKey: 'feat_custom_voice_note', image: PAYWALL_IMAGES.custom, icon: 'mic-outline', accent: '#0891B2', basic: false, premium: true },
  {
    key: 'text_to_speech',
    titleKey: 'feat_text_to_speech_title',
    descKey: 'feat_text_to_speech_desc',
    noteKey: 'feat_text_to_speech_note',
    image: PAYWALL_IMAGES.textToSpeech,
    icon: 'volume-high-outline',
    accent: '#7C3AED',
    basic: false,
    premium: true,
  },
  { key: 'meaning',   titleKey: 'cmp_ai_meaning',       descKey: 'feat_meaning_desc',     noteKey: 'feat_meaning_note',     image: PAYWALL_IMAGES.meaning,   icon: 'bulb-outline',        accent: '#0EA5E9', basic: false, premium: true },
  { key: 'example',   titleKey: 'cmp_ai_example',       descKey: 'feat_example_desc',     noteKey: 'feat_example_note',     image: PAYWALL_IMAGES.example,   icon: 'chatbubbles-outline', accent: '#3B82F6', basic: false, premium: true },
  { key: 'translate', titleKey: 'cmp_ai_translation',   descKey: 'feat_translation_desc', noteKey: 'feat_translation_note', image: PAYWALL_IMAGES.translate, icon: 'language-outline',    accent: '#2563EB', basic: false, premium: true },
  { key: 'breakdown', titleKey: 'cmp_ai_breakdown',     descKey: 'feat_breakdown_desc',   noteKey: 'feat_breakdown_note',   image: PAYWALL_IMAGES.breakdown, icon: 'git-branch-outline',  accent: '#4F46E5', basic: false, premium: true },
  { key: 'priority',  titleKey: 'cmp_priority_support', descKey: 'feat_priority_desc',    image: PAYWALL_IMAGES.prioritySupport, icon: 'headset',         accent: '#4338CA', basic: true, premium: true, wideImage: true },
  { key: 'transfer',  titleKey: 'cmp_data_transfer',    descKey: 'feat_transfer_desc',    image: PAYWALL_IMAGES.dataTransfer,    icon: 'swap-horizontal', accent: '#0284C7', basic: true, premium: true, wideImage: true },
];


// ── Hero section ──────────────────────────────────────────────────────────────

const HeroSection = React.memo(({ t }: { pal: Palette; t: (k: TranslationKey) => string }) => (
  <View style={hs.container}>

    {/* Deep navy premium gradient backdrop */}
    <LinearGradient
      colors={HERO_GRAD}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />

    {/* Soft golden glow behind the icon for depth */}
    <View pointerEvents="none" style={hs.glowOuter} />
    <View pointerEvents="none" style={hs.glowInner} />

    {/* Premium badge */}
    <View style={hs.badge}>
      <Ionicons name="diamond" size={11} color={GOLD_MAIN} style={{ marginRight: 7 }} />
      <Text style={hs.badgeText}>{t('plan_promo_label')}</Text>
    </View>

    {/* Main headline */}
    <Text style={hs.headline}>{t('plan_hero_headline')}</Text>

    {/* WordPing app icon in a metallic gold ring — the main focus */}
    <View style={hs.iconRing}>
      <View style={hs.iconClip}>
        <Image
          source={require('../../assets/icon.png')}
          style={hs.iconImg}
          resizeMode="contain"
        />
      </View>
    </View>

    {/* Refined gold divider line */}
    <View style={hs.divider} />

  </View>
));

// ── Ribbon banner ─────────────────────────────────────────────────────────────

const RibbonBanner = React.memo(({ label }: { label: string }) => (
  <View style={s.ribbonWrap}>
    <View style={s.ribbonInner}>
      <View style={s.ribbonLine} />
      <View style={s.ribbon}>
        <Text style={s.ribbonText}>{label}</Text>
      </View>
      <View style={s.ribbonLine} />
    </View>
  </View>
));

// ── Coffee value card ─────────────────────────────────────────────────────────
// White card in the screen's blue/gold language with the supplied coffee artwork.

const CoffeeValueCard = React.memo(({ t }: { t: (k: TranslationKey) => string }) => (
  <View style={cvs.card}>
    <View style={cvs.coffeeImageWrap}>
      <Image
        source={require('../../screenshots/paywall/coffee.jpg')}
        style={cvs.coffeeImage}
        resizeMode="contain"
      />
    </View>

    <Text style={cvs.text}>{t('plan_coffee_line2')}</Text>
  </View>
));

// ── Animated waveform ─────────────────────────────────────────────────────────
// Bars pulse on the native thread (scaleY) only while `active`; otherwise they
// rest at a low static height. No per-frame JS.

const WAVE_BASE = [0.45, 0.7, 1, 0.6, 0.85, 0.55, 0.75];

const Waveform = React.memo(function Waveform({
  active, color, height = 20, barWidth = 3,
}: { active: boolean; color: string; height?: number; barWidth?: number }) {
  const bars = useRef(WAVE_BASE.map(() => new Animated.Value(0.32))).current;
  useEffect(() => {
    if (!active) {
      bars.forEach(b => { b.stopAnimation(); Animated.timing(b, { toValue: 0.32, duration: 200, useNativeDriver: true }).start(); });
      return;
    }
    const loops = bars.map((b, i) =>
      Animated.loop(Animated.sequence([
        Animated.timing(b, { toValue: 1,    duration: 320 + i * 55, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(b, { toValue: 0.35, duration: 320 + i * 55, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [active]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height, gap: 2 }}>
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={{ width: barWidth, height, borderRadius: barWidth / 2, backgroundColor: color, transform: [{ scaleY: b }] }}
        />
      ))}
    </View>
  );
});

// ── Voice row ─────────────────────────────────────────────────────────────────
// Sample text on top; the Default and AI High-Quality playback buttons sit below
// it. Text wraps fully so the sentence is never clipped.

interface VoiceRowProps {
  text: string;
  demoKeyDefault: DemoKey;
  demoKeyAi: DemoKey;
  playingDemo: DemoKey | null;
  onPlay: (key: DemoKey) => void;
  defaultLabel: string;
  aiLabel: string;
}

const VoiceRow = React.memo(({ text, demoKeyDefault, demoKeyAi, playingDemo, onPlay, defaultLabel, aiLabel }: VoiceRowProps) => {
  const defaultPlaying = playingDemo === demoKeyDefault;
  const aiPlaying      = playingDemo === demoKeyAi;
  return (
    <View style={av.row}>
      <Text style={av.sampleText}>{text}</Text>
      <View style={av.btnRow}>
        {/* Default voice — understated outline */}
        <TouchableOpacity
          style={av.defaultBtn}
          onPress={() => onPlay(demoKeyDefault)}
          activeOpacity={0.8}
          accessibilityLabel={defaultLabel}
        >
          <Ionicons name={defaultPlaying ? 'pause' : 'play'} size={13} color="#64748B" />
          <Text style={av.defaultLabel} numberOfLines={1}>{defaultLabel}</Text>
        </TouchableOpacity>

        {/* AI High-Quality voice — rich blue, soft glow + live waveform */}
        <TouchableOpacity
          style={[av.aiBtnWrap, aiPlaying && av.aiGlow]}
          onPress={() => onPlay(demoKeyAi)}
          activeOpacity={0.9}
          accessibilityLabel={aiLabel}
        >
          <LinearGradient colors={BLUE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={av.aiBtn}>
            <Ionicons name={aiPlaying ? 'pause' : 'play'} size={13} color="#fff" />
            {aiPlaying
              ? <Waveform active color="#fff" height={16} barWidth={2.5} />
              : <Text style={av.aiLabel} numberOfLines={1}>AI</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ── AI High-Quality Voice card ────────────────────────────────────────────────
// Bright, white-based premium card: rich blue accents, a subtle gold flourish,
// soft shadows, and a refined sound-wave.

interface AIVoiceCardProps { pal: Palette; demo: DemoContent; playingDemo: DemoKey | null; onPlay: (key: DemoKey) => void; t: (k: TranslationKey) => string }

const AIVoiceCard = React.memo(({ demo, playingDemo, onPlay, t }: AIVoiceCardProps) => {
  const aiLabel = t('cmp_ai_voice_hq');
  return (
    <View style={av.cardShadow}>
      <View style={av.card}>

        {/* Header */}
        <View style={av.header}>
          <Text style={av.title}>{aiLabel}</Text>
        </View>

        {/* Default vs AI comparison */}
        <View style={av.panel}>
          <VoiceRow text={demo.word}     demoKeyDefault="word_default"     demoKeyAi="word_ai"     playingDemo={playingDemo} onPlay={onPlay} defaultLabel={t('default_voice')} aiLabel={aiLabel} />
          <View style={av.divider} />
          <VoiceRow text={demo.sentence} demoKeyDefault="sentence_default" demoKeyAi="sentence_ai" playingDemo={playingDemo} onPlay={onPlay} defaultLabel={t('default_voice')} aiLabel={aiLabel} />
        </View>

        <PlanLabels basic premium t={t} />

        {/* Description moved below the Basic/Premium label */}
        <Text style={av.subtitle}>{t('ai_voice_promo_desc')}</Text>

      </View>
    </View>
  );
});

// ── Premium feature section ───────────────────────────────────────────────────
// Shared white card used for the four AI feature showcases below the voice card.

// Renders the preview image only once it has decoded — nothing shows before its
// own source is ready, and no other feature's image can flash in.
const FeatureImage = React.memo(function FeatureImage({
  source, wide = false,
}: { source: number; wide?: boolean }) {
  const [ready, setReady] = useState(false);
  const resolvedSource = Image.resolveAssetSource(source);
  const aspectRatio = resolvedSource?.width && resolvedSource?.height
    ? resolvedSource.width / resolvedSource.height
    : 1260 / 2736;

  return (
    <View style={[fs.imageShadow, wide && fs.wideImageNoShadow]}>
      <View style={[fs.imageClip, wide && fs.wideImageClip, { width: wide ? FEAT_WIDE_IMG_W : FEAT_IMG_W, aspectRatio }]}>
        <Image
          source={source}
          style={[fs.image, { opacity: ready ? 1 : 0 }]}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={() => setReady(true)}
        />
      </View>
    </View>
  );
});

// Plan-inclusion labels shown below a benefit section: Basic (blue) and/or
// Premium (gold), matching which plans include the feature.
const PlanLabels = React.memo(function PlanLabels({
  basic, premium, t,
}: { basic: boolean; premium: boolean; t: (k: TranslationKey) => string }) {
  if (!basic && !premium) return null;
  return (
    <View style={pl.row}>
      {basic && (
        <LinearGradient colors={BLUE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={pl.basic}>
          <Text style={pl.basicText}>{t('basic')}</Text>
        </LinearGradient>
      )}
      {premium && (
        <LinearGradient colors={GOLD_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={pl.premium}>
          <Ionicons name="diamond" size={9} color={HERO_DARK} style={{ marginRight: 3 }} />
          <Text style={pl.premiumText}>{t('cmp_premium')}</Text>
        </LinearGradient>
      )}
    </View>
  );
});

// Icon-based visual for sections without a screenshot (Priority Support, Data
// Transfer) — a large accented icon badge over a soft blue panel, gold flourish.
const FeatureIconVisual = React.memo(function FeatureIconVisual({
  icon, accent,
}: { icon: React.ComponentProps<typeof Ionicons>['name']; accent: string }) {
  return (
    <View style={fs.iconVisual}>
      <LinearGradient colors={[`${accent}14`, `${accent}06`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[fs.iconBadge, { backgroundColor: `${accent}1A`, borderColor: `${accent}33` }]}>
        <Ionicons name={icon} size={42} color={accent} />
      </View>
      <Ionicons name="sparkles" size={13} color={GOLD_MAIN} style={fs.iconSparkle} />
    </View>
  );
});

const FeatureSection = React.memo(function FeatureSection({
  title, description, note, source, wideImage = false, accent, icon, basic, premium, t,
}: {
  title: string;
  description: string;
  note?: string;
  source?: number;
  wideImage?: boolean;
  accent: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  basic: boolean;
  premium: boolean;
  t: (k: TranslationKey) => string;
}) {
  return (
    <View style={[fs.cardShadow, { shadowColor: accent }]}>
      <View style={fs.card}>
        <View style={fs.header}>
          <Text style={fs.title} numberOfLines={2}>{title}</Text>
        </View>
        {source != null
          ? <FeatureImage source={source} wide={wideImage} />
          : <FeatureIconVisual icon={icon} accent={accent} />}
        <PlanLabels basic={basic} premium={premium} t={t} />
        {/* Description moved below the Basic/Premium label */}
        <Text style={fs.desc}>{description}</Text>
        {note ? (
          <Text style={fs.noteText}>{`※ ${note}`}</Text>
        ) : null}
      </View>
    </View>
  );
});

// ── Theme carousel ────────────────────────────────────────────────────────────
// One horizontal row that auto-advances every 3s (single timer), pauses on drag /
// when Theme Details is open / when the sheet is hidden, and respects reduced
// motion. Only the centered card mounts a live video.

type TileMedia =
  | { type: 'image'; source: number }
  | { type: 'video'; source: number };

interface GalleryTile { key: string; item: ShopItem; media: TileMedia }

const GALLERY_ORDER = [
  'skin_deep_sea', 'skin_sakura', 'skin_galaxy', 'skin_snow', 'skin_aurora',
  'solid_teal', 'solid_beige', 'skin_cyber', 'shop_roses', 'solid_mint',
  'shop_woods', 'skin_leaf_blur', 'skin_rain', 'skin_night_city', 'solid_orange',
  'skin_paw',
];

// First (slot 1) or second (slot 2) media item from a theme's Theme Details preview.
function resolveTileMedia(id: string, slot: 1 | 2): TileMedia | null {
  const video = slot === 1 ? THEME_VIDEOS[id] : THEME_VIDEOS_FLIP[id];
  if (video != null) return { type: 'video', source: video };
  const img = slot === 1 ? THEME_SCREENSHOTS[id] : THEME_SCREENSHOTS_FLIP[id];
  if (img != null) return { type: 'image', source: img };
  return null;
}

// One card per theme, using its first available media item.
const CAROUSEL_TILES: GalleryTile[] = GALLERY_ORDER.reduce<GalleryTile[]>((acc, id) => {
  const item = SHOP_BY_ID.get(id);
  const media = resolveTileMedia(id, 1);
  if (item && media) acc.push({ key: id, item, media });
  return acc;
}, []);

// Neutral backing shown behind any letterboxed media.
const CARO_MEDIA_BG = '#0F172A';

// Infinite loop: clone a few tiles on each side so scrolling past the last theme
// continues forward into the first (and vice-versa) with no visible jump.
const N_TILES    = CAROUSEL_TILES.length;
const CLONES     = N_TILES > 1 ? Math.min(3, N_TILES) : 0;
const FIRST_REAL = CLONES;                    // looped position of real index 0
const LAST_REAL  = CLONES + N_TILES - 1;      // looped position of real index N-1
const LOOP_TILES: GalleryTile[] = N_TILES > 1
  ? [...CAROUSEL_TILES.slice(N_TILES - CLONES), ...CAROUSEL_TILES, ...CAROUSEL_TILES.slice(0, CLONES)]
  : CAROUSEL_TILES;

// ── Accessibility / lifecycle hooks ───────────────────────────────────────────

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduce(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => setActive(st === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

// ── Tile media ────────────────────────────────────────────────────────────────
// Image and video use identical explicit bounds + `contain`, so media is centered
// and never cropped, stretched, or anchored off-corner. Nothing shows until ready.

const TileImage = React.memo(function TileImage({ source, width, height }: { source: number; width: number; height: number }) {
  const [ready, setReady] = useState(false);
  return (
    <Image
      source={source}
      style={{ width, height, opacity: ready ? 1 : 0 }}
      resizeMode="contain"
      fadeDuration={0}
      onLoad={() => setReady(true)}
    />
  );
});

// Muted, looping video. Created (and buffered) as soon as it mounts so it can be
// preloaded before it is centered; it only plays while `active`. useVideoPlayer
// releases the player automatically when the card unmounts.
const TileVideoPlayer = React.memo(function TileVideoPlayer({ source, width, height, active }: { source: number; width: number; height: number; active: boolean }) {
  const [ready, setReady] = useState(false);
  const player = useVideoPlayer(source, p => {
    p.loop  = true;
    p.muted = true;
    // Preloaded paused — playback starts only when the card becomes centered.
  });
  useEffect(() => {
    if (player.status === 'readyToPlay') setReady(true);
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setReady(true);
    });
    return () => sub.remove();
  }, [player]);
  useEffect(() => {
    if (active) player.play(); else player.pause();
  }, [active, player]);
  return (
    <VideoView
      player={player}
      style={{ width, height, opacity: ready ? 1 : 0 }}
      contentFit="contain"
      nativeControls={false}
    />
  );
});

// ── Carousel card ─────────────────────────────────────────────────────────────

const CarouselCard = React.memo(function CarouselCard({
  tile, position, scrollX, mounted, videoActive, onPress, pal, t,
}: {
  tile: GalleryTile;
  position: number;
  scrollX: Animated.Value;
  /** Mount heavy media (preload window); false renders just the neutral card. */
  mounted: boolean;
  /** This card is centered → its video plays. */
  videoActive: boolean;
  onPress: (item: ShopItem) => void;
  pal: Palette;
  t: (k: TranslationKey) => string;
}) {
  const { item, media } = tile;
  const localizedName = t(item.nameKey);
  const skinData = useMemo<ThemeSkin | undefined>(() => SKINS.find(sk => sk.id === item.id), [item.id]);

  // Gentle emphasis of the centered card (native-driven, no JS per frame).
  const inputRange = [(position - 1) * CARO_SLOT, position * CARO_SLOT, (position + 1) * CARO_SLOT];
  const scale   = scrollX.interpolate({ inputRange, outputRange: [0.9, 1, 0.9],  extrapolate: 'clamp' });
  const opacity = scrollX.interpolate({ inputRange, outputRange: [0.72, 1, 0.72], extrapolate: 'clamp' });

  return (
    <TouchableOpacity
      style={{ width: CARO_SLOT }}
      activeOpacity={0.9}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={localizedName}
    >
      <Animated.View style={[caro.card, { transform: [{ scale }], opacity }]}>
        <View style={caro.cardInner}>
          {mounted && (media.type === 'image'
            ? <TileImage source={media.source} width={CARO_W} height={CARO_H} />
            : (
              <>
                <PremiumSkinPreview item={item} skinData={skinData} width={CARO_W} height={CARO_H} />
                <TileVideoPlayer source={media.source} width={CARO_W} height={CARO_H} active={videoActive} />
              </>
            ))}
        </View>
      </Animated.View>

      {/* Theme name — below the card so the preview stays fully unobstructed */}
      <Animated.Text style={[caro.name, { color: pal.text, opacity }]} numberOfLines={1}>
        {localizedName}
      </Animated.Text>
    </TouchableOpacity>
  );
});

// ── Premium themes carousel ───────────────────────────────────────────────────

const PremiumThemesCarousel = React.memo(function PremiumThemesCarousel({
  t, pal, visible, detailsOpen, onOpenDetails,
}: {
  t: (k: TranslationKey) => string;
  pal: Palette;
  visible: boolean;
  detailsOpen: boolean;
  onOpenDetails: (item: ShopItem) => void;
}) {
  const reduceMotion = useReduceMotion();
  const appActive    = useAppActive();

  const scrollX          = useRef(new Animated.Value(FIRST_REAL * CARO_SLOT)).current;
  const scrollRef        = useRef<ScrollView>(null);
  const activeVirtualRef = useRef(FIRST_REAL);
  const restartTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapTimer        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeVirtual, setActiveVirtualState] = useState(FIRST_REAL);
  const [interacting,   setInteracting]        = useState(false);

  const setActive = useCallback((v: number) => {
    activeVirtualRef.current = v;
    setActiveVirtualState(v);
  }, []);

  // Video may play when the section is on-screen; auto-advance additionally
  // requires motion allowed and the user not interacting.
  const mediaActive       = visible && appActive && !detailsOpen;
  const shouldAutoAdvance = mediaActive && !reduceMotion && !interacting && N_TILES > 1;

  // Center the first real card on mount (covers platforms that ignore contentOffset).
  useEffect(() => {
    const id = requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: FIRST_REAL * CARO_SLOT, animated: false }));
    return () => cancelAnimationFrame(id);
  }, []);

  // Single 3-second forward timer. It always advances by exactly one card; when it
  // steps into the tail-clone region it silently snaps back to the matching real
  // card AFTER the forward animation — so it continues into the first theme and
  // never animates backward through the whole list.
  useEffect(() => {
    if (!shouldAutoAdvance) return;
    const id = setInterval(() => {
      let cur = activeVirtualRef.current;
      // If we paused on a clone, silently normalize before advancing.
      if (cur > LAST_REAL) { cur -= N_TILES; scrollRef.current?.scrollTo({ x: cur * CARO_SLOT, animated: false }); }
      else if (cur < FIRST_REAL) { cur += N_TILES; scrollRef.current?.scrollTo({ x: cur * CARO_SLOT, animated: false }); }

      const next = cur + 1;
      scrollRef.current?.scrollTo({ x: next * CARO_SLOT, animated: true });
      setActive(next);

      if (next > LAST_REAL) {
        if (snapTimer.current) clearTimeout(snapTimer.current);
        snapTimer.current = setTimeout(() => {
          const real = next - N_TILES;
          scrollRef.current?.scrollTo({ x: real * CARO_SLOT, animated: false });
          setActive(real);
          snapTimer.current = null;
        }, 450);
      }
    }, 3000);
    return () => {
      clearInterval(id);
      if (snapTimer.current) { clearTimeout(snapTimer.current); snapTimer.current = null; }
    };
  }, [shouldAutoAdvance, setActive]);

  useEffect(() => () => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    if (snapTimer.current) clearTimeout(snapTimer.current);
  }, []);

  const onBeginDrag = useCallback(() => {
    if (restartTimer.current) { clearTimeout(restartTimer.current); restartTimer.current = null; }
    setInteracting(true);
  }, []);

  const onEndDrag = useCallback(() => {
    // Fallback if no momentum event follows — resume shortly after the drag.
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = setTimeout(() => setInteracting(false), 600);
  }, []);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    let v = Math.round(e.nativeEvent.contentOffset.x / CARO_SLOT);
    // Landed on a clone → silently reposition to the matching real card.
    if (v > LAST_REAL) {
      v -= N_TILES;
      scrollRef.current?.scrollTo({ x: v * CARO_SLOT, animated: false });
    } else if (v < FIRST_REAL) {
      v += N_TILES;
      scrollRef.current?.scrollTo({ x: v * CARO_SLOT, animated: false });
    }
    setActive(v);
    if (restartTimer.current) { clearTimeout(restartTimer.current); restartTimer.current = null; }
    setInteracting(false);
  }, [setActive]);

  return (
    <View style={[s.featureCard, { backgroundColor: pal.card, borderColor: pal.border, paddingHorizontal: 0 }]}>

      <Text style={[s.cardTitle, { color: pal.text, paddingHorizontal: CARD_PADDING }]}>
        {t('feature_all_themes')}
      </Text>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARO_SLOT}
        decelerationRate="fast"
        snapToAlignment="start"
        contentOffset={{ x: FIRST_REAL * CARO_SLOT, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: CARO_INSET, paddingTop: 16, paddingBottom: 8 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        onScrollBeginDrag={onBeginDrag}
        onScrollEndDrag={onEndDrag}
        onMomentumScrollEnd={onMomentumEnd}
        bounces={false}
      >
        {LOOP_TILES.map((tile, position) => (
          // Every tile stays mounted for the whole time the sheet is open, so all
          // images/videos preload up-front and a swipe back shows instantly with no
          // reload. They unmount (releasing players) only when the sheet closes.
          <CarouselCard
            key={position}
            tile={tile}
            position={position}
            scrollX={scrollX}
            mounted={visible}
            videoActive={mediaActive && position === activeVirtual}
            onPress={onOpenDetails}
            pal={pal}
            t={t}
          />
        ))}
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: CARD_PADDING, marginTop: 18 }}>
        <PlanLabels basic premium t={t} />

        <Text style={[s.cardDesc, { color: pal.sub, marginTop: 14 }]}>
          {t('themes_switch_desc')}
        </Text>

        {/* Value promo — polished Basic-plan blue banner beneath the description */}
        <View style={s.themePromo}>
          <LinearGradient
            colors={['#EFF5FF', '#DBE8FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient colors={BLUE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.themePromoBadge}>
            <Ionicons name="pricetags" size={14} color="#fff" />
          </LinearGradient>
          <Text style={s.themePromoText}>{t('themes_value_promo')}</Text>
          <Ionicons name="sparkles" size={14} color={BLUE_GRAD[1]} style={{ marginLeft: 10 }} />
        </View>
      </View>

    </View>
  );
});

// ── Plan comparison table ─────────────────────────────────────────────────────

type CellValue = 'check' | 'cross' | 'infinite' | string;

// One plan cell. `accent` colors text + the infinity icon; check/cross stay
// consistent across every column for easy scanning.
function TableCell({ value, accent }: { value: CellValue; accent: string }) {
  if (value === 'check') {
    return <Ionicons name="checkmark-circle" size={19} color={CHECK_GREEN} />;
  }
  if (value === 'cross') {
    return <Ionicons name="close" size={16} color={CROSS_GRAY} />;
  }
  if (value === 'infinite') {
    return <Ionicons name="infinite" size={20} color={accent} />;
  }
  return (
    <Text style={[tbl.cellValue, { color: accent }]} numberOfLines={3}>
      {value}
    </Text>
  );
}

interface TableRowData { label: string; basic: CellValue; premium: CellValue }

const PlanComparisonTable = React.memo(function PlanComparisonTable({
  t, pal,
}: { t: (k: TranslationKey) => string; pal: Palette }) {
  const rows: TableRowData[] = [
    { label: t('cmp_themes'),           basic: 'infinite', premium: 'infinite' },
    { label: t('cmp_ai_voice_hq'),      basic: 'infinite', premium: 'infinite' },
    { label: t('cmp_custom_voice'),     basic: 'cross', premium: 'infinite' },
    { label: t('feat_text_to_speech_title'), basic: 'cross', premium: 'infinite' },
    { label: t('cmp_ai_example'),       basic: 'cross', premium: 'infinite' },
    { label: t('cmp_ai_breakdown'),     basic: 'cross', premium: 'infinite' },
    { label: t('cmp_ai_meaning'),       basic: 'cross', premium: 'infinite' },
    { label: t('cmp_ai_translation'),   basic: 'cross', premium: 'infinite' },
    { label: t('cmp_priority_support'), basic: 'check', premium: 'check' },
    { label: t('cmp_data_transfer'),    basic: 'check', premium: 'check' },
  ];

  return (
    <View style={[tbl.container, { backgroundColor: pal.card, borderColor: pal.border }]}>

      {/* Header row */}
      <View style={[tbl.headerRow, { borderBottomColor: pal.border }]}>
        <View style={tbl.featureColHdr}>
          <Text style={[tbl.hdrFeatureText, { color: pal.sub }]}>{t('cmp_feature_col')}</Text>
        </View>

        {/* Basic — polished blue */}
        <View style={[tbl.planColHdr, tbl.basicColHdr]}>
          <LinearGradient colors={BLUE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={tbl.planPill}>
            <Text style={[tbl.planPillText, { color: '#fff' }]} numberOfLines={1}>{t('basic_plan_name')}</Text>
          </LinearGradient>
        </View>

        {/* Premium — most luxurious gold */}
        <View style={[tbl.planColHdr, tbl.premiumColHdr]}>
          <LinearGradient colors={GOLD_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={tbl.premiumPill}>
            <Ionicons name="diamond" size={9} color={HERO_DARK} style={{ marginRight: 3 }} />
            <Text style={[tbl.planPillText, { color: HERO_DARK }]} numberOfLines={1}>{t('cmp_premium')}</Text>
          </LinearGradient>
        </View>
      </View>

      {/* Data rows */}
      {rows.map((row, i) => (
        <View
          key={i}
          style={[
            tbl.dataRow,
            i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: pal.border },
          ]}
        >
          <View style={tbl.featureCell}>
            <Text style={[tbl.featureLabel, { color: pal.text }]} numberOfLines={3}>{row.label}</Text>
          </View>
          <View style={[tbl.planCell, tbl.basicCell]}>
            <TableCell value={row.basic} accent={BASIC_ACCENT} />
          </View>
          <View style={[tbl.planCell, tbl.premiumCell]}>
            <TableCell value={row.premium} accent={PREMIUM_ACCENT} />
          </View>
        </View>
      ))}

    </View>
  );
});

// ── Fixed purchase bar ────────────────────────────────────────────────────────
// Pinned to the bottom of the sheet. Content scrolls above it; the localized
// price stays visible and all purchase / owned / loading states are preserved.

interface FixedPurchaseBarProps {
  pal: Palette;
  t: (k: TranslationKey) => string;
  isSubscribed: boolean;
  isPremium: boolean;
  loadingPlan: 'basic' | 'premium' | null;
  bottomInset: number;
  onSubscribeBasic: () => void;
  onSubscribePremium: () => void;
  onRestore: () => void;
  onManageSubscription?: () => void;
  onMeasure: (h: number) => void;
}

const FixedPurchaseBar = React.memo(({
  pal, t, isSubscribed, isPremium, loadingPlan, bottomInset, onSubscribeBasic, onSubscribePremium, onRestore, onManageSubscription, onMeasure,
}: FixedPurchaseBarProps) => {
  const basicLoading   = loadingPlan === 'basic';
  const premiumLoading = loadingPlan === 'premium';
  const anyLoading     = loadingPlan !== null;
  const basicOwned     = isSubscribed && !isPremium;   // exactly the Basic plan
  const premiumOwned   = isPremium;

  return (
    <View
      style={[bar.wrap, { paddingBottom: bottomInset + 8, backgroundColor: pal.dialog, borderTopColor: pal.border }]}
      onLayout={e => onMeasure(e.nativeEvent.layout.height)}
    >
      <View style={bar.btnRow}>

        {/* Basic — polished blue */}
        <TouchableOpacity
          style={bar.btnWrapBlue}
          onPress={basicOwned ? onManageSubscription : onSubscribeBasic}
          disabled={anyLoading}
          activeOpacity={0.9}
          accessibilityLabel={basicOwned ? 'Manage Basic subscription' : t('subscribe_price')}
          accessibilityState={{ selected: basicOwned, disabled: anyLoading }}
        >
          <LinearGradient
            colors={BLUE_GRAD}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[bar.btn, anyLoading && !basicLoading && { opacity: 0.55 }]}
          >
            {basicLoading ? (
              <Text style={bar.btnName}>···</Text>
            ) : (
              <>
                <View style={bar.btnTopRow}>
                  {basicOwned && <Ionicons name="checkmark-circle" size={14} color="#fff" style={{ marginRight: 4 }} />}
                  <Text style={bar.btnName} numberOfLines={1}>{t('basic_plan_name')}</Text>
                </View>
                <Text style={[bar.btnSub, !basicOwned && bar.btnPrice]} numberOfLines={1} adjustsFontSizeToFit>
                  {basicOwned ? t('theme_details_owned_badge') : `${formatPrice(320)}${t('per_month')}`}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Premium — most luxurious gold */}
        <TouchableOpacity
          style={bar.btnWrapGold}
          onPress={premiumOwned ? onManageSubscription : onSubscribePremium}
          disabled={anyLoading}
          activeOpacity={0.9}
          accessibilityLabel={premiumOwned ? 'Manage Premium subscription' : t('cmp_premium')}
          accessibilityState={{ selected: premiumOwned, disabled: anyLoading }}
        >
          <LinearGradient
            colors={GOLD_GRAD}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[bar.btn, bar.btnGold, anyLoading && !premiumLoading && { opacity: 0.55 }]}
          >
            {premiumLoading ? (
              <Text style={[bar.btnName, { color: HERO_DARK }]}>···</Text>
            ) : (
              <>
                <View style={bar.btnTopRow}>
                  <Ionicons
                    name={premiumOwned ? 'checkmark-circle' : 'diamond'}
                    size={14}
                    color={HERO_DARK}
                    style={{ marginRight: premiumOwned ? 4 : 5 }}
                  />
                  <Text style={[bar.btnName, { color: HERO_DARK }]} numberOfLines={1}>
                    {t('cmp_premium')}
                  </Text>
                </View>
                <Text style={[bar.btnSub, !premiumOwned && bar.btnPrice, { color: HERO_DARK }]} numberOfLines={1} adjustsFontSizeToFit>
                  {premiumOwned ? t('theme_details_owned_badge') : `${formatPrice(600)}${t('per_month')}`}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={bar.restoreBtn}
        onPress={onRestore}
        disabled={anyLoading}
        accessibilityRole="button"
        accessibilityState={{ disabled: anyLoading }}
      >
        <Text style={[bar.restoreText, { color: pal.sub }]}>{t('restore_purchases')}</Text>
      </TouchableOpacity>

    </View>
  );
});


// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => Promise<void>;
  /** Optional Premium purchase flow. Falls back to onSubscribe when not wired. */
  onSubscribePremium?: () => Promise<void>;
  onRestore: () => Promise<void>;
  themeColor: string;
  pal: Palette;
  isSubscribed?: boolean;
  isPremium?: boolean;
  learningLang?: string;
  nativeLang?: string;
  onManageSubscription?: () => void;
  /** Current active skin id — forwarded to Theme Details. */
  skinId?: string | null;
  /** Apply a skin from Theme Details (used when subscribed). */
  onPickSkin?: (id: string | null) => void;
}

export function ProSheet({
  visible,
  onClose,
  onSubscribe,
  onSubscribePremium,
  onRestore,
  themeColor,
  pal,
  isSubscribed = false,
  isPremium = false,
  learningLang,
  nativeLang = 'en-US',
  onManageSubscription,
  skinId,
  onPickSkin,
}: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();
  const slideY       = useRef(new Animated.Value(SH)).current;
  const backdropO    = useRef(new Animated.Value(0)).current;
  const mainScrollRef = useRef<ScrollView>(null);
  const demoSequence = useRef(0);
  const hasPreloadedMedia = useRef(false);

  const [loadingPlan, setLoadingPlan]               = useState<'basic' | 'premium' | null>(null);
  const [playingDemo, setPlayingDemo]               = useState<DemoKey | null>(null);
  const [resolvedSampleLang, setResolvedSampleLang] = useState('en-US');
  const [detailsItem, setDetailsItem]               = useState<ShopItem | null>(null);
  // Measured height of the fixed bottom bar → keeps scroll content clear of it.
  const [barHeight, setBarHeight]                   = useState(150);

  // Keep optional carousel media off the critical startup path, but cache the
  // first items the first time the plan sheet is requested.
  useEffect(() => {
    if (!visible || hasPreloadedMedia.current) return;
    hasPreloadedMedia.current = true;
    const sources: number[] = [
      require('../../assets/icon.png'),
      ...CAROUSEL_TILES.slice(0, 4).map(tl => tl.media.source),
    ];
    Asset.loadAsync(sources).catch(() => {});
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(ONBOARDING_KEY).then(raw => {
      if (!raw) { setResolvedSampleLang(learningLang ?? nativeLang ?? 'en-US'); return; }
      try {
        const ob: OnboardingChoices = JSON.parse(raw);
        const lang =
          ob.purpose === 'language' && ob.learningLang && ob.learningLang !== 'other'
            ? ob.learningLang
            : ob.nativeLang && ob.nativeLang !== 'other'
            ? ob.nativeLang
            : null;
        setResolvedSampleLang(lang ?? learningLang ?? nativeLang ?? 'en-US');
      } catch { setResolvedSampleLang(learningLang ?? nativeLang ?? 'en-US'); }
    });
  }, [visible]);

  const sampleKey = normalizeLangCode(resolvedSampleLang);
  const demo      = DEMO_SAMPLES[sampleKey] ?? DEMO_SAMPLES.en;

  // Set initial position synchronously before the first paint so the sheet
  // never appears at an incorrect position when becoming visible.
  useLayoutEffect(() => {
    if (visible) {
      slideY.setValue(SH);
      backdropO.setValue(0);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropO, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropO, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: SH, duration: 220, useNativeDriver: true }),
      ]).start();
      demoSequence.current++;
      setPlayingDemo(null);
      stopPlayback();
    }
  }, [visible]);

  useEffect(() => { demoSequence.current++; setPlayingDemo(null); stopPlayback(); }, [sampleKey]);

  const handlePlayDemo = async (key: DemoKey) => {
    if (playingDemo === key) {
      demoSequence.current++;
      stopPlayback();
      setPlayingDemo(null);
      return;
    }
    const sequence = ++demoSequence.current;
    setPlayingDemo(key);
    const text = key.startsWith('word') ? demo.word : demo.sentence;
    try { await speak(text, key.endsWith('ai'), resolvedSampleLang); }
    finally { if (demoSequence.current === sequence) setPlayingDemo(null); }
  };

  const handleSubscribeBasic = async () => {
    setLoadingPlan('basic');
    try { await onSubscribe(); } finally { setLoadingPlan(null); }
  };

  const handleSubscribePremium = async () => {
    setLoadingPlan('premium');
    try { await (onSubscribePremium ?? onSubscribe)(); } finally { setLoadingPlan(null); }
  };

  if (!visible) return null;

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
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color={pal.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: pal.text }]}>{t('upgrade_plan')}</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Scrollable body — extra bottom padding keeps content clear of the fixed bar */}
        <ScrollView
          ref={mainScrollRef}
          style={s.scroll}
          contentContainerStyle={{ paddingBottom: barHeight + 24 }}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* 1. Hero */}
          <HeroSection pal={pal} t={t} />

          {/* 2. Coffee value — sits directly above the comparison */}
          <CoffeeValueCard t={t} />

          {/* 3. Ribbon — Compare Plans */}
          <RibbonBanner label={t('plan_compare_title')} />

          {/* 4. Plan comparison table */}
          <PlanComparisonTable t={t} pal={pal} />

          {/* 5. What's included */}
          <RibbonBanner label={t('whats_included')} />

          {/* Unlock All Themes — directly below What's Included */}
          <PremiumThemesCarousel
            t={t}
            pal={pal}
            visible={visible}
            detailsOpen={detailsItem !== null}
            onOpenDetails={setDetailsItem}
          />

          <AIVoiceCard demo={demo} playingDemo={playingDemo} onPlay={handlePlayDemo} t={t} pal={pal} />

          {/* AI + plan feature showcases */}
          {FEATURE_SECTIONS.map(f => (
            <FeatureSection
              key={f.key}
              title={f.title ?? (f.titleKey ? t(f.titleKey) : '')}
              description={f.description ?? (f.descKey ? t(f.descKey) : '')}
              note={f.noteKey ? t(f.noteKey) : undefined}
              source={f.image}
              wideImage={f.wideImage}
              accent={f.accent}
              icon={f.icon}
              basic={f.basic}
              premium={f.premium}
              t={t}
            />
          ))}

          {/* App Store subscription disclosure */}
          <View style={s.infoCard}>
            <Text style={[s.infoText, { color: pal.sub }]}>{t('sub_info_payment')}</Text>
            <Text style={[s.infoText, { color: pal.sub, marginTop: 8 }]}>{t('sub_info_manage')}</Text>
          </View>

          {/* Back to top */}
          <TouchableOpacity
            style={s.backToTopWrap}
            onPress={() => mainScrollRef.current?.scrollTo({ y: 0, animated: true })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('back_to_top')}
          >
            <Ionicons name="chevron-up" size={14} color={pal.sub} />
            <Text style={[s.backToTopText, { color: pal.sub }]}>{t('back_to_top')}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Fixed purchase area — two plan buttons */}
        <FixedPurchaseBar
          pal={pal}
          t={t}
          isSubscribed={isSubscribed}
          isPremium={isPremium}
          loadingPlan={loadingPlan}
          bottomInset={insets.bottom}
          onSubscribeBasic={handleSubscribeBasic}
          onSubscribePremium={handleSubscribePremium}
          onRestore={onRestore}
          onManageSubscription={onManageSubscription}
          onMeasure={setBarHeight}
        />

      </Animated.View>

      {/* Theme details overlay — rendered above the sheet */}
      <ThemeDetailsSheet
        item={detailsItem}
        onClose={() => setDetailsItem(null)}
        effectiveSkinId={skinId ?? 'solid_blue'}
        isOwned={isSubscribed}
        isSubscribed={isSubscribed}
        pal={pal}
        themeColor={themeColor}
        onApply={(item) => { if (isSubscribed) onPickSkin?.(item.id); setDetailsItem(null); }}
        onUpgrade={() => setDetailsItem(null)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Hero styles
const hs = StyleSheet.create({
  container: {
    paddingTop: 40,
    paddingBottom: 26,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 320,
  },
  // Soft golden halo behind the icon (two stacked circles for a gradient falloff).
  glowOuter: {
    position: 'absolute',
    top: 128,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: GOLD_MAIN,
    opacity: 0.10,
  },
  glowInner: {
    position: 'absolute',
    top: 150,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: GOLD_LIGHT,
    opacity: 0.16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: `${GOLD_MAIN}88`,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: GOLD_LIGHT,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headline: {
    fontSize: 33,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 41,
    letterSpacing: -0.5,
    marginBottom: 26,
    paddingHorizontal: 10,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  // Metallic gold ring framing the app icon.
  iconRing: {
    padding: 4,
    borderRadius: ICON_RADIUS + 8,
    borderWidth: 1.5,
    borderColor: `${GOLD_MAIN}AA`,
    backgroundColor: 'rgba(255,255,255,0.05)',
    shadowColor: GOLD_DEEP,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  iconClip: {
    width:        ICON_SIZE,
    height:       ICON_SIZE,
    borderRadius: ICON_RADIUS,
    overflow:     'hidden',
  },
  iconImg: {
    width:  ICON_SIZE,
    height: ICON_SIZE,
  },
  divider: {
    width: 56,
    height: 2,
    borderRadius: 1,
    backgroundColor: GOLD_MAIN,
    opacity: 0.65,
    marginTop: 24,
  },
});

// Coffee card styles
const cvs = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE7F7',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: 6,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 3,
  },
  coffeeImageWrap: {
    width: 72,
    height: 62,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coffeeImage: { width: '100%', height: '100%' },
  text: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F2A5E',
    lineHeight: 21,
  },
});

// AI High-Quality Voice card styles — white-based, rich blue accents
const av = StyleSheet.create({
  cardShadow: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 22,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 5,
  },
  card: {
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: '#DCE7F7',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    marginBottom: 20,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: '#0F2A5E', textAlign: 'center', letterSpacing: 0.2, lineHeight: 27 },
  subtitle: { fontSize: 14, color: '#64748B', lineHeight: 20, marginTop: 12 },
  panel: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#F6F9FE',
    borderWidth: 1,
    borderColor: '#E4EDFB',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', marginVertical: 14 },
  row: { gap: 10 },
  sampleText: { fontSize: 15, fontWeight: '600', color: '#1E293B', lineHeight: 22 },
  btnRow: { flexDirection: 'row', gap: 10 },
  defaultBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  defaultLabel: { fontSize: 12, fontWeight: '700', color: '#475569' },
  aiBtnWrap: {
    flex: 1,
    borderRadius: 12,
    shadowColor: PLAN_BLUE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.30,
    shadowRadius: 7,
    elevation: 3,
  },
  aiGlow: {
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 7,
  },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
  },
  aiLabel: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
});

// Premium feature section styles — white card, blue-family accents
const fs = StyleSheet.create({
  cardShadow: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 22,
    // shadowColor set inline per feature accent
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 5,
  },
  card: {
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: '#DCE7F7',
    backgroundColor: '#FFFFFF',
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0F2A5E', textAlign: 'center', letterSpacing: 0.2, lineHeight: 27 },
  desc: { fontSize: 14, color: '#64748B', lineHeight: 20, marginTop: 12 },
  noteText: { marginTop: 7, fontSize: 10.5, lineHeight: 15, color: '#94A3B8' },
  imageShadow: {
    alignSelf: 'center',
    marginTop: 20,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 4,
  },
  imageClip: {
    width: FEAT_IMG_W,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E4EDFB',
    backgroundColor: '#F6F9FE',
  },
  wideImageClip: {
    borderRadius: 16,
  },
  wideImageNoShadow: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  image: { width: '100%', height: '100%' },
  // Icon-based visual (Priority Support, Data Transfer)
  iconVisual: {
    marginTop: 20,
    height: 150,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E4EDFB',
    backgroundColor: '#F6F9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconSparkle: {
    position: 'absolute',
    top: 14,
    right: 16,
  },
});

// Plan-inclusion label chips (Basic / Premium)
const pl = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  basic: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  basicText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  premium: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GOLD_DEEP,
  },
  premiumText: { fontSize: 11, fontWeight: '800', color: HERO_DARK, letterSpacing: 0.2 },
});

// Fixed purchase bar styles — two side-by-side plan buttons
const bar = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnWrapBlue: {
    flex: 1,
    borderRadius: 16,
    shadowColor: PLAN_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  btnWrapGold: {
    flex: 1,
    borderRadius: 16,
    shadowColor: GOLD_DEEP,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50,
    shadowRadius: 11,
    elevation: 6,
  },
  btn: {
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  // Metallic border makes Premium read as the top tier.
  btnGold: {
    borderWidth: 1,
    borderColor: GOLD_DEEP,
  },
  btnTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },
  btnSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    marginTop: 1,
    maxWidth: '100%',
  },
  btnPrice: {
    fontSize: 14,
    lineHeight: 17,
  },
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  restoreText: {
    fontSize: 13,
  },
});

// Main stylesheet
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
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0.2 },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { flex: 1 },

  // ── Ribbon banner ─────────────────────────────────────────────────────────
  ribbonWrap: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  ribbonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  ribbonLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: PLAN_BLUE,
    opacity: 0.25,
    borderRadius: 1,
  },
  ribbon: {
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: HERO_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: HERO_DARK,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
    minWidth: 180,
  },
  ribbonText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },

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
    fontSize: 14,
    textAlign: 'left',
    lineHeight: 20,
    marginTop: 14,
  },

  // ── "Pays for itself" value promo (themes carousel) ─────────────────────────
  themePromo: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BLUE_GRAD[1] + '66',
    paddingVertical: 12,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  themePromoBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    shadowColor: BLUE_GRAD[1],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  themePromoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: -0.1,
    color: BASIC_ACCENT,
  },

  // ── AI Features explanation ─────────────────────────────────────────────────
  aiNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 6,
  },
  aiNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },

  // ── App Store disclosure + back-to-top ──────────────────────────────────────
  infoCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoText: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  backToTopWrap: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backToTopText: {
    fontSize: 12,
    fontWeight: '500',
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
  voiceRow: { flexDirection: 'column', gap: 10 },
  voiceText: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  voiceButtonCol: { flexDirection: 'row', gap: 8 },
  voiceBtn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
  },
  voiceBtnAI: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: PLAN_BLUE,
    gap: 3,
    shadowColor: 'rgba(0,0,0,0.2)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 2,
  },
  voiceBtnLabel:   { fontSize: 9,  fontWeight: '700', letterSpacing: 0.3 },
  voiceBtnAILabel: { fontSize: 9,  fontWeight: '800', letterSpacing: 0.5, color: '#fff' },

});

// ── Plan comparison table styles ──────────────────────────────────────────────
const tbl = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
  },
  featureColHdr: {
    flex: 1.3,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  hdrFeatureText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  planColHdr: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 3,
  },
  basicColHdr: {
    backgroundColor: `${PLAN_BLUE}18`,
  },
  premiumColHdr: {
    backgroundColor: `${GOLD_MAIN}26`,
    borderLeftWidth: 1,
    borderLeftColor: `${GOLD_MAIN}55`,
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
  },
  planPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  // Premium pill — gold with a metallic border so it reads as the top tier.
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_DEEP,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 46,
  },
  featureCell: {
    flex: 1.3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  featureLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  planCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 3,
  },
  basicCell: {
    backgroundColor: `${PLAN_BLUE}10`,
  },
  premiumCell: {
    backgroundColor: `${GOLD_MAIN}1A`,
    borderLeftWidth: 1,
    borderLeftColor: `${GOLD_MAIN}3A`,
  },
  cellValue: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
  },
});

// ── Theme carousel styles ─────────────────────────────────────────────────────
const caro = StyleSheet.create({
  // Outer view carries the shadow (needs no clipping); inner clips + centers media.
  card: {
    width: CARO_W,
    height: CARO_H,
    borderRadius: 18,
    backgroundColor: CARO_MEDIA_BG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  cardInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARO_MEDIA_BG,
  },
  name: {
    width: CARO_W,
    marginTop: 12,
    textAlign: 'left',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
