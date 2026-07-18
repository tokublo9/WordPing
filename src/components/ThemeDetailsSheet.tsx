import {
  Animated,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';

import type { Palette, ThemeSkin } from '../types';
import { type TranslationKey, useLang } from '../i18n';
import { SKINS } from '../constants';
import { type ShopItem, PremiumSkinPreview, THEME_SCREENSHOTS, THEME_SCREENSHOTS_FLIP, THEME_VIDEOS, THEME_VIDEOS_FLIP } from './ThemeSkinPreview';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const H_PAD = 20;

// Hero preview card dimensions (left column of hero row)
const HERO_CARD_W = Math.round((SCREEN_W - H_PAD * 2) * 0.42);
const HERO_CARD_H = Math.round(HERO_CARD_W * 1.3);

// Gallery preview dimensions — two frames side-by-side, aspect ratio matches screenshots (1260×2736)
const PREVIEW_GAP = 12;
const PREVIEW_W   = Math.floor((SCREEN_W - H_PAD * 2 - PREVIEW_GAP) / 2);
const PREVIEW_H   = Math.round(PREVIEW_W * 2736 / 1260);

// Returns true when a hex color is perceptually very dark (luma < 50)
function isDarkBg(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 < 50;
}

// ── Fullscreen media viewer ───────────────────────────────────────────────────

type FullscreenEntry =
  | { type: 'image'; source: number }
  | { type: 'video'; source: number }
  | null;

type ViewerState = { pages: [FullscreenEntry, FullscreenEntry]; startIndex: 0 | 1 } | null;

const FullscreenImage = memo(function FullscreenImage({ source }: { source: number }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      source={source}
      style={[fsStyles.mediaFill, { opacity: loaded ? 1 : 0 }]}
      resizeMode="contain"
      onLoad={() => setLoaded(true)}
    />
  );
});

const FullscreenVideo = memo(function FullscreenVideo({ source, active }: { source: number; active: boolean }) {
  const [ready, setReady] = useState(false);

  const player = useVideoPlayer(source, p => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    if (player.status === 'readyToPlay') setReady(true);
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setReady(true);
    });
    return () => sub.remove();
  }, [player]);

  // Pause/play based on active state. No cleanup — useVideoPlayer handles release.
  useEffect(() => {
    if (active) player.play(); else player.pause();
  }, [active, player]);

  return (
    <VideoView
      player={player}
      style={{ flex: 1, width: '100%', opacity: ready ? 1 : 0 }}
      contentFit="contain"
      nativeControls={false}
    />
  );
});

function FullscreenViewer({
  viewerState, onClose,
}: {
  viewerState: ViewerState;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [pagerKey, setPagerKey] = useState(0);
  const [activePage, setActivePage] = useState<0 | 1>(0);
  const prevOpenRef = useRef(false);

  const open = viewerState !== null;

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setPagerKey(k => k + 1);
      setActivePage(viewerState!.startIndex);
    }
    prevOpenRef.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const topBarH   = insets.top + 48;
  const bottomH   = insets.bottom + 32;
  const mediaH    = SCREEN_H - topBarH - bottomH;
  const pages     = viewerState?.pages ?? ([null, null] as [FullscreenEntry, FullscreenEntry]);
  const startX    = (viewerState?.startIndex ?? 0) * SCREEN_W;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={fsStyles.backdrop}>
        {/* Top bar — tapping anywhere in it (including close icon) closes the viewer */}
        <TouchableOpacity
          style={[fsStyles.topBar, { paddingTop: insets.top }]}
          onPress={onClose}
          activeOpacity={1}
        >
          <View style={fsStyles.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Swipeable pager — scrolling between the two screens */}
        <ScrollView
          key={pagerKey}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          bounces={false}
          contentOffset={{ x: startX, y: 0 }}
          onMomentumScrollEnd={e => {
            const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W) as 0 | 1;
            setActivePage(page);
          }}
          style={{ width: SCREEN_W, height: mediaH }}
        >
          {pages.map((entry, i) => (
            <View key={i} style={{ width: SCREEN_W, height: mediaH }}>
              {entry?.type === 'video' && (
                <FullscreenVideo source={entry.source} active={open && activePage === i} />
              )}
              {entry?.type === 'image' && (
                <FullscreenImage source={entry.source} />
              )}
            </View>
          ))}
        </ScrollView>

        {/* Bottom safe-area spacer — tapping closes */}
        <TouchableOpacity style={{ height: bottomH }} onPress={onClose} activeOpacity={1} />
      </View>
    </Modal>
  );
}

// ── Mini screen gallery ───────────────────────────────────────────────────────

type GalleryScreen = 'wordlist' | 'flipmode';

const GALLERY_SCREENS: { key: GalleryScreen; labelKey: TranslationKey }[] = [
  { key: 'wordlist', labelKey: 'theme_preview_wordlist' },
  { key: 'flipmode', labelKey: 'theme_preview_flipmode' },
];

// Renders a looping, muted video preview. `active` mirrors whether the parent
// sheet is open — false causes a pause so the video doesn't run while hidden.
// Hidden (opacity 0) until the player reports readyToPlay to prevent flash.
const VideoFrame = memo(function VideoFrame({
  source, width, height, active, onReady,
}: {
  source: number;
  width: number;
  height: number;
  active: boolean;
  onReady?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const player = useVideoPlayer(source, p => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    const markReady = () => { setReady(true); onReadyRef.current?.(); };
    if (player.status === 'readyToPlay') { markReady(); }
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') markReady();
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (active) {
      player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

  return (
    <VideoView
      player={player}
      style={{ width, height, opacity: ready ? 1 : 0 }}
      contentFit="cover"
      nativeControls={false}
    />
  );
});

const MiniScreen = memo(function MiniScreen({
  screenKey, label, item, skinData, active, enabled, onReady, onPress,
}: {
  screenKey: GalleryScreen;
  label: string;
  item: ShopItem;
  skinData: ThemeSkin | undefined;
  active: boolean;
  /** False = skip mounting media; frame renders empty until enabled. */
  enabled: boolean;
  onReady?: () => void;
  onPress: (startIndex: 0 | 1) => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const bg = item.category === 'solid' ? item.previewBg : (skinData?.palette.bg ?? item.previewBg);
  const dark = isDarkBg(bg) || !!skinData?.wallpaperImage;
  const cardBg = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const headerBg = item.previewAccent + '50';
  const video = screenKey === 'wordlist'
    ? THEME_VIDEOS[item.id]
    : THEME_VIDEOS_FLIP[item.id];
  const screenshot = screenKey === 'wordlist'
    ? THEME_SCREENSHOTS[item.id]
    : THEME_SCREENSHOTS_FLIP[item.id];

  const hasMedia = video != null || screenshot != null;
  const startIndex: 0 | 1 = screenKey === 'wordlist' ? 0 : 1;
  const handlePress = useCallback(() => {
    if (hasMedia) onPress(startIndex);
  }, [hasMedia, startIndex, onPress]);

  // For themes that have no screenshot/video the fallback renders synchronously;
  // signal ready immediately so the next gallery item can start loading.
  useEffect(() => {
    if (enabled && video == null && screenshot == null) {
      onReadyRef.current?.();
    }
  }, [enabled, video, screenshot]);

  return (
    <View style={miniStyles.wrapper}>
      <TouchableOpacity
        style={[miniStyles.frame, { width: PREVIEW_W, height: PREVIEW_H }]}
        onPress={handlePress}
        activeOpacity={hasMedia ? 0.85 : 1}
        disabled={!hasMedia}
      >
        {!enabled ? null : video != null ? (
          <VideoFrame source={video} width={PREVIEW_W} height={PREVIEW_H} active={active} onReady={onReady} />
        ) : screenshot ? (
          <Image
            source={screenshot}
            style={{ width: PREVIEW_W, height: PREVIEW_H, opacity: imgLoaded ? 1 : 0 }}
            resizeMode="cover"
            onLoad={() => { setImgLoaded(true); onReadyRef.current?.(); }}
          />
        ) : (
          <>
            {/* Skin background */}
            {item.category === 'premium' ? (
              <PremiumSkinPreview item={item} skinData={skinData} width={PREVIEW_W} height={PREVIEW_H} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />
            )}

            {/* Header bar */}
            <View style={StyleSheet.absoluteFill}>
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
                    <View style={{ width: PREVIEW_W - 24, height: 80, borderRadius: 10, backgroundColor: cardBg }} />
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </TouchableOpacity>
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

  const [viewerState, setViewerState] = useState<ViewerState>(null);

  const handleMiniPress = useCallback((startIndex: 0 | 1) => {
    if (!displayItem) return;
    const wlVideo      = THEME_VIDEOS[displayItem.id];
    const wlShot       = THEME_SCREENSHOTS[displayItem.id];
    const flipVideo    = THEME_VIDEOS_FLIP[displayItem.id];
    const flipShot     = THEME_SCREENSHOTS_FLIP[displayItem.id];
    const wlEntry: FullscreenEntry   = wlVideo   != null ? { type: 'video', source: wlVideo }   : wlShot   != null ? { type: 'image', source: wlShot }   : null;
    const flipEntry: FullscreenEntry = flipVideo  != null ? { type: 'video', source: flipVideo }  : flipShot  != null ? { type: 'image', source: flipShot }  : null;
    setViewerState({ pages: [wlEntry, flipEntry], startIndex });
  }, [displayItem]);

  // Close fullscreen viewer when the sheet itself is dismissed
  useEffect(() => {
    if (!item) setViewerState(null);
  }, [item]);

  // Sequential gallery loading: Wordlist loads first; Flipmode only after Wordlist is ready.
  // Using an id-keyed value means flipmodeEnabled resets automatically when displayItem changes
  // — no separate reset effect needed.
  const [flipmodeEnabledForId, setFlipmodeEnabledForId] = useState<string | null>(null);
  const flipmodeEnabled = flipmodeEnabledForId === displayItem?.id;

  const handleWordlistReady = useCallback(() => {
    if (displayItem) setFlipmodeEnabledForId(displayItem.id);
  }, [displayItem]);

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
    <>
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
                  <Text style={[s.heroCardWordPing, { color: displayItem.previewAccent }]}>WordPing</Text>
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

        {/* ── Preview gallery ───────────────────────────────────────────── */}
        <>
          <View style={[s.divider, { backgroundColor: pal.border }]} />
          <Text style={[s.sectionTitle, { color: pal.sub }]}>{t('theme_details_preview')}</Text>
          <View style={s.galleryRow}>
            {GALLERY_SCREENS.map(({ key, labelKey }) => (
              <MiniScreen
                key={`${key}-${displayItem.id}`}
                screenKey={key}
                label={t(labelKey)}
                item={displayItem}
                skinData={skinData}
                active={item !== null}
                enabled={key === 'wordlist' ? true : flipmodeEnabled}
                onReady={key === 'wordlist' ? handleWordlistReady : undefined}
                onPress={handleMiniPress}
              />
            ))}
          </View>
        </>
      </ScrollView>
    </Animated.View>
    <FullscreenViewer
      viewerState={viewerState}
      onClose={() => setViewerState(null)}
    />
    </>
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
  heroCardWordPing: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
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

  // Gallery
  galleryRow: { flexDirection: 'row', gap: PREVIEW_GAP },
});

const fsStyles = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: '#000' },
  layout:    { flex: 1 },
  topBar:    { paddingBottom: 8, paddingHorizontal: 16, alignItems: 'flex-start' },
  closeBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  mediaArea: { flex: 1 },
  mediaFill: { flex: 1, width: '100%' },
});
