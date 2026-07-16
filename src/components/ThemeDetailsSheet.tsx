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
import { memo, useCallback, useEffect, useRef } from 'react';

import type { Palette, ThemeSkin } from '../types';
import { type TranslationKey, useLang } from '../i18n';
import { SKINS } from '../constants';
import { type ShopItem, PremiumSkinPreview } from './ThemeSkinPreview';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const H_PAD = 20;

// Hero preview card dimensions (left column of hero row)
const HERO_CARD_W = Math.round((SCREEN_W - H_PAD * 2) * 0.42);
const HERO_CARD_H = Math.round(HERO_CARD_W * 1.3);

// Gallery mini-screen dimensions
const MINI_W = 88;
const MINI_H = Math.round(MINI_W * 1.78); // ~9:16 portrait

// Returns true when a hex color is perceptually very dark (luma < 50)
function isDarkBg(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 < 50;
}

// ── Feature tag meta ──────────────────────────────────────────────────────────

const TAG_META: Record<string, { emoji: string; labelKey: TranslationKey }> = {
  wallpaper: { emoji: '🖼️', labelKey: 'tag_wallpaper' },
  blur:      { emoji: '✨', labelKey: 'tag_blur' },
  animated:  { emoji: '💫', labelKey: 'tag_animated' },
  dark_bg:   { emoji: '🌙', labelKey: 'tag_dark_bg' },
  bright:    { emoji: '☀️', labelKey: 'tag_bright' },
  cozy:      { emoji: '🍵', labelKey: 'tag_cozy' },
  nature:    { emoji: '🌿', labelKey: 'tag_nature' },
  space:     { emoji: '🌌', labelKey: 'tag_space' },
  minimal:   { emoji: '🎨', labelKey: 'tag_minimal' },
  neon:      { emoji: '⚡', labelKey: 'tag_neon' },
  ocean:     { emoji: '🌊', labelKey: 'tag_ocean' },
  floral:    { emoji: '🌸', labelKey: 'tag_floral' },
  seasonal:  { emoji: '❄️', labelKey: 'tag_seasonal' },
  aurora:    { emoji: '🌠', labelKey: 'tag_aurora' },
  city:      { emoji: '🌃', labelKey: 'tag_city' },
  rain:      { emoji: '🌧️', labelKey: 'tag_rain' },
  colorful:  { emoji: '🌈', labelKey: 'tag_colorful' },
  neutral:   { emoji: '🩶', labelKey: 'tag_neutral' },
};

// ── Mini screen gallery ───────────────────────────────────────────────────────

type GalleryScreen = 'wordlist' | 'flipmode' | 'testmode' | 'folders';

const GALLERY_SCREENS: { key: GalleryScreen; labelKey: TranslationKey }[] = [
  { key: 'wordlist',  labelKey: 'theme_preview_wordlist'  },
  { key: 'flipmode',  labelKey: 'theme_preview_flipmode'  },
  { key: 'testmode',  labelKey: 'theme_preview_testmode'  },
  { key: 'folders',   labelKey: 'theme_preview_folders'   },
];

const MiniScreen = memo(function MiniScreen({
  screenKey, label, item, skinData,
}: {
  screenKey: GalleryScreen;
  label: string;
  item: ShopItem;
  skinData: ThemeSkin | undefined;
}) {
  const bg = item.category === 'solid' ? item.previewBg : (skinData?.palette.bg ?? item.previewBg);
  const dark = isDarkBg(bg) || !!skinData?.wallpaperImage;
  const cardBg = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const headerBg = item.previewAccent + '50';

  return (
    <View style={miniStyles.wrapper}>
      <View style={[miniStyles.frame, { width: MINI_W, height: MINI_H }]}>
        {/* Skin background */}
        {item.category === 'premium' ? (
          <PremiumSkinPreview item={item} skinData={skinData} width={MINI_W} height={MINI_H} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />
        )}

        {/* Header bar */}
        <View style={[StyleSheet.absoluteFill]}>
          <View style={{ height: 14, backgroundColor: headerBg }} />

          {/* Screen-type content */}
          <View style={{ flex: 1, padding: 5 }}>
            {screenKey === 'wordlist' && (
              <View style={{ gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={{ height: 22, borderRadius: 5, backgroundColor: cardBg }} />
                ))}
              </View>
            )}

            {screenKey === 'flipmode' && (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ width: MINI_W - 18, height: 58, borderRadius: 8, backgroundColor: cardBg }} />
              </View>
            )}

            {screenKey === 'testmode' && (
              <View style={{ gap: 4 }}>
                <View style={{ height: 18, borderRadius: 4, backgroundColor: cardBg, marginBottom: 4 }} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {[0, 1, 2, 3].map(i => (
                    <View key={i} style={{ width: (MINI_W - 10 - 4) / 2, height: 26, borderRadius: 5, backgroundColor: cardBg }} />
                  ))}
                </View>
              </View>
            )}

            {screenKey === 'folders' && (
              <View style={{ gap: 5 }}>
                {[0, 1].map(i => (
                  <View key={i} style={{ height: 28, borderRadius: 6, backgroundColor: cardBg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: item.previewAccent + '70', marginRight: 5 }} />
                    <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }} />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
      <Text style={miniStyles.label}>{label}</Text>
    </View>
  );
});

const miniStyles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 6 },
  frame:   { borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)' },
  label:   { fontSize: 11, fontWeight: '500', color: '#888', textAlign: 'center' },
});

// ── ThemeDetailsSheet ─────────────────────────────────────────────────────────

interface Props {
  item: ShopItem | null;
  onClose: () => void;
  effectiveSkinId: string;
  isOwned: boolean;
  isSubscribed: boolean;
  pal: Palette;
  themeColor: string;
  onApply: (item: ShopItem) => void;
  onUpgrade: () => void;
}

export function ThemeDetailsSheet({
  item, onClose, effectiveSkinId, isOwned, isSubscribed, pal, themeColor, onApply, onUpgrade,
}: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  const slideX = useRef(new Animated.Value(SCREEN_W)).current;

  // Keep the last rendered item alive through the closing animation
  const lastItemRef = useRef<ShopItem | null>(null);
  if (item) lastItemRef.current = item;
  const displayItem = item ?? lastItemRef.current;

  // Track which item id was last animated in, to avoid re-triggering on re-renders
  const animatedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (item && item.id !== animatedIdRef.current) {
      animatedIdRef.current = item.id;
      slideX.setValue(SCREEN_W);
      Animated.spring(slideX, { toValue: 0, tension: 70, friction: 11, useNativeDriver: true }).start();
    }
  }, [item?.id]);

  const handleClose = useCallback(() => {
    animatedIdRef.current = null;
    Animated.timing(slideX, { toValue: SCREEN_W, duration: 220, useNativeDriver: true })
      .start(() => onClose());
  }, [onClose, slideX]);

  const skinData = SKINS.find(s => s.id === displayItem?.id);
  const isApplied = displayItem ? effectiveSkinId === displayItem.id : false;
  const isFreeItem = displayItem ? !displayItem.price && displayItem.category === 'solid' : false;
  const isSolidPaid = displayItem ? displayItem.category === 'solid' && displayItem.price > 0 : false;

  if (!displayItem) return null;

  const bgColor = displayItem.category === 'solid'
    ? displayItem.previewBg
    : (skinData?.palette.bg ?? displayItem.previewBg);
  const dark = isDarkBg(bgColor) || !!skinData?.wallpaperImage;

  // ── Action button config ────────────────────────────────────────────────────
  let actionLabel: string;
  let actionDisabled = false;
  let actionStyle: 'primary' | 'secondary' | 'disabled' = 'primary';

  if (isApplied) {
    actionLabel = `✓  ${t('theme_details_applied')}`;
    actionDisabled = true;
    actionStyle = 'disabled';
  } else if (isOwned) {
    actionLabel = t('theme_details_apply');
    actionStyle = 'primary';
  } else if (!isSubscribed && isSolidPaid) {
    actionLabel = t('theme_details_upgrade');
    actionStyle = 'secondary';
  } else if (!isOwned) {
    actionLabel = `${t('theme_details_buy')}  ¥${displayItem.price}`;
    actionStyle = 'primary';
  } else {
    actionLabel = t('theme_details_apply');
  }

  const handleAction = () => {
    if (actionDisabled) return;
    if (isOwned) {
      onApply(displayItem);
      handleClose();
    } else if (!isSubscribed && isSolidPaid) {
      onUpgrade();
    } else {
      onApply(displayItem);
      handleClose();
    }
  };

  // Badge shown under the name
  const badge: { label: string; color: string } | null = isFreeItem
    ? { label: t('theme_details_free_badge'), color: '#22C55E' }
    : isOwned && !isApplied
      ? { label: t('theme_details_owned_badge'), color: '#22C55E' }
      : displayItem.price > 0 && !isOwned && !isSubscribed
        ? { label: `¥${displayItem.price}`, color: '#EF4444' }
        : null;

  return (
    <Animated.View
      pointerEvents={item ? 'box-none' : 'none'}
      style={[StyleSheet.absoluteFillObject, s.sheet, { backgroundColor: pal.bg, transform: [{ translateX: slideX }] }]}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12, borderBottomColor: pal.border }]}>
        <TouchableOpacity style={s.backBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={pal.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: pal.text }]}>{t('theme_details_title')}</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* ── Hero row ──────────────────────────────────────────────────── */}
        <View style={s.heroRow}>
          {/* Large preview card */}
          <View style={[s.heroCard, { width: HERO_CARD_W, height: HERO_CARD_H, borderColor: dark ? displayItem.previewAccent + '60' : displayItem.previewAccent + '30' }]}>
            {displayItem.category === 'premium' ? (
              <PremiumSkinPreview item={displayItem} skinData={skinData} width={HERO_CARD_W} height={HERO_CARD_H} />
            ) : (
              <>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: displayItem.previewBg }]} />
                <View style={[StyleSheet.absoluteFill, s.heroCardCenter]}>
                  <Text style={[s.heroCardWordMemo, { color: displayItem.previewAccent }]}>WordMemo</Text>
                </View>
              </>
            )}
            {isApplied && (
              <View style={[s.appliedBadge, { backgroundColor: themeColor }]}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            )}
          </View>

          {/* Info column */}
          <View style={s.heroInfo}>
            <Text style={[s.heroName, { color: pal.text }]} numberOfLines={2}>{displayItem.name}</Text>

            {badge && (
              <View style={[s.badgeChip, { backgroundColor: badge.color + '18', borderColor: badge.color + '44' }]}>
                <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            )}

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              style={[
                s.actionBtn,
                actionStyle === 'primary'   && { backgroundColor: themeColor },
                actionStyle === 'secondary' && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: themeColor },
                actionStyle === 'disabled'  && { backgroundColor: themeColor, opacity: 0.55 },
              ]}
              onPress={handleAction}
              disabled={actionDisabled}
              activeOpacity={0.75}
            >
              <Text style={[
                s.actionBtnText,
                actionStyle === 'secondary' ? { color: themeColor } : { color: '#fff' },
              ]}>
                {actionLabel}
              </Text>
            </TouchableOpacity>

            {!isSubscribed && isSolidPaid && (
              <Text style={[s.includedNote, { color: pal.sub }]}>{t('theme_details_included_basic')}</Text>
            )}
          </View>
        </View>

        {/* ── Feature tags ──────────────────────────────────────────────── */}
        {displayItem.tags.length > 0 && (
          <>
            <View style={[s.divider, { backgroundColor: pal.border }]} />
            <Text style={[s.sectionTitle, { color: pal.sub }]}>{t('theme_details_features')}</Text>
            <View style={s.tagsWrap}>
              {displayItem.tags.map(tag => {
                const meta = TAG_META[tag];
                if (!meta) return null;
                return (
                  <View key={tag} style={[s.tagChip, { backgroundColor: pal.chip }]}>
                    <Text style={s.tagEmoji}>{meta.emoji}</Text>
                    <Text style={[s.tagLabel, { color: pal.text }]}>{t(meta.labelKey)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Preview gallery ───────────────────────────────────────────── */}
        <>
          <View style={[s.divider, { backgroundColor: pal.border }]} />
          <Text style={[s.sectionTitle, { color: pal.sub }]}>{t('theme_details_preview')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.galleryContent}
          >
            {GALLERY_SCREENS.map(({ key, labelKey }) => (
              <MiniScreen
                key={key}
                screenKey={key}
                label={t(labelKey)}
                item={displayItem}
                skinData={skinData}
              />
            ))}
          </ScrollView>
        </>
      </ScrollView>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sheet: { zIndex: 10 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: H_PAD - 4, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:     { width: 40, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  scrollContent: { paddingTop: 24, paddingHorizontal: H_PAD },

  // Hero
  heroRow: { flexDirection: 'row', gap: 16, marginBottom: 0 },

  heroCard: {
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1,
  },
  heroCardCenter: { alignItems: 'center', justifyContent: 'center' },
  heroCardWordMemo: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  appliedBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  heroInfo: { flex: 1, paddingTop: 2, paddingBottom: 2, minHeight: HERO_CARD_H },

  heroName: { fontSize: 18, fontWeight: '700', marginBottom: 8, lineHeight: 24 },

  badgeChip: {
    alignSelf: 'flex-start',
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  actionBtn: {
    borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700' },

  includedNote: { fontSize: 11, marginTop: 6, textAlign: 'center' },

  // Sections
  divider:      { height: StyleSheet.hairlineWidth, marginVertical: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, marginBottom: 12, textTransform: 'uppercase' },

  // Tags
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  tagEmoji: { fontSize: 13 },
  tagLabel: { fontSize: 13, fontWeight: '500' },

  // Gallery
  galleryContent: { gap: 12, paddingBottom: 4, paddingRight: H_PAD },
});
