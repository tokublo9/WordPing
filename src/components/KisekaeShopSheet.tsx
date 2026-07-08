import {
  Animated,
  Dimensions,
  FlatList,
  ImageBackground,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import type { Palette, ThemeSkin } from '../types';
import { useLang } from '../i18n';
import { SKINS } from '../constants';

// Returns true when a hex background color is perceptually very dark (luma < 50).
function isDarkBg(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 < 50;
}

// ── Dimensions ────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const H_PAD  = 20;
const GAP    = 40;
const CARD_W = Math.floor((SCREEN_W - H_PAD * 2 - GAP * 2) / 3);
const THUMB_H = Math.round(CARD_W * 1.3);

// ── Shop data ─────────────────────────────────────────────────────────────────

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  category: 'solid' | 'premium';
  previewBg: string;
  previewAccent: string;
  previewEmoji: string;
}

const SHOP_ITEMS: ShopItem[] = [
  // ── Free (2) — always available without subscription ─────────────────────────
  { id: 'solid_blue',   name: 'Blue',     price: 0, category: 'solid', previewBg: '#EEF3FF', previewAccent: '#2563EB', previewEmoji: '💙' },
  { id: 'solid_gray',   name: 'Gray',     price: 0, category: 'solid', previewBg: '#F3F4F6', previewAccent: '#6B7280', previewEmoji: '🩶' },
  // ── Premium tab — remaining solids interleaved with premium skins ─────────────
  { id: 'skin_deep_sea',  name: 'Deep Sea',       price: 480, category: 'premium', previewBg: '#061628', previewAccent: '#38BDF8', previewEmoji: '🌊' },
  { id: 'solid_sky',    name: 'Sky Blue', price: 0, category: 'solid', previewBg: '#E0F2FE', previewAccent: '#0EA5E9', previewEmoji: '🩵' },
  { id: 'skin_galaxy',    name: 'Galaxy',         price: 480, category: 'premium', previewBg: '#050714', previewAccent: '#818CF8', previewEmoji: '🌌' },
  { id: 'solid_purple', name: 'Purple',   price: 0, category: 'solid', previewBg: '#F5F0FF', previewAccent: '#7C3AED', previewEmoji: '💜' },
  { id: 'skin_aurora',    name: 'Aurora',         price: 480, category: 'premium', previewBg: '#020814', previewAccent: '#00E5A0', previewEmoji: '🌠' },
  { id: 'solid_green',  name: 'Green',    price: 0, category: 'solid', previewBg: '#EDFBF2', previewAccent: '#16A34A', previewEmoji: '💚' },
  { id: 'skin_cyber',     name: 'Cyber Neon',     price: 480, category: 'premium', previewBg: '#040810', previewAccent: '#00E5FF', previewEmoji: '⚡' },
  { id: 'solid_pink',   name: 'Pink',     price: 0, category: 'solid', previewBg: '#FCE7F3', previewAccent: '#EC4899', previewEmoji: '🩷' },
  { id: 'skin_leaf_blur', name: 'Green Nature',   price: 320, category: 'premium', previewBg: '#2D4A2D', previewAccent: '#2E7D5A', previewEmoji: '🌿' },
  { id: 'solid_mint',   name: 'Mint',     price: 0, category: 'solid', previewBg: '#DCFCE7', previewAccent: '#10B981', previewEmoji: '🌱' },
  { id: 'shop_woods',     name: 'Beautiful Woods',price: 320, category: 'premium', previewBg: '#1A2E1A', previewAccent: '#6AAF5A', previewEmoji: '🌲' },
  { id: 'solid_red',    name: 'Red',      price: 0, category: 'solid', previewBg: '#FEE2E2', previewAccent: '#EF4444', previewEmoji: '❤️' },
  { id: 'skin_sakura',    name: 'Sakura',         price: 320, category: 'premium', previewBg: '#FDF4F8', previewAccent: '#F472B6', previewEmoji: '🌸' },
  { id: 'solid_orange', name: 'Orange',   price: 0, category: 'solid', previewBg: '#FFEDD5', previewAccent: '#F97316', previewEmoji: '🧡' },
  { id: 'skin_rain',      name: 'Rainy Window',   price: 320, category: 'premium', previewBg: '#0D1520', previewAccent: '#60A5FA', previewEmoji: '🌧️' },
  { id: 'solid_yellow', name: 'Yellow',   price: 0, category: 'solid', previewBg: '#FEF9C3', previewAccent: '#CA8A04', previewEmoji: '💛' },
  { id: 'skin_snow',      name: 'Snow Mountain',  price: 320, category: 'premium', previewBg: '#F0F6FF', previewAccent: '#60A5FA', previewEmoji: '🏔️' },
  { id: 'solid_beige',  name: 'Beige',    price: 0, category: 'solid', previewBg: '#FAF5EB', previewAccent: '#92400E', previewEmoji: '🤎' },
  { id: 'shop_roses',     name: 'Roses',          price: 320, category: 'premium', previewBg: '#FEF0F5', previewAccent: '#D4627A', previewEmoji: '🌹' },
  { id: 'solid_teal',   name: 'Teal',     price: 0, category: 'solid', previewBg: '#F0FDFA', previewAccent: '#0D9488', previewEmoji: '💎' },
  { id: 'skin_coffee',    name: 'Coffee House',   price: 320, category: 'premium', previewBg: '#FBF6F0', previewAccent: '#92400E', previewEmoji: '☕' },
  { id: 'skin_paw',       name: 'Animal',         price: 320, category: 'premium', previewBg: '#FFF8F0', previewAccent: '#BF7A40', previewEmoji: '🐾' },
  { id: 'skin_night_city', name: 'Night City',    price: 480, category: 'premium', previewBg: '#0A0816', previewAccent: '#F59E0B', previewEmoji: '🌃' },
  { id: 'skin_sunset',    name: 'Sunset',         price: 320, category: 'premium', previewBg: '#FFF3E8', previewAccent: '#F97316', previewEmoji: '🌅' },
];

// ── Tabs ──────────────────────────────────────────────────────────────────────

// Internal keys — language-independent, drive the filter logic
type TabKey = 'free' | 'premium';
const TABS: TabKey[] = ['premium', 'free'];  // Premium LEFT, Free RIGHT

// IDs available on the Free tab (blue + gray)
const FREE_TAB_IDS = new Set(['solid_blue', 'solid_gray']);

// Blur scale: card is smaller than the full screen, so the same BlurView
// intensity covers a proportionally larger area and looks stronger. Scale it
// down so the preview matches the real applied skin appearance.
const PREVIEW_BLUR_SCALE = Math.sqrt(CARD_W / SCREEN_W);

// ── PremiumSkinPreview static data ────────────────────────────────────────────
// Positions expressed as fractions of card W/H; rendered without animation.

// [xFrac, yFrac, sizePx]
const PV_GALAXY_STARS: [number, number, number][] = [
  [0.05,0.04,1.5],[0.14,0.11,1],[0.24,0.07,1.5],[0.36,0.17,1],[0.46,0.05,1.5],
  [0.56,0.13,1],[0.66,0.08,1.5],[0.76,0.19,1],[0.86,0.06,1.5],[0.93,0.14,1],
  [0.10,0.24,1.5],[0.30,0.29,1],[0.50,0.27,1.5],[0.72,0.31,1],[0.89,0.21,1.5],
  [0.08,0.44,1],[0.40,0.54,1],[0.66,0.47,1],
];
const PV_GALAXY_GLOWS: { x: number; y: number; sz: number; color: string }[] = [
  { x: 0.15, y: 0.09, sz: 10, color: '#818CF8' },
  { x: 0.72, y: 0.19, sz: 8,  color: '#C084FC' },
  { x: 0.42, y: 0.34, sz: 7,  color: '#818CF8' },
  { x: 0.86, y: 0.07, sz: 6,  color: '#A5F3FC' },
  { x: 0.56, y: 0.14, sz: 5,  color: '#F0ABFC' },
];

const PV_AURORA_BANDS: { topFrac: number; color: string; op: number; rot: string }[] = [
  { topFrac: 0.05, color: '#00FF9F', op: 0.20, rot: '3deg'  },
  { topFrac: 0.15, color: '#00D4E8', op: 0.16, rot: '-2deg' },
  { topFrac: 0.24, color: '#7B2FBE', op: 0.14, rot: '4deg'  },
  { topFrac: 0.10, color: '#4CC9F0', op: 0.12, rot: '-3deg' },
  { topFrac: 0.20, color: '#C77DFF', op: 0.11, rot: '2deg'  },
];

const PV_CYBER_LINES: { yFrac: number; color: string; op: number }[] = [
  { yFrac: 0.20, color: '#00E5FF', op: 0.28 },
  { yFrac: 0.44, color: '#FF00FF', op: 0.22 },
  { yFrac: 0.64, color: '#00E5FF', op: 0.24 },
  { yFrac: 0.82, color: '#7B00FF', op: 0.20 },
];
const PV_CYBER_DOTS: { x: number; y: number; sz: number; color: string }[] = [
  { x: 0.12, y: 0.17, sz: 3.5, color: '#00E5FF' },
  { x: 0.35, y: 0.41, sz: 2.5, color: '#FF00FF' },
  { x: 0.60, y: 0.27, sz: 4.0, color: '#00E5FF' },
  { x: 0.79, y: 0.61, sz: 2.5, color: '#7B00FF' },
  { x: 0.50, y: 0.73, sz: 3.0, color: '#FF00FF' },
  { x: 0.89, y: 0.34, sz: 2.5, color: '#00E5FF' },
  { x: 0.22, y: 0.57, sz: 3.5, color: '#7B00FF' },
];

const PV_WOODS_RAYS = [0.22, 0.48, 0.70] as const; // xFrac of each ray centre
const PV_WOODS_MOTES: [number, number][] = [
  [0.12,0.62],[0.28,0.50],[0.44,0.72],[0.60,0.40],[0.75,0.66],[0.88,0.55],[0.34,0.80],
];

const PV_RAIN_DROPS: { x: number; y: number; len: number }[] = [
  { x: 0.06, y: 0.10, len: 14 }, { x: 0.20, y: 0.32, len: 11 },
  { x: 0.34, y: 0.58, len: 16 }, { x: 0.48, y: 0.20, len: 12 },
  { x: 0.60, y: 0.50, len: 15 }, { x: 0.73, y: 0.08, len: 11 },
  { x: 0.83, y: 0.38, len: 16 }, { x: 0.91, y: 0.22, len: 12 },
  { x: 0.14, y: 0.70, len: 13 },
];

const PV_PAWS: { x: number; y: number; rot: number; s: number }[] = [
  { x: 0.70, y: 0.70, rot: 12,  s: 0.85 },
  { x: 0.80, y: 0.53, rot: -8,  s: 0.78 },
  { x: 0.72, y: 0.36, rot: 12,  s: 0.85 },
  { x: 0.82, y: 0.20, rot: -8,  s: 0.78 },
];
const PV_PAW_COLOR = 'rgba(141,104,84,0.52)';

// ── PremiumSkinPreview ────────────────────────────────────────────────────────
// Static miniature that mirrors each premium skin's actual in-app appearance.
// Memoized: item and skinData come from module-level constants, so the heavy
// image/blur rendering is skipped on every re-render after initial mount.
const PremiumSkinPreview = memo(function PremiumSkinPreview({ item, skinData }: {
  item: ShopItem;
  skinData: ThemeSkin | undefined;
}) {
  const W = CARD_W;
  const H = THUMB_H;

  // Wallpaper skins: image + blur + overlay — mirrors SkinWallpaperOverlay
  if (skinData?.wallpaperImage) {
    return (
      <>
        <ImageBackground source={skinData.wallpaperImage} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {(skinData.wallpaperBlur ?? 0) > 0 && (
          <BlurView
            intensity={Math.round(skinData.wallpaperBlur! * PREVIEW_BLUR_SCALE)}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}
        {skinData.wallpaperOverlayColor ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: skinData.wallpaperOverlayColor }]} />
        ) : null}
      </>
    );
  }

  // Deep Sea: vertical gradient matching DeepSeaOverlay at scroll=0
  if (item.id === 'skin_deep_sea') {
    return (
      <LinearGradient
        colors={['#1585CC', '#0C5290', '#062A54', '#030F28', '#010610']}
        locations={[0, 0.28, 0.55, 0.78, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    );
  }

  // Galaxy: dark bg + static stars + glow particles
  if (item.id === 'skin_galaxy') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#050714' }]} />
        {PV_GALAXY_GLOWS.map((g, i) => (
          <View key={`g${i}`} style={{
            position: 'absolute', left: g.x * W - g.sz / 2, top: g.y * H - g.sz / 2,
            width: g.sz, height: g.sz, borderRadius: g.sz / 2,
            backgroundColor: g.color, opacity: 0.20,
          }} />
        ))}
        {PV_GALAXY_STARS.map(([x, y, s], i) => (
          <View key={`s${i}`} style={{
            position: 'absolute', left: x * W, top: y * H,
            width: s, height: s, borderRadius: s / 2,
            backgroundColor: '#fff', opacity: 0.70,
          }} />
        ))}
      </>
    );
  }

  // Aurora: dark bg + coloured elliptical bands
  if (item.id === 'skin_aurora') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#07091A' }]} />
        {PV_AURORA_BANDS.map((b, i) => (
          <View key={i} style={{
            position: 'absolute', top: b.topFrac * H, left: -W * 0.25,
            width: W * 1.5, height: H * 0.16, borderRadius: H * 0.08,
            backgroundColor: b.color, opacity: b.op,
            transform: [{ rotate: b.rot }],
          }} />
        ))}
      </>
    );
  }

  // Cyber Neon: dark bg + neon scan-lines + bright particles
  if (item.id === 'skin_cyber') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#040810' }]} />
        {PV_CYBER_LINES.map((l, i) => (
          <View key={`l${i}`} style={{
            position: 'absolute', left: 0, right: 0, top: l.yFrac * H,
            height: 1, backgroundColor: l.color, opacity: l.op,
          }} />
        ))}
        {PV_CYBER_DOTS.map((d, i) => (
          <View key={`d${i}`} style={{
            position: 'absolute', left: d.x * W, top: d.y * H,
            width: d.sz, height: d.sz, borderRadius: d.sz / 2,
            backgroundColor: d.color, opacity: 0.80,
          }} />
        ))}
      </>
    );
  }

  // Beautiful Woods: dark green bg + light rays + dust motes
  if (item.id === 'shop_woods') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0E1A0E' }]} />
        {PV_WOODS_RAYS.map((xFrac, i) => (
          <View key={i} style={{
            position: 'absolute', left: xFrac * W - 22, top: -H * 0.12,
            width: 44, height: H * 1.35, backgroundColor: '#FFE090',
            opacity: 0.06, transform: [{ rotate: '14deg' }],
          }} />
        ))}
        {PV_WOODS_MOTES.map(([x, y], i) => (
          <View key={`m${i}`} style={{
            position: 'absolute', left: x * W, top: y * H,
            width: 2, height: 2, borderRadius: 1,
            backgroundColor: '#E8D5B0', opacity: 0.15,
          }} />
        ))}
      </>
    );
  }

  // Rainy Window: dark blue bg + thin diagonal raindrops
  if (item.id === 'skin_rain') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0D1520' }]} />
        {PV_RAIN_DROPS.map((d, i) => (
          <View key={i} style={{
            position: 'absolute', left: d.x * W, top: d.y * H,
            width: 1.5, height: d.len, borderRadius: 1,
            backgroundColor: '#B0D4F0', opacity: 0.28,
            transform: [{ rotate: '9deg' }],
          }} />
        ))}
      </>
    );
  }

  // Animal: warm bg + paw prints along right side
  if (item.id === 'skin_paw') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFF8F0' }]} />
        {PV_PAWS.map(({ x, y, rot, s }, i) => (
          <View key={i} style={{
            position: 'absolute', left: x * W, top: y * H,
            transform: [{ rotate: `${rot}deg` }],
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 * s, marginBottom: 1.5 * s, justifyContent: 'center' }}>
              <View style={{ width: 4.5 * s, height: 4.5 * s, borderRadius: 2.5 * s, backgroundColor: PV_PAW_COLOR, marginBottom: 1.5 * s }} />
              <View style={{ width: 5 * s, height: 5.5 * s, borderRadius: 2.5 * s, backgroundColor: PV_PAW_COLOR }} />
              <View style={{ width: 5 * s, height: 5.5 * s, borderRadius: 2.5 * s, backgroundColor: PV_PAW_COLOR }} />
              <View style={{ width: 4.5 * s, height: 4.5 * s, borderRadius: 2.5 * s, backgroundColor: PV_PAW_COLOR, marginBottom: 1.5 * s }} />
            </View>
            <View style={{ width: 13 * s, height: 10 * s, borderRadius: 6.5 * s, backgroundColor: PV_PAW_COLOR, alignSelf: 'center' }} />
          </View>
        ))}
      </>
    );
  }

  // Fallback: solid palette bg
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: skinData?.palette.bg ?? item.previewBg }]} />;
});

// ── SkinCard ──────────────────────────────────────────────────────────────────

const SkinCard = memo(function SkinCard({
  item, isSelected, isOwned, isSubscribed, onPress, themeColor, pal,
}: {
  item: ShopItem;
  isSelected: boolean;
  isOwned: boolean;
  isSubscribed: boolean;
  onPress: () => void;
  themeColor: string;
  pal: Palette;
}) {
  const t = useLang();

  // Show "Using" when active, nothing for subscribers, price for purchasable skins.
  const statusLabel: string =
    isSelected                    ? t('shop_using')
    : isSubscribed                ? ''
    : (isOwned && item.price > 0) ? t('shop_owned')
    : item.price > 0              ? `¥${item.price}`
    :                               '';

  const statusColor =
    isSelected ? themeColor
    : isOwned  ? '#22C55E'
    :            '#EF4444';

  // Stable reference: item.id never changes (comes from the module-level constant).
  const skinData = useMemo(() => SKINS.find(s => s.id === item.id), [item.id]);

  // Accent border for very dark non-wallpaper premium skins so they read clearly.
  const bgForDarkCheck = item.category === 'solid' ? item.previewBg : (skinData?.palette.bg ?? '#fff');
  const isDark = !skinData?.wallpaperImage && isDarkBg(bgForDarkCheck);

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W }]} onPress={onPress} activeOpacity={0.8}>
      <View
        style={[
          styles.thumb,
          { width: CARD_W, height: THUMB_H },
          item.category === 'solid' && !isSelected && { borderColor: item.previewAccent + '40', borderWidth: 1 },
          isDark && !isSelected && { borderColor: item.previewAccent + '70', borderWidth: 1 },
          isSelected && { borderColor: themeColor, borderWidth: 2.5 },
        ]}
      >
        {item.category === 'premium' ? (
          <PremiumSkinPreview item={item} skinData={skinData} />
        ) : (
          <>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: item.previewBg }]} />
            <View style={[StyleSheet.absoluteFill, styles.wordPingCenter]}>
              <Text style={[styles.cardWordPing, { color: item.previewAccent }]}>WordPing</Text>
            </View>
          </>
        )}
        {isSelected && (
          <View style={[styles.selectedBadge, { backgroundColor: themeColor }]}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[styles.cardName, { color: pal.text }]} numberOfLines={1}>{item.name}</Text>
      {statusLabel ? (
        <Text style={[styles.cardPrice, { color: statusColor }]}>{statusLabel}</Text>
      ) : (
        <Text style={styles.cardPrice}>{' '}</Text>
      )}
    </TouchableOpacity>
  );
});

// ── ShopTabs ──────────────────────────────────────────────────────────────────

function ShopTabs({
  active, onSwitch, themeColor, pal,
}: {
  active: TabKey;
  onSwitch: (tab: TabKey) => void;
  themeColor: string;
  pal: Palette;
}) {
  const t = useLang();
  // Initialise at the correct slot so there is no jump on first render.
  const indicatorX = useRef(new Animated.Value(TABS.indexOf(active))).current;
  const tabW = (SCREEN_W - H_PAD * 2) / TABS.length;

  const tabLabel = (tab: TabKey) =>
    tab === 'free' ? t('shop_tab_free') : t('shop_tab_premium');

  // Single source of truth: drive the indicator whenever `active` changes,
  // whether from a user tap or from the parent's useEffect sync on open.
  useEffect(() => {
    Animated.timing(indicatorX, {
      toValue: TABS.indexOf(active),
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [active]);

  const left = indicatorX.interpolate({ inputRange: [0, 1], outputRange: [0, tabW] });

  return (
    <View style={[styles.tabBar, { borderBottomColor: pal.border }]}>
      {TABS.map(tab => (
        // Call onSwitch directly — animation is handled by the useEffect above.
        <TouchableOpacity key={tab} style={styles.tabBtn} onPress={() => onSwitch(tab)} activeOpacity={0.7}>
          <Text style={[styles.tabLabel, {
            color: active === tab ? pal.text : pal.sub,
            fontWeight: active === tab ? '700' : '400',
          }]}>
            {tabLabel(tab)}
          </Text>
        </TouchableOpacity>
      ))}
      <Animated.View style={[styles.tabIndicator, { width: tabW, left, backgroundColor: themeColor }]} />
    </View>
  );
}

// ── KisekaeShopSheet ──────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  skinId: string | null;
  onPickSkin: (id: string | null) => void;
  isSubscribed: boolean;
  pal: Palette;
  themeColor: string;
  onUpgrade?: () => void;
}

export function KisekaeShopSheet({
  visible, onClose, skinId, onPickSkin, isSubscribed, pal, themeColor, onUpgrade,
}: Props) {
  const insets  = useSafeAreaInsets();
  const t       = useLang();
  const slideY  = useRef(new Animated.Value(SCREEN_H)).current;

  const [activeTab, setActiveTab] = useState<TabKey>('premium');
  const [search,    setSearch]    = useState('');
  const [ownedIds,  setOwnedIds]  = useState<Set<string>>(new Set<string>());

  useEffect(() => {
    if (visible) {
      // Sync active tab: free skins go to 'free', everything else to 'premium'.
      setActiveTab(skinId && FREE_TAB_IDS.has(skinId) ? 'free' : 'premium');

      slideY.setValue(SCREEN_H);
      Animated.spring(slideY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    Animated.timing(slideY, { toValue: SCREEN_H, duration: 240, useNativeDriver: true })
      .start(() => onClose());
  }, [onClose]);

  const isOwned = useCallback((item: ShopItem): boolean => {
    // solid_blue and solid_gray are always free; all other skins require a subscription.
    if (item.id === 'solid_blue' || item.id === 'solid_gray') return true;
    if (!isSubscribed) return false;
    return item.price === 0 || ownedIds.has(item.id);
  }, [ownedIds, isSubscribed]);

  const handleTap = useCallback((item: ShopItem) => {
    if (skinId === item.id) {
      onPickSkin(null);
      return;
    }
    if (isOwned(item)) {
      const exists = SKINS.some(s => s.id === item.id);
      onPickSkin(exists ? item.id : null);
    } else if (!isSubscribed && item.category === 'solid') {
      // Free user tapping a locked solid color — show subscription upsell.
      onUpgrade?.();
    } else {
      // Premium skin: grant via in-app purchase coins.
      setOwnedIds(prev => new Set([...prev, item.id]));
    }
  }, [skinId, onPickSkin, isOwned, isSubscribed, onUpgrade]);

  const filtered = useMemo(
    () => SHOP_ITEMS.filter(item =>
      (activeTab === 'free' ? FREE_TAB_IDS.has(item.id) : !FREE_TAB_IDS.has(item.id)) &&
      item.name.toLowerCase().includes(search.toLowerCase()),
    ),
    [activeTab, search],
  );

  const renderItem = useCallback(({ item }: { item: ShopItem }) => (
    <SkinCard
      item={item}
      isSelected={skinId === item.id}
      isOwned={isOwned(item)}
      isSubscribed={isSubscribed}
      onPress={() => handleTap(item)}
      themeColor={themeColor}
      pal={pal}
    />
  ), [skinId, isOwned, isSubscribed, handleTap, themeColor, pal]);

  // Keep mounted even when hidden so wallpaper images stay in memory.
  // Pointer events are blocked and the sheet is off-screen when !visible.
  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[StyleSheet.absoluteFillObject, { backgroundColor: pal.bg, transform: [{ translateY: slideY }] }]}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={pal.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: pal.text }]}>{t('kisekae_title')}</Text>
        <View style={styles.closeBtn} />
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrap, { backgroundColor: pal.chip }]}>
        <Ionicons name="search-outline" size={16} color={pal.sub} />
        <TextInput
          style={[styles.searchInput, { color: pal.text }]}
          placeholder={t('shop_search_placeholder')}
          placeholderTextColor={pal.sub}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Tabs — Solid (left) | Premium (right) */}
      <ShopTabs active={activeTab} onSwitch={setActiveTab} themeColor={themeColor} pal={pal} />

      {/* Product grid */}
      <FlatList
        key={activeTab}
        data={filtered}
        numColumns={3}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 32 }]}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: pal.sub }]}>{t('shop_no_items')}</Text>
          </View>
        }
      />
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: H_PAD, paddingBottom: 12,
  },
  closeBtn: { width: 36, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: H_PAD, marginBottom: 12,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

  tabBar: {
    flexDirection: 'row', position: 'relative',
    marginHorizontal: H_PAD, marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn:       { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabLabel:     { fontSize: 14 },
  tabIndicator: {
    position: 'absolute', bottom: -StyleSheet.hairlineWidth,
    height: 2, borderRadius: 1,
  },

  grid:    { paddingHorizontal: H_PAD, paddingTop: 4 },
  gridRow: { gap: GAP, marginBottom: 24 },

  card:  { alignItems: 'center' },
  thumb: {
    borderRadius: 12, borderWidth: 0,
    marginBottom: 6, overflow: 'hidden',
  },
  selectedBadge: {
    position: 'absolute', top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  wordPingCenter: { alignItems: 'center', justifyContent: 'center' },
  cardWordPing:   { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  cardName:       { fontSize: 11, fontWeight: '600', marginBottom: 2, textAlign: 'center' },
  cardPrice:      { fontSize: 11, fontWeight: '500', textAlign: 'center' },

  empty:     { paddingVertical: 60, alignItems: 'center' },
  emptyText: { fontSize: 14 },
});
