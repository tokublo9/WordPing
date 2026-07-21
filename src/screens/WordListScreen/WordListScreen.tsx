import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Folder, Palette, WordCard } from '../../types';
import { appStyles as s } from '../../styles';
import { useLang } from '../../i18n';
import { AD_BANNER_HEIGHT } from '../../components/AdBannerPlaceholder';
import { LEVEL_FILTER_OPTIONS } from '../../features/cards/levels';
import { SwipeableCard } from '../../components/SwipeableCard';
import { ReorderableList } from '../../components/ReorderableList';
import { FlipCardBrowser } from '../../components/FlipCardBrowser';
import { TestStatusIcon } from '../../components/TestStatusIcon';
import { ScrollBar } from '../../components/ScrollBar';

const SEL_BAR_H = 68;

// Comprehension-level colors for the sort options, reusing the same green/red as
// the level filter chips: green = highest understanding, red = lowest.
const LEVEL_HIGH_COLOR = LEVEL_FILTER_OPTIONS.find(o => o.level === 'perfect')?.color ?? '#5EBF84';
const LEVEL_LOW_COLOR  = LEVEL_FILTER_OPTIONS.find(o => o.level === 'unknown')?.color ?? '#ED7373';

const emptyIconWrap = {
  width: 80, height: 80, borderRadius: 24,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  marginBottom: 20,
};

// ── Prop interfaces ───────────────────────────────────────────────────────────

export interface WordListSelectionProps {
  active: boolean;
  selectedIds: Set<string>;
  onToggle(id: string): void;
  onExit(): void;
  onSetNotif(notifOff: boolean): void;
  onMoveSelected(): void;
  onDelete(): void;
}

export interface WordListReorderProps {
  active: boolean;
  sortDir: 'asc' | 'desc' | null;
  onSortByLevel(dir: 'asc' | 'desc'): void;
  onResetOrder(): void;
  onReorder(reorderedCards: WordCard[]): void;
  onExit(): void;
  onCancel(): void;
}

export interface WordListActionsProps {
  onGoBack(): void;
  onOpenNotifications(): void;
  onOpenMenu(): void;
  onOpenTestMode(): void;
  onFlip(id: string): void;
  onEdit(card: WordCard): void;
  onDelete(id: string): void;
  onMove(ids: string[]): void;
  onToggleNotif(id: string): void;
  onVoiceLocked(): void;
  onCustomVoiceLocked(): void;
  onOpenAdd(): void;
}

export interface WordListScreenProps {
  pal: Palette;
  themeColor: string;
  isSubscribed: boolean;
  isPremium?: boolean;

  // Deep Sea skin scroll animation
  scrollY: Animated.Value;
  deepSeaSkin: boolean;

  // Folder / data
  currentFolder: Folder | null;
  folderCards: WordCard[];
  filteredFolderCards: WordCard[];
  showFullCard: boolean;
  verticalFlip: boolean;
  notificationsEnabled: boolean;
  cardViewMode: 'list' | 'flip';
  onToggleViewMode(): void;

  // Level filter
  levelFilter: Set<string>;
  isFilterActive: boolean;
  showLevelLabels: boolean;
  onToggleLevelFilter(level: string): void;

  // Card-open tracking
  flipped: Set<string>;
  cardScrollEnabled: boolean;
  closeOpenCard: React.RefObject<(() => void) | null>;
  onCardOpen(close: () => void): void;
  onSwiping(active: boolean): void;

  selection: WordListSelectionProps;
  reorder: WordListReorderProps;
  actions: WordListActionsProps;

  menuBtnRef: React.RefObject<View | null>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WordListScreen({
  pal, themeColor, isSubscribed, isPremium = false,
  scrollY, deepSeaSkin,
  currentFolder, folderCards, filteredFolderCards,
  showFullCard, verticalFlip, notificationsEnabled,
  cardViewMode, onToggleViewMode,
  levelFilter, isFilterActive, showLevelLabels, onToggleLevelFilter,
  flipped, cardScrollEnabled, closeOpenCard, onCardOpen, onSwiping,
  selection, reorder, actions,
  menuBtnRef,
}: WordListScreenProps) {
  const t = useLang();

  // ── Scrollbar (no React state on scroll — Animated.event drives everything) ──

  // Animated scroll position for the scrollbar thumb — tracks on native thread.
  const listScrollAnim = useRef(new Animated.Value(0)).current;
  // Fade animated value — controlled by show/hide callbacks below.
  const listFadeAnim   = useRef(new Animated.Value(0)).current;
  // Timer ref for the auto-hide delay.
  const listFadeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layout dimensions — only updated on resize, not on every scroll event.
  const [listContentH, setListContentH] = useState(0);
  const [listViewH,    setListViewH]    = useState(0);

  // Refs that let the stable scroll event handler read the latest prop values.
  const deepSeaSkinRef   = useRef(deepSeaSkin);
  const deepSeaScrollRef = useRef(scrollY);
  deepSeaSkinRef.current   = deepSeaSkin;
  deepSeaScrollRef.current = scrollY;

  // Stable scroll event — created once, never recreated.
  const listScrollEvent = useRef(
    Animated.event(
      [{ nativeEvent: { contentOffset: { y: listScrollAnim } } }],
      {
        useNativeDriver: true,
        // listener runs on JS thread at scrollEventThrottle cadence;
        // used only to forward the value to the DeepSea skin animated value.
        listener: (e: any) => {
          if (deepSeaSkinRef.current) {
            deepSeaScrollRef.current.setValue(e.nativeEvent.contentOffset.y);
          }
        },
      }
    )
  ).current;

  // Show the scrollbar thumb immediately.
  const showScrollbar = useCallback(() => {
    if (listFadeTimer.current) clearTimeout(listFadeTimer.current);
    Animated.timing(listFadeAnim, { toValue: 0.55, duration: 80, useNativeDriver: true }).start();
  }, [listFadeAnim]);

  // Schedule the thumb to fade out after scrolling stops.
  const scheduleHideScrollbar = useCallback(() => {
    if (listFadeTimer.current) clearTimeout(listFadeTimer.current);
    listFadeTimer.current = setTimeout(() => {
      Animated.timing(listFadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }, 900);
  }, [listFadeAnim]);

  const handleScrollBeginDrag = useCallback(() => {
    closeOpenCard.current?.();
    showScrollbar();
  }, [showScrollbar]);

  // onScrollEndDrag fires before onMomentumScrollBegin — schedule hide and let
  // handleMomentumScrollBegin cancel it if a momentum scroll follows.
  const handleScrollEndDrag     = useCallback(() => { scheduleHideScrollbar(); }, [scheduleHideScrollbar]);
  const handleMomentumScrollBegin = useCallback(() => { showScrollbar(); },          [showScrollbar]);
  const handleMomentumScrollEnd   = useCallback(() => { scheduleHideScrollbar(); }, [scheduleHideScrollbar]);

  // Cleanup timer on unmount.
  useEffect(() => () => { if (listFadeTimer.current) clearTimeout(listFadeTimer.current); }, []);

  const renderCard = ({ item, index }: { item: WordCard; index: number }) => (
    <SwipeableCard
      item={item}
      isFlipped={flipped.has(item.id)}
      themeColor={themeColor}
      pal={pal}
      voiceLocked={false}
      isSubscribed={isSubscribed}
      onFlip={() => actions.onFlip(item.id)}
      onEdit={() => actions.onEdit(item)}
      onDelete={() => actions.onDelete(item.id)}
      onMove={() => actions.onMove([item.id])}
      onToggleNotif={() => actions.onToggleNotif(item.id)}
      onVoiceLocked={actions.onVoiceLocked}
      onCustomVoiceLocked={actions.onCustomVoiceLocked}
      isPremium={isPremium}
      onOpen={onCardOpen}
      openCardRef={closeOpenCard}
      selectionMode={selection.active}
      selected={selection.selectedIds.has(item.id)}
      onToggleSelect={() => selection.onToggle(item.id)}
      showLevelLabel={showLevelLabels}
      onSwiping={onSwiping}
      showFullCard={showFullCard}
    />
  );

  // ── Header ───────────────────────────────────────────────────────────────────
  const header = (
    <View style={s.header} onTouchStart={() => closeOpenCard.current?.()}>
      {selection.active ? (
        <>
          <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
            {selection.selectedIds.size} {t('selected')}
          </Text>
          <TouchableOpacity style={s.iconBtn} onPress={selection.onExit}>
            <Text style={{ color: themeColor, fontSize: 16, fontWeight: '600' }}>
              {t('cancel')}
            </Text>
          </TouchableOpacity>
        </>
      ) : reorder.active ? (
        <>
          <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
            {t('reorder_cards')}
          </Text>
          <View style={reorderToolStyles.headerActions}>
            <TouchableOpacity style={s.iconBtn} onPress={reorder.onCancel} hitSlop={{ top: 8, bottom: 8 }}>
              <Text style={{ color: pal.sub, fontSize: 16, fontWeight: '600' }}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={reorder.onExit} hitSlop={{ top: 8, bottom: 8 }}>
              <Text style={{ color: themeColor, fontSize: 16, fontWeight: '700' }}>
                {t('save')}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: -4 }}
            onPress={actions.onGoBack}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10 }}
          >
            <View style={{ paddingRight: 4 }}>
              <Ionicons name="chevron-back" size={24} color={pal.text} />
            </View>
            <Text style={[s.title, { color: pal.text, flex: 1 }]} numberOfLines={1}>
              {currentFolder?.name ?? ''}
            </Text>
          </TouchableOpacity>
          <View style={s.headerIcons}>
            <TouchableOpacity style={s.iconBtn} onPress={actions.onOpenNotifications}>
              <Ionicons
                name={notificationsEnabled ? 'notifications' : 'notifications-off-outline'}
                size={22}
                color={notificationsEnabled ? themeColor : pal.sub}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={onToggleViewMode}
            >
              <Ionicons
                name={cardViewMode === 'flip' ? 'list-outline' : 'albums-outline'}
                size={22}
                color={pal.sub}
              />
            </TouchableOpacity>
            <View ref={menuBtnRef}>
              <TouchableOpacity style={s.iconBtn} onPress={actions.onOpenMenu}>
                <Ionicons name="ellipsis-vertical" size={22} color={pal.sub} />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );

  // ── Word count ────────────────────────────────────────────────────────────────
  const wordCount = (
    <View onTouchStart={() => closeOpenCard.current?.()}>
      <Text style={[s.wordCount, { color: pal.sub }]}>
        {isFilterActive
          ? `${filteredFolderCards.length} / ${folderCards.length}`
          : folderCards.length}{' '}
        {t(folderCards.length === 1 ? 'words_singular' : 'words_plural')}
      </Text>
    </View>
  );

  // ── Level filter bar ──────────────────────────────────────────────────────────
  const untestedCount = folderCards.filter(c => !c.testLevel).length;
  const isTestComplete = folderCards.length > 0 && untestedCount === 0;

  const filterBar = folderCards.length > 0 && !selection.active && !reorder.active && showLevelLabels ? (
    <View style={filterStyles.bar} onTouchStart={() => closeOpenCard.current?.()}>
      <View style={filterStyles.chipGroup}>
        {LEVEL_FILTER_OPTIONS.map(({ level, icon, color }) => {
          const count = folderCards.filter(c => (c.testLevel ?? 'none') === level).length;
          const on = levelFilter.has(level);
          return (
            <TouchableOpacity
              key={level}
              style={[filterStyles.chip, { borderColor: on ? color : pal.border }]}
              onPress={() => onToggleLevelFilter(level)}
            >
              {icon === '◎'
                ? <Text style={{ fontSize: 14, color: on ? color : '#9CA3AF', lineHeight: 15 }}>◎</Text>
                : icon != null
                ? <Ionicons name={icon as any} size={13} color={on ? color : '#9CA3AF'} />
                : null
              }
              <Text style={[filterStyles.chipCount, { color: on ? color : '#9CA3AF' }]}>
                {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        style={s.iconBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={actions.onOpenTestMode}
        accessibilityLabel={
          isTestComplete
            ? 'Test complete.'
            : untestedCount > 0
            ? `Test, ${untestedCount} remaining`
            : 'Test'
        }
      >
        <TestStatusIcon
          cardCount={folderCards.length}
          untestedCount={untestedCount}
          themeColor={themeColor}
          pal={pal}
        />
      </TouchableOpacity>
    </View>
  ) : null;

  // ── Card list content ─────────────────────────────────────────────────────────
  let cardContent: React.ReactNode;
  if (folderCards.length === 0) {
    cardContent = (
      <View style={s.empty}>
        <View style={[emptyIconWrap, { backgroundColor: themeColor + '18' }]}>
          <Ionicons name="book-outline" size={40} color={themeColor} />
        </View>
        <Text style={[s.emptyTitle, { color: pal.text }]}>{t('no_words_title')}</Text>
        <Text style={[s.emptyHint,  { color: pal.sub  }]}>{t('no_words_hint')}</Text>
      </View>
    );
  } else if (reorder.active) {
    cardContent = (
      <>
        <View style={reorderToolStyles.toolbar}>
          {/* Highest first — green circle → arrow → label (asc: perfect → unknown) */}
          <TouchableOpacity
            style={[
              reorderToolStyles.sortBtn,
              { backgroundColor: pal.card, borderColor: pal.border },
              reorder.sortDir === 'asc' && { borderColor: themeColor, backgroundColor: themeColor + '14' },
            ]}
            onPress={() => reorder.onSortByLevel('asc')}
            activeOpacity={0.85}
          >
            <View style={[reorderToolStyles.levelCircle, { backgroundColor: LEVEL_HIGH_COLOR }]} />
            <Text style={[reorderToolStyles.sortArrow, { color: pal.sub }]}>→</Text>
            <Text style={[reorderToolStyles.btnText, { color: reorder.sortDir === 'asc' ? themeColor : pal.text }]}>
              {t('reorder_sort_best_first')}
            </Text>
          </TouchableOpacity>

          {/* Lowest first — red circle → arrow → label (desc: unknown → perfect) */}
          <TouchableOpacity
            style={[
              reorderToolStyles.sortBtn,
              { backgroundColor: pal.card, borderColor: pal.border },
              reorder.sortDir === 'desc' && { borderColor: themeColor, backgroundColor: themeColor + '14' },
            ]}
            onPress={() => reorder.onSortByLevel('desc')}
            activeOpacity={0.85}
          >
            <View style={[reorderToolStyles.levelCircle, { backgroundColor: LEVEL_LOW_COLOR }]} />
            <Text style={[reorderToolStyles.sortArrow, { color: pal.sub }]}>→</Text>
            <Text style={[reorderToolStyles.btnText, { color: reorder.sortDir === 'desc' ? themeColor : pal.text }]}>
              {t('reorder_sort_least_first')}
            </Text>
          </TouchableOpacity>

          {/* Reset to original order — icon only */}
          <TouchableOpacity
            style={[reorderToolStyles.resetBtn, { backgroundColor: pal.card, borderColor: pal.border }]}
            onPress={reorder.onResetOrder}
            activeOpacity={0.85}
            accessibilityLabel={t('reorder_original')}
          >
            <Ionicons name="refresh-outline" size={16} color={pal.sub} />
          </TouchableOpacity>
        </View>
        <ReorderableList
          cards={folderCards}
          onReorder={reorder.onReorder}
          pal={pal}
          themeColor={themeColor}
          extraPaddingBottom={isSubscribed ? 0 : AD_BANNER_HEIGHT}
          showLevelLabel={showLevelLabels}
        />
      </>
    );
  } else if (cardViewMode === 'flip') {
    cardContent = (
      <FlipCardBrowser
        key={Array.from(levelFilter).sort().join(',')}
        cards={filteredFolderCards}
        pal={pal}
        themeColor={themeColor}
        isSubscribed={isSubscribed}
        isPremium={isPremium}
        onCustomVoiceLocked={actions.onCustomVoiceLocked}
        onEdit={actions.onEdit}
        onDelete={actions.onDelete}
        onMove={card => actions.onMove([card.id])}
        onToggleNotif={actions.onToggleNotif}
        showLevelLabel={showLevelLabels}
        verticalFlip={verticalFlip}
      />
    );
  } else {
    cardContent = (
      <View style={{ flex: 1 }}>
        <Animated.FlatList<WordCard>
          data={filteredFolderCards}
          keyExtractor={c => c.id}
          renderItem={renderCard}
          style={{ flex: 1 }}
          contentContainerStyle={[
            s.list,
            { paddingBottom: s.list.paddingBottom + (isSubscribed ? 0 : AD_BANNER_HEIGHT) + (selection.active ? SEL_BAR_H : 0) },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={cardScrollEnabled}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={listScrollEvent}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollBegin={handleMomentumScrollBegin}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onContentSizeChange={(_, h) => setListContentH(h)}
          onLayout={e => setListViewH(e.nativeEvent.layout.height)}
          ListFooterComponent={
            <TouchableWithoutFeedback onPress={() => closeOpenCard.current?.()}>
              <View style={{ height: 300 }} />
            </TouchableWithoutFeedback>
          }
        />
        <ScrollBar
          scrollAnim={listScrollAnim}
          contentH={listContentH}
          viewH={listViewH}
          fadeAnim={listFadeAnim}
          color={pal.sub}
        />
      </View>
    );
  }

  // ── Selection action bar ──────────────────────────────────────────────────────
  const selectionBar = selection.active ? (
    <View style={[selStyles.bar, { backgroundColor: pal.dialog, borderTopColor: pal.border }]}>
      <TouchableOpacity
        style={selStyles.barBtn}
        onPress={() => selection.onSetNotif(false)}
        disabled={selection.selectedIds.size === 0}
      >
        <Ionicons
          name="notifications-outline"
          size={20}
          color={selection.selectedIds.size === 0 ? pal.sub : themeColor}
        />
        <Text style={[selStyles.barLabel, { color: selection.selectedIds.size === 0 ? pal.sub : themeColor }]}>
          {t('notif_on')}
        </Text>
      </TouchableOpacity>
      <View style={[selStyles.barDivider, { backgroundColor: pal.border }]} />
      <TouchableOpacity
        style={selStyles.barBtn}
        onPress={() => selection.onSetNotif(true)}
        disabled={selection.selectedIds.size === 0}
      >
        <Ionicons name="notifications-off-outline" size={20} color={pal.sub} />
        <Text style={[selStyles.barLabel, { color: pal.sub }]}>{t('notif_off_action')}</Text>
      </TouchableOpacity>
      <View style={[selStyles.barDivider, { backgroundColor: pal.border }]} />
      <TouchableOpacity
        style={selStyles.barBtn}
        onPress={selection.onMoveSelected}
        disabled={selection.selectedIds.size === 0}
      >
        <Ionicons
          name="folder-outline"
          size={20}
          color={selection.selectedIds.size === 0 ? pal.sub : themeColor}
        />
        <Text style={[selStyles.barLabel, { color: selection.selectedIds.size === 0 ? pal.sub : themeColor }]}>
          {t('move')}
        </Text>
      </TouchableOpacity>
      <View style={[selStyles.barDivider, { backgroundColor: pal.border }]} />
      <TouchableOpacity
        style={selStyles.barBtn}
        onPress={selection.onDelete}
        disabled={selection.selectedIds.size === 0}
      >
        <Ionicons
          name="trash-outline"
          size={20}
          color={selection.selectedIds.size === 0 ? pal.sub : '#E05C5C'}
        />
        <Text style={[selStyles.barLabel, { color: selection.selectedIds.size === 0 ? pal.sub : '#E05C5C' }]}>
          {t('delete')}
        </Text>
      </TouchableOpacity>
    </View>
  ) : null;

  // ── FAB ───────────────────────────────────────────────────────────────────────
  const fab = !selection.active && !reorder.active ? (
    <TouchableOpacity
      style={[
        s.fab,
        {
          bottom: (isSubscribed ? 16 : AD_BANNER_HEIGHT) + 48,
          backgroundColor: themeColor,
          shadowColor: themeColor,
        },
      ]}
      onPress={actions.onOpenAdd}
    >
      <Text style={s.fabText}>+</Text>
    </TouchableOpacity>
  ) : null;

  return (
    <>
      {header}
      {wordCount}
      {filterBar}
      {cardContent}
      {selectionBar}
      {fab}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const selStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: SEL_BAR_H,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  barLabel: { fontSize: 11, fontWeight: '600' },
  barDivider: { width: StyleSheet.hairlineWidth },
});

const filterStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    marginTop: -4,
  },
  chipGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipCount: {
    fontSize: 12,
    fontWeight: '600',
  },
});

const reorderToolStyles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  // Original-order reset — icon-only button beside the Lowest First pill.
  resetBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Direction sort pills — colored level circle → arrow → label.
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  levelCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sortArrow: {
    fontSize: 15,
    fontWeight: '700',
    marginHorizontal: -1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
