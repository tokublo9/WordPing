import {
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';

import type { Palette } from '../types';
import { useLang } from '../i18n';
import { SKINS } from '../constants';

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
  // ── Solid (12) ───────────────────────────────────────────────────────────────
  { id: 'solid_blue',   name: 'Blue',     price: 0, category: 'solid', previewBg: '#EEF3FF', previewAccent: '#2563EB', previewEmoji: '💙' },
  { id: 'solid_sky',    name: 'Sky Blue', price: 0, category: 'solid', previewBg: '#E0F2FE', previewAccent: '#0EA5E9', previewEmoji: '🩵' },
  { id: 'solid_green',  name: 'Green',    price: 0, category: 'solid', previewBg: '#EDFBF2', previewAccent: '#16A34A', previewEmoji: '💚' },
  { id: 'solid_mint',   name: 'Mint',     price: 0, category: 'solid', previewBg: '#DCFCE7', previewAccent: '#10B981', previewEmoji: '🌱' },
  { id: 'solid_purple', name: 'Purple',   price: 0, category: 'solid', previewBg: '#F5F0FF', previewAccent: '#7C3AED', previewEmoji: '💜' },
  { id: 'solid_pink',   name: 'Pink',     price: 0, category: 'solid', previewBg: '#FCE7F3', previewAccent: '#EC4899', previewEmoji: '🩷' },
  { id: 'solid_red',    name: 'Red',      price: 0, category: 'solid', previewBg: '#FEE2E2', previewAccent: '#EF4444', previewEmoji: '❤️' },
  { id: 'solid_orange', name: 'Orange',   price: 0, category: 'solid', previewBg: '#FFEDD5', previewAccent: '#F97316', previewEmoji: '🧡' },
  { id: 'solid_yellow', name: 'Yellow',   price: 0, category: 'solid', previewBg: '#FEF9C3', previewAccent: '#CA8A04', previewEmoji: '💛' },
  { id: 'solid_beige',  name: 'Beige',    price: 0, category: 'solid', previewBg: '#FAF5EB', previewAccent: '#92400E', previewEmoji: '🤎' },
  { id: 'solid_gray',   name: 'Gray',     price: 0, category: 'solid', previewBg: '#F3F4F6', previewAccent: '#6B7280', previewEmoji: '🩶' },
  { id: 'solid_black',  name: 'Black',    price: 0, category: 'solid', previewBg: '#0A0A0A', previewAccent: '#E2E8F0', previewEmoji: '🖤' },
  // ── Premium (12) ─────────────────────────────────────────────────────────────
  { id: 'skin_deep_sea',  name: 'Deep Sea',       price: 480, category: 'premium', previewBg: '#061628', previewAccent: '#38BDF8', previewEmoji: '🌊' },
  { id: 'skin_leaf_blur', name: 'Green Nature',   price: 320, category: 'premium', previewBg: '#2D4A2D', previewAccent: '#2E7D5A', previewEmoji: '🌿' },
  { id: 'shop_woods',     name: 'Beautiful Woods',price: 320, category: 'premium', previewBg: '#1A2E1A', previewAccent: '#6AAF5A', previewEmoji: '🌲' },
  { id: 'shop_roses',     name: 'Roses',          price: 320, category: 'premium', previewBg: '#FEF0F5', previewAccent: '#D4627A', previewEmoji: '🌹' },
  { id: 'skin_sunset',    name: 'Sunset',         price: 320, category: 'premium', previewBg: '#FFF3E8', previewAccent: '#F97316', previewEmoji: '🌅' },
  { id: 'skin_sakura',    name: 'Sakura',         price: 320, category: 'premium', previewBg: '#FDF4F8', previewAccent: '#F472B6', previewEmoji: '🌸' },
  { id: 'skin_galaxy',    name: 'Galaxy',         price: 480, category: 'premium', previewBg: '#050714', previewAccent: '#818CF8', previewEmoji: '🌌' },
  { id: 'skin_snow',      name: 'Snow Mountain',  price: 320, category: 'premium', previewBg: '#F0F6FF', previewAccent: '#60A5FA', previewEmoji: '🏔️' },
  { id: 'skin_cyber',     name: 'Cyber Neon',     price: 480, category: 'premium', previewBg: '#040810', previewAccent: '#00E5FF', previewEmoji: '⚡' },
  { id: 'skin_coffee',    name: 'Coffee House',   price: 320, category: 'premium', previewBg: '#FBF6F0', previewAccent: '#92400E', previewEmoji: '☕' },
  { id: 'skin_aurora',    name: 'Aurora',         price: 480, category: 'premium', previewBg: '#020814', previewAccent: '#00E5A0', previewEmoji: '🌠' },
  { id: 'skin_rain',      name: 'Rainy Window',   price: 320, category: 'premium', previewBg: '#0D1520', previewAccent: '#60A5FA', previewEmoji: '🌧️' },
];

// ── Tabs ──────────────────────────────────────────────────────────────────────

// Internal keys — language-independent, drive the filter logic
type TabKey = 'solid' | 'premium';
const TABS: TabKey[] = ['premium', 'solid'];  // Premium LEFT, Solid RIGHT

// ── SkinCard ──────────────────────────────────────────────────────────────────

function SkinCard({
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

  // Basic plan users have all themes available — no price labels; only show "Using".
  // Free plan users see price labels.
  const statusLabel: string =
    isSelected                          ? t('shop_using')
    : isSubscribed                      ? ''
    : isOwned                           ? t('shop_owned')
    : item.price === 0                  ? t('shop_free')
    :                                     `¥${item.price}`;

  const statusColor =
    isSelected       ? themeColor
    : isOwned        ? '#22C55E'
    : item.price === 0 ? pal.sub
    : '#EF4444';

  const thumbBg = item.category === 'solid' ? item.previewBg : pal.chip;

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W }]} onPress={onPress} activeOpacity={0.8}>
      <View
        style={[
          styles.thumb,
          { backgroundColor: thumbBg, width: CARD_W, height: THUMB_H },
          item.category === 'solid' && !isSelected && { borderColor: item.previewAccent + '55', borderWidth: 1 },
          isSelected && { borderColor: themeColor, borderWidth: 2.5 },
        ]}
      >
        {item.category === 'premium' && (
          <View style={[styles.miniCard, { backgroundColor: item.previewAccent + '28', borderColor: item.previewAccent + '55' }]}>
            <Text style={styles.miniEmoji}>{item.previewEmoji}</Text>
          </View>
        )}
        {item.category === 'solid' && (
          <Text style={[styles.cardWordPing, { color: item.previewAccent }]}>WordPing</Text>
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
}

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
    tab === 'solid' ? t('shop_tab_solid') : t('shop_tab_premium');

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
}

export function KisekaeShopSheet({
  visible, onClose, skinId, onPickSkin, isSubscribed, pal, themeColor,
}: Props) {
  const insets  = useSafeAreaInsets();
  const t       = useLang();
  const slideY  = useRef(new Animated.Value(SCREEN_H)).current;

  const [activeTab, setActiveTab] = useState<TabKey>('premium');
  const [search,    setSearch]    = useState('');
  const [ownedIds,  setOwnedIds]  = useState<Set<string>>(new Set<string>());

  useEffect(() => {
    if (visible) {
      // Sync active tab to whichever category the current skin belongs to.
      const selectedItem = SHOP_ITEMS.find(item => item.id === skinId);
      setActiveTab(selectedItem ? selectedItem.category : 'premium');

      slideY.setValue(SCREEN_H);
      Animated.spring(slideY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideY, { toValue: SCREEN_H, duration: 240, useNativeDriver: true })
      .start(() => onClose());
  };

  const isOwned = (item: ShopItem): boolean =>
    item.price === 0 || ownedIds.has(item.id) || (isSubscribed && ownedIds.has(item.id));

  const handleTap = (item: ShopItem) => {
    if (skinId === item.id) {
      onPickSkin(null);
      return;
    }
    if (isOwned(item)) {
      const exists = SKINS.some(s => s.id === item.id);
      onPickSkin(exists ? item.id : null);
    } else {
      setOwnedIds(prev => new Set([...prev, item.id]));
    }
  };

  const filtered = SHOP_ITEMS.filter(
    item =>
      item.category === activeTab &&
      item.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (!visible) return null;

  return (
    <Animated.View
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
        renderItem={({ item }) => (
          <SkinCard
            item={item}
            isSelected={skinId === item.id}
            isOwned={isOwned(item)}
            isSubscribed={isSubscribed}
            onPress={() => handleTap(item)}
            themeColor={themeColor}
            pal={pal}
          />
        )}
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
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, overflow: 'hidden',
  },
  miniCard: {
    width: '55%', aspectRatio: 1,
    borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  miniEmoji: { fontSize: 22 },
  selectedBadge: {
    position: 'absolute', top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  cardName:     { fontSize: 11, fontWeight: '600', marginBottom: 2, textAlign: 'center' },
  cardPrice:    { fontSize: 11, fontWeight: '500', textAlign: 'center' },
  cardWordPing: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },

  empty:     { paddingVertical: 60, alignItems: 'center' },
  emptyText: { fontSize: 14 },
});
