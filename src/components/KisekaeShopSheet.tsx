import {
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Palette } from '../types';
import { useLang } from '../i18n';
import { SKINS } from '../constants';
import { formatPrice } from '../lib/pricing';
import { type ShopItem, PremiumSkinPreview } from './ThemeSkinPreview';
import { ThemeDetailsSheet } from './ThemeDetailsSheet';

// All bundled wallpaper images used by the shop preview cards. Preloaded once so
// every card is ready to display the moment the shop opens (no pop-in on scroll).
const SHOP_PRELOAD_ASSETS: number[] = SKINS
  .map(s => s.wallpaperImage)
  .filter((m): m is number => typeof m === 'number');

// Shop cards whose preview should show the wallpaper image with no blur overlay.
const SHOP_NO_BLUR_IDS = new Set<string>([
  'skin_sakura',      // Sakura
  'skin_leaf_blur',   // Green Nature
  'shop_roses',       // Roses
  'skin_snow',        // Snow Mountain
  'skin_night_city',  // Night City
  'skin_sunset',      // Sunset
]);

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
const THUMB_RADIUS = 12;

// ── Shop data (ShopItem type lives in ThemeSkinPreview.tsx) ──────────────────

export const SHOP_ITEMS: ShopItem[] = [
  // ── Free (2) — always available without subscription ─────────────────────────
  { id: 'solid_blue',   name: 'Blue',  price: 0, category: 'solid', previewBg: '#EEF3FF', previewAccent: '#2563EB', previewEmoji: '💙' },
  { id: 'solid_gray',   name: 'Gray',  price: 0, category: 'solid', previewBg: '#F3F4F6', previewAccent: '#6B7280', previewEmoji: '🩶' },
  // ── Paid themes (24) — order is fixed as defined below ───────────────────────
  { id: 'skin_aurora',     name: 'Aurora',          price: 480, category: 'premium', previewBg: '#020814', previewAccent: '#00E5A0', previewEmoji: '🌠' },
  { id: 'skin_sakura',     name: 'Sakura',          price: 320, category: 'premium', previewBg: '#FDF4F8', previewAccent: '#F472B6', previewEmoji: '🌸' },
  { id: 'solid_teal',      name: 'Teal',            price: 320, category: 'solid',   previewBg: '#F0FDFA', previewAccent: '#0D9488', previewEmoji: '💎' },
  { id: 'solid_pink',      name: 'Pink',            price: 320, category: 'solid',   previewBg: '#FCE7F3', previewAccent: '#EC4899', previewEmoji: '🩷' },
  { id: 'skin_galaxy',     name: 'Galaxy',          price: 480, category: 'premium', previewBg: '#050714', previewAccent: '#818CF8', previewEmoji: '🌌' },
  { id: 'solid_yellow',    name: 'Yellow',          price: 320, category: 'solid',   previewBg: '#FEF9C3', previewAccent: '#CA8A04', previewEmoji: '💛' },
  { id: 'skin_leaf_blur',  name: 'Green Nature',    price: 320, category: 'premium', previewBg: '#2D4A2D', previewAccent: '#2E7D5A', previewEmoji: '🌿' },
  { id: 'shop_roses',      name: 'Roses',           price: 320, category: 'premium', previewBg: '#FEF0F5', previewAccent: '#D4627A', previewEmoji: '🌹' },
  { id: 'skin_snow',       name: 'Snow Mountain',   price: 320, category: 'premium', previewBg: '#F0F6FF', previewAccent: '#60A5FA', previewEmoji: '🏔️' },
  { id: 'solid_purple',    name: 'Purple',          price: 320, category: 'solid',   previewBg: '#F5F0FF', previewAccent: '#7C3AED', previewEmoji: '💜' },
  { id: 'solid_orange',    name: 'Orange',          price: 320, category: 'solid',   previewBg: '#FFEDD5', previewAccent: '#F97316', previewEmoji: '🧡' },
  { id: 'skin_deep_sea',   name: 'Deep Sea',        price: 480, category: 'premium', previewBg: '#061628', previewAccent: '#38BDF8', previewEmoji: '🌊' },
  { id: 'solid_beige',     name: 'Beige',           price: 320, category: 'solid',   previewBg: '#FAF5EB', previewAccent: '#92400E', previewEmoji: '🤎' },
  { id: 'skin_cyber',      name: 'Cyber Neon',      price: 480, category: 'premium', previewBg: '#040810', previewAccent: '#00E5FF', previewEmoji: '⚡' },
  { id: 'skin_coffee',     name: 'Coffee House',    price: 320, category: 'premium', previewBg: '#FBF6F0', previewAccent: '#92400E', previewEmoji: '☕' },
  { id: 'solid_sky',       name: 'Sky Blue',        price: 320, category: 'solid',   previewBg: '#E0F2FE', previewAccent: '#0EA5E9', previewEmoji: '🩵' },
  { id: 'skin_paw',        name: 'Animal',          price: 320, category: 'premium', previewBg: '#FFF8F0', previewAccent: '#BF7A40', previewEmoji: '🐾' },
  { id: 'shop_woods',      name: 'Beautiful Woods', price: 320, category: 'premium', previewBg: '#1A2E1A', previewAccent: '#6AAF5A', previewEmoji: '🌲' },
  { id: 'solid_red',       name: 'Red',             price: 320, category: 'solid',   previewBg: '#FEE2E2', previewAccent: '#EF4444', previewEmoji: '❤️' },
  { id: 'skin_night_city', name: 'Night City',      price: 480, category: 'premium', previewBg: '#0A0816', previewAccent: '#F59E0B', previewEmoji: '🌃' },
  { id: 'solid_mint',      name: 'Mint',            price: 320, category: 'solid',   previewBg: '#DCFCE7', previewAccent: '#10B981', previewEmoji: '🌱' },
  { id: 'skin_rain',       name: 'Rainy Window',    price: 320, category: 'premium', previewBg: '#0D1520', previewAccent: '#60A5FA', previewEmoji: '🌧️' },
  { id: 'solid_green',     name: 'Green',           price: 320, category: 'solid',   previewBg: '#EDFBF2', previewAccent: '#16A34A', previewEmoji: '💚' },
  { id: 'skin_sunset',     name: 'Sunset',          price: 320, category: 'premium', previewBg: '#FFF3E8', previewAccent: '#F97316', previewEmoji: '🌅' },
];

// ── Tabs ──────────────────────────────────────────────────────────────────────

// Internal keys — language-independent, drive the filter logic
type TabKey = 'free' | 'premium';
const TABS: TabKey[] = ['premium', 'free'];  // Premium LEFT, Free RIGHT

// IDs available on the Free tab (blue + gray)
const FREE_TAB_IDS = new Set(['solid_blue', 'solid_gray']);

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
    : item.price > 0              ? formatPrice(item.price)
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

  // Every card (solid + premium) gets a subtle border in its own accent color.
  const borderColor =
    isSelected ? themeColor
    : isDark   ? item.previewAccent + '70'
    :            item.previewAccent + '40';
  const borderWidth = isSelected ? 2.5 : 1;

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W }]} onPress={onPress} activeOpacity={0.8}>
      {/* Border lives on the outer view (no clipping) so it follows the rounded
          corners continuously; the media is clipped by the inner view. */}
      <View style={[styles.thumb, { width: CARD_W, height: THUMB_H, borderColor, borderWidth }]}>
        <View style={[styles.thumbClip, { borderRadius: THUMB_RADIUS - borderWidth }]}>
          {item.category === 'premium' ? (
            <PremiumSkinPreview item={item} skinData={skinData} width={CARD_W} height={THUMB_H} disableBlur={SHOP_NO_BLUR_IDS.has(item.id)} />
          ) : (
            <>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: item.previewBg }]} />
              <View style={[StyleSheet.absoluteFill, styles.wordPingCenter]}>
                <Text style={[styles.cardWordPing, { color: item.previewAccent }]}>WordPing</Text>
              </View>
            </>
          )}
        </View>
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

  const [activeTab,    setActiveTab]    = useState<TabKey>('premium');
  const [search,       setSearch]       = useState('');
  const [ownedIds,     setOwnedIds]     = useState<Set<string>>(new Set<string>());
  const [kbHeight,     setKbHeight]     = useState(0);
  const [detailsItem,  setDetailsItem]  = useState<ShopItem | null>(null);
  const [openCount,    setOpenCount]    = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, e => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Preload every wallpaper image into the asset cache once, so the shop grid
  // renders instantly with no delayed image loading when it opens.
  useEffect(() => {
    Asset.loadAsync(SHOP_PRELOAD_ASSETS).catch(() => {});
  }, []);

  useEffect(() => {
    if (visible) {
      // Always open on the Popular tab and reset scroll position to the top.
      setActiveTab('premium');
      setOpenCount(c => c + 1);

      slideY.setValue(SCREEN_H);
      Animated.spring(slideY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    Animated.timing(slideY, { toValue: SCREEN_H, duration: 240, useNativeDriver: true })
      .start(() => onClose());
  }, [onClose]);

  const isOwned = useCallback((item: ShopItem): boolean => {
    if (FREE_TAB_IDS.has(item.id)) return true;  // solid_blue / solid_gray: always free
    if (!isSubscribed) return false;               // non-subscribers own nothing else
    return true;                                   // Basic subscribers own everything
  }, [isSubscribed]);

  // solid_blue is the baseline: when no skin is explicitly picked it is still active.
  const effectiveSkinId = skinId ?? 'solid_blue';

  const handleTap = useCallback((item: ShopItem) => {
    // Already active — do nothing (prevent clearing to an empty/no-theme state).
    if (effectiveSkinId === item.id) return;
    if (isOwned(item)) {
      const exists = SKINS.some(s => s.id === item.id);
      onPickSkin(exists ? item.id : null);
    } else {
      // Locked themes are purchased individually with coins.
      setOwnedIds(prev => new Set([...prev, item.id]));
    }
  }, [effectiveSkinId, onPickSkin, isOwned]);

  const filtered = useMemo(
    () => SHOP_ITEMS
      .filter(i => activeTab === 'free' ? FREE_TAB_IDS.has(i.id) : !FREE_TAB_IDS.has(i.id))
      .filter(i => i.name.toLowerCase().includes(search.toLowerCase())),
    [activeTab, search],
  );

  const renderItem = useCallback(({ item }: { item: ShopItem }) => (
    <SkinCard
      item={item}
      isSelected={effectiveSkinId === item.id}
      isOwned={isOwned(item)}
      isSubscribed={isSubscribed}
      onPress={() => setDetailsItem(item)}
      themeColor={themeColor}
      pal={pal}
    />
  ), [effectiveSkinId, isOwned, isSubscribed, themeColor, pal]);

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
        key={`${activeTab}-${openCount}`}
        data={filtered}
        numColumns={3}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 32 }]}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        // Render the whole grid at once and keep every card mounted so there is
        // no delayed rendering or image pop-in while scrolling.
        initialNumToRender={filtered.length || 1}
        maxToRenderPerBatch={filtered.length || 1}
        windowSize={Math.max(11, filtered.length)}
        removeClippedSubviews={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: pal.sub }]}>{t('shop_no_items')}</Text>
          </View>
        }
      />

      {/* Keyboard toolbar — same pattern as Add/Edit Word screens */}
      {kbHeight > 0 && (
        <View style={[styles.kbToolbar, { bottom: kbHeight }]}>
          <TouchableOpacity
            onPress={Keyboard.dismiss}
            style={[styles.kbBtn, { backgroundColor: themeColor }]}
          >
            <Text style={[styles.kbBtnText, { color: '#fff' }]}>{t('save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={Keyboard.dismiss}
            style={[styles.kbBtn, { backgroundColor: pal.chip }]}
          >
            <Ionicons name="chevron-down" size={16} color={pal.sub} />
          </TouchableOpacity>
        </View>
      )}

      {/* Theme Details — slides in from right over the shop */}
      <ThemeDetailsSheet
        item={detailsItem}
        onClose={() => setDetailsItem(null)}
        effectiveSkinId={effectiveSkinId}
        isOwned={detailsItem ? isOwned(detailsItem) : false}
        isSubscribed={isSubscribed}
        pal={pal}
        themeColor={themeColor}
        onApply={handleTap}
        onUpgrade={() => onUpgrade?.()}
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
    borderRadius: THUMB_RADIUS, borderWidth: 0,
    marginBottom: 6,
  },
  thumbClip: { flex: 1, overflow: 'hidden' },
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

  kbToolbar: {
    position: 'absolute', left: 0, right: 0, height: 52,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 14,
  },
  kbBtn: {
    paddingVertical: 7, paddingHorizontal: 18, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', minWidth: 40, height: 36,
    shadowColor: '#000', shadowOpacity: 0.20, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  kbBtnText: { fontSize: 15, fontWeight: '700' },
});
