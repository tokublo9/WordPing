import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
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
import {
  getScrollBarMetrics,
  getScrollOffsetForThumb,
  ScrollBar,
} from '../../components/ScrollBar';
import {
  WordListPositionLabel,
  type WordListPositionLabelHandle,
} from '../../components/WordListPositionLabel';
import { mergeVisibleCardOrder } from '../../features/cards/cardSorting';
import { resolveCurrentWordIndex } from '../../features/cards/currentWordPosition';
import { committedLayer, resolveModeLayers } from '../../features/cards/modeLayers';

const SEL_BAR_H = 68;

// Offsets within this count as "resting at the top", where the header keeps reading
// "N words". Small enough that any real scroll switches to the position readout, loose
// enough to absorb bounce and sub-pixel offsets.
const LIST_TOP_EPSILON = 2;
const FAST_SCROLL_LONG_PRESS_MS = 240;
const FAST_SCROLL_MOVE_SLOP = 7;
const FAST_SCROLL_TOUCH_WIDTH = 48;
const FAST_SCROLL_ACTIVE_TOUCH_WIDTH = 72;
const FAST_SCROLL_VERTICAL_HIT_SLOP = 18;
// ReorderableList already reserves 100pt. This extra clearance keeps its final row
// above the 58pt add button at the existing 48pt bottom offset.
const FAB_LIST_EXTRA_CLEARANCE = 32;

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
  onSelectAll(): void;
  onExit(): void;
  onSetNotif(notifOff: boolean): void;
  onMoveSelected(): void;
  onDelete(): void;
}

export interface WordListReorderProps {
  active: boolean;
  sortDir: 'asc' | 'desc' | 'registration' | null;
  onSortByLevel(dir: 'asc' | 'desc'): void;
  onRegistrationOrder(): void;
  onReorder(reorderedCards: WordCard[]): void;
  onExit(): void;
  onCancel(): void;
}

export interface WordListActionsProps {
  onGoBack(): void;
  onOpenTextToSpeech(): void;
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
  hasTextToSpeechHistory?: boolean;

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
  currentWordId: string | null;
  onCurrentWordChange(id: string | null): void;

  // Level filter
  levelFilter: Set<string>;
  isFilterActive: boolean;
  showLevelLabels: boolean;
  onToggleLevelFilter(level: string): void;

  // Card-open tracking
  flipped: Set<string>;
  closeOpenCard: React.RefObject<(() => void) | null>;
  onCardOpen(close: () => void): void;

  selection: WordListSelectionProps;
  reorder: WordListReorderProps;
  actions: WordListActionsProps;

  menuBtnRef: React.RefObject<View | null>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WordListScreen({
  pal, themeColor, isSubscribed, isPremium = false, hasTextToSpeechHistory = false,
  scrollY, deepSeaSkin,
  currentFolder, folderCards, filteredFolderCards,
  showFullCard, verticalFlip, notificationsEnabled,
  cardViewMode, onToggleViewMode, currentWordId, onCurrentWordChange,
  levelFilter, isFilterActive, showLevelLabels, onToggleLevelFilter,
  flipped, closeOpenCard, onCardOpen,
  selection, reorder, actions,
  menuBtnRef,
}: WordListScreenProps) {
  const t = useLang();
  const actionsRef = useRef(actions);
  const selectionRef = useRef(selection);
  const reorderRef = useRef(reorder);
  const folderCardsRef = useRef(folderCards);
  const onCardOpenRef = useRef(onCardOpen);
  actionsRef.current = actions;
  selectionRef.current = selection;
  reorderRef.current = reorder;
  folderCardsRef.current = folderCards;
  onCardOpenRef.current = onCardOpen;
  const [horizontalSwipeLocked, setHorizontalSwipeLocked] = useState(false);
  const horizontalSwipeLockedRef = useRef(false);
  const verticalGestureLockedRef = useRef(false);

  const handleGestureStart = useCallback(() => {
    verticalGestureLockedRef.current = false;
    horizontalSwipeLockedRef.current = false;
    setHorizontalSwipeLocked(false);
  }, []);

  const handleHorizontalSwipeLockChange = useCallback((locked: boolean) => {
    if (locked && verticalGestureLockedRef.current) return;
    horizontalSwipeLockedRef.current = locked;
    setHorizontalSwipeLocked(locked);
  }, []);

  const handleVerticalGestureLock = useCallback(() => {
    if (!horizontalSwipeLockedRef.current) verticalGestureLockedRef.current = true;
  }, []);

  const isVerticalGestureLocked = useCallback(() => verticalGestureLockedRef.current, []);

  // ── Scrollbar (no React state on scroll — Animated.event drives everything) ──

  // Animated scroll position for the scrollbar thumb — tracks on native thread.
  const listScrollAnim = useRef(new Animated.Value(0)).current;
  // Fade animated value — controlled by show/hide callbacks below.
  const listFadeAnim   = useRef(new Animated.Value(0)).current;
  // Press animation widens only the visible thumb; the normal 3pt width is unchanged.
  const scrollbarShapeAnim = useRef(new Animated.Value(0)).current;
  // Timer ref for the auto-hide delay.
  const listFadeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fastScrollLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listScrollOffsetRef = useRef(0);
  const listScrollToOffsetRef = useRef<((offset: number) => void) | null>(null);
  const listScrollToIndexRef = useRef<((index: number) => void) | null>(null);
  const listContainerRef = useRef<View>(null);
  const listContainerBoundsRef = useRef({ pageX: 0, pageY: 0, width: 0, height: 0 });
  const scrollbarVisibleRef = useRef(false);
  const scrollbarPressingRef = useRef(false);
  const scrollbarDraggingRef = useRef(false);
  const scrollbarActiveRef = useRef(false);
  const fastScrollCandidateRef = useRef(false);
  const fastScrollLongPressedRef = useRef(false);
  const fastScrollStartPageYRef = useRef(0);
  const fastScrollGrabOffsetRef = useRef(0);
  const suppressWordItemActionUntilRef = useRef(0);
  const currentWordIndexRef = useRef(0);
  const currentWordIdRef = useRef<string | null>(currentWordId);
  const topVisibleWordIdRef = useRef<string | null>(null);
  const previousDisplayedCardsRef = useRef(filteredFolderCards);
  const cardViewModeRef = useRef(cardViewMode);
  const reorderActiveRef = useRef(reorder.active);
  const isRestoringListPositionRef = useRef(false);
  const restoreTargetWordIdRef = useRef<string | null>(null);
  const restoreTargetIndexRef = useRef(-1);
  const [preparedListPosition, setPreparedListPosition] = useState<{
    id: string;
    index: number;
  } | null>(null);
  const preparedListPositionRef = useRef(preparedListPosition);
  // The layer the user is actually looking at, recorded after commit. Only a
  // layer that is already on screen is allowed to cover a mode change.
  const visibleLayerRef = useRef<'list' | 'flip' | null>(null);
  const trackedFolderIdRef = useRef(currentFolder?.id ?? null);
  cardViewModeRef.current = cardViewMode;
  reorderActiveRef.current = reorder.active;
  preparedListPositionRef.current = preparedListPosition;

  if (trackedFolderIdRef.current !== (currentFolder?.id ?? null)) {
    trackedFolderIdRef.current = currentFolder?.id ?? null;
    currentWordIndexRef.current = 0;
    topVisibleWordIdRef.current = null;
    previousDisplayedCardsRef.current = filteredFolderCards;
    isRestoringListPositionRef.current = false;
    restoreTargetWordIdRef.current = null;
    restoreTargetIndexRef.current = -1;
    // A different folder is a fresh screen: nothing from the previous one is on
    // display, so the previous folder's Flip must not cover this folder's list.
    visibleLayerRef.current = null;
  }

  const resolvedCurrentWordIndex = resolveCurrentWordIndex(
    filteredFolderCards,
    currentWordId,
    currentWordIndexRef.current,
    previousDisplayedCardsRef.current,
  );
  const resolvedCurrentWordId = resolvedCurrentWordIndex >= 0
    ? filteredFolderCards[resolvedCurrentWordIndex]?.id ?? null
    : null;
  const initialListPositionRef = useRef({
    folderId: currentFolder?.id ?? null,
    index: Math.max(0, resolvedCurrentWordIndex),
  });
  if (initialListPositionRef.current.folderId !== (currentFolder?.id ?? null)) {
    initialListPositionRef.current = {
      folderId: currentFolder?.id ?? null,
      index: Math.max(0, resolvedCurrentWordIndex),
    };
  }
  currentWordIndexRef.current = Math.max(0, resolvedCurrentWordIndex);
  currentWordIdRef.current = resolvedCurrentWordId;

  const listPositionPrepared = resolvedCurrentWordId === null
    || (preparedListPosition?.id === resolvedCurrentWordId
      && preparedListPosition.index === resolvedCurrentWordIndex);

  // Both mode layers stay mounted; this decides visibility only. See modeLayers.ts
  // for the rule — in short, Flip is a destination and never a loading placeholder.
  const layerVisibility = resolveModeLayers({
    cardViewMode,
    reorderActive: reorder.active,
    listPositionPrepared,
    visibleLayer: visibleLayerRef.current,
  });
  const { showListLayer, showFlipLayer } = layerVisibility;
  // An empty folder renders the empty state instead of either layer, so neither
  // was really on screen and neither may hold it later.
  const hasCards = folderCards.length > 0;

  useEffect(() => {
    visibleLayerRef.current = hasCards
      ? committedLayer({ showListLayer, showFlipLayer })
      : null;
  }, [hasCards, showListLayer, showFlipLayer]);

  // Layout dimensions — only updated on resize, not on every scroll event.
  const [listContentH, setListContentH] = useState(0);
  const [listViewH,    setListViewH]    = useState(0);

  // Refs that let the stable scroll event handler read the latest prop values.
  const deepSeaSkinRef   = useRef(deepSeaSkin);
  const deepSeaScrollRef = useRef(scrollY);
  deepSeaSkinRef.current   = deepSeaSkin;
  deepSeaScrollRef.current = scrollY;

  // The header label owns its state and is set imperatively, so a new top visible row
  // repaints that one line rather than this whole screen mid scroll.
  const positionLabelRef = useRef<WordListPositionLabelHandle>(null);
  const markListPositionPrepared = useCallback((cardId: string, index: number) => {
    const next = { id: cardId, index };
    preparedListPositionRef.current = next;
    setPreparedListPosition(previous => previous?.id === cardId && previous.index === index
      ? previous
      : next);
  }, []);

  const handleTopVisibleCardChange = useCallback((cardId: string, index: number) => {
    topVisibleWordIdRef.current = cardId;

    if (isRestoringListPositionRef.current) {
      if (restoreTargetWordIdRef.current !== cardId
          || restoreTargetIndexRef.current !== index) return;
      isRestoringListPositionRef.current = false;
      restoreTargetWordIdRef.current = null;
      restoreTargetIndexRef.current = -1;
    }

    markListPositionPrepared(cardId, index);
    // The hidden list may report viewability while Flip owns the screen. Only the
    // visible list is allowed to choose a new shared current word.
    if (cardViewModeRef.current !== 'list' && !reorderActiveRef.current) return;
    currentWordIndexRef.current = index;
    currentWordIdRef.current = cardId;
    positionLabelRef.current?.setCurrentVisibleIndex(index + 1);
    onCurrentWordChange(cardId);
  }, [markListPositionPrepared, onCurrentWordChange]);

  useEffect(() => {
    if (currentWordId !== resolvedCurrentWordId) {
      onCurrentWordChange(resolvedCurrentWordId);
    }
  }, [currentWordId, onCurrentWordChange, resolvedCurrentWordId]);

  useEffect(() => {
    previousDisplayedCardsRef.current = filteredFolderCards;
  }, [filteredFolderCards]);

  // Both modes stay mounted. Position the hidden list before it can become visible;
  // viewability confirms the exact stable ID/index before the layer is revealed.
  useLayoutEffect(() => {
    if (reorder.active || resolvedCurrentWordId === null || resolvedCurrentWordIndex < 0) {
      isRestoringListPositionRef.current = false;
      restoreTargetWordIdRef.current = null;
      restoreTargetIndexRef.current = -1;
      return;
    }
    const prepared = preparedListPositionRef.current;
    if (prepared?.id === resolvedCurrentWordId
        && prepared.index === resolvedCurrentWordIndex) return;
    if (restoreTargetWordIdRef.current === resolvedCurrentWordId
        && restoreTargetIndexRef.current === resolvedCurrentWordIndex) return;

    isRestoringListPositionRef.current = true;
    restoreTargetWordIdRef.current = resolvedCurrentWordId;
    restoreTargetIndexRef.current = resolvedCurrentWordIndex;
    listScrollToIndexRef.current?.(resolvedCurrentWordIndex);
  }, [reorder.active, resolvedCurrentWordId, resolvedCurrentWordIndex]);

  const handleToggleViewMode = useCallback(() => {
    if (cardViewMode === 'list') {
      const topWordId = topVisibleWordIdRef.current ?? currentWordIdRef.current;
      if (topWordId) {
        currentWordIdRef.current = topWordId;
        onCurrentWordChange(topWordId);
      }
      // Freeze any native momentum before the list becomes non-interactive and hidden.
      listScrollToOffsetRef.current?.(listScrollOffsetRef.current);
    }
    onToggleViewMode();
  }, [cardViewMode, onCurrentWordChange, onToggleViewMode]);

  // listScrollAnim is fed by the list's native-driven Animated.event, so the scrollbar
  // thumb tracks the finger even while rows are rendering. This JS listener only feeds
  // the Deep Sea parallax and the label's at-top state.
  const atTopRef = useRef(true);
  const handleListScroll = useCallback((offset: number) => {
    listScrollOffsetRef.current = offset;
    if (deepSeaSkinRef.current) deepSeaScrollRef.current.setValue(offset);
    // Keep the existing word-count summary only while the first row is at the top.
    const atTop = offset <= LIST_TOP_EPSILON;
    if (atTop !== atTopRef.current) {
      atTopRef.current = atTop;
      positionLabelRef.current?.setAtTop(atTop);
    }
  }, []);

  // Show the scrollbar thumb immediately.
  const showScrollbar = useCallback(() => {
    if (listFadeTimer.current) clearTimeout(listFadeTimer.current);
    scrollbarVisibleRef.current = true;
    Animated.timing(listFadeAnim, { toValue: 0.55, duration: 80, useNativeDriver: true }).start();
  }, [listFadeAnim]);

  // Schedule the thumb to fade out after scrolling stops.
  const scheduleHideScrollbar = useCallback(() => {
    if (listFadeTimer.current) clearTimeout(listFadeTimer.current);
    listFadeTimer.current = setTimeout(() => {
      if (scrollbarPressingRef.current || scrollbarDraggingRef.current) return;
      Animated.timing(listFadeAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(({ finished }) => {
          if (finished && !scrollbarPressingRef.current && !scrollbarDraggingRef.current) {
            scrollbarVisibleRef.current = false;
          }
        });
    }, 900);
  }, [listFadeAnim]);

  const measureListContainer = useCallback(() => {
    listContainerRef.current?.measureInWindow((pageX, pageY, width, height) => {
      listContainerBoundsRef.current = { pageX, pageY, width, height };
    });
  }, []);

  const clearFastScrollLongPressTimer = useCallback(() => {
    if (!fastScrollLongPressTimer.current) return;
    clearTimeout(fastScrollLongPressTimer.current);
    fastScrollLongPressTimer.current = null;
  }, []);

  const animateScrollbarActive = useCallback((active: boolean) => {
    scrollbarActiveRef.current = active;
    scrollbarShapeAnim.stopAnimation();
    Animated.timing(scrollbarShapeAnim, {
      toValue: active ? 1 : 0,
      duration: active ? 90 : 130,
      // Width and radius are layout properties, so this brief state transition stays
      // on JS; scroll-position animation itself remains native-driven.
      useNativeDriver: false,
    }).start();
  }, [scrollbarShapeAnim]);

  const finishFastScrollGesture = useCallback(() => {
    if (scrollbarActiveRef.current || fastScrollLongPressedRef.current) {
      suppressWordItemActionUntilRef.current = Date.now() + 250;
    }
    clearFastScrollLongPressTimer();
    fastScrollCandidateRef.current = false;
    fastScrollLongPressedRef.current = false;
    scrollbarPressingRef.current = false;
    scrollbarDraggingRef.current = false;
    animateScrollbarActive(false);
    verticalGestureLockedRef.current = false;
    scheduleHideScrollbar();
  }, [animateScrollbarActive, clearFastScrollLongPressTimer, scheduleHideScrollbar]);

  const isFastScrollGesture = useCallback(
    () => fastScrollCandidateRef.current
      || scrollbarActiveRef.current
      || Date.now() < suppressWordItemActionUntilRef.current,
    [],
  );

  const handleFastScrollMove = useCallback((pageY: number) => {
    const { pageY: containerPageY } = listContainerBoundsRef.current;
    const metrics = getScrollBarMetrics(listContentH, listViewH);
    if (!metrics.show || metrics.maxTravel <= 0 || metrics.maxScroll <= 0) return;

    const offset = getScrollOffsetForThumb(
      pageY,
      containerPageY,
      fastScrollGrabOffsetRef.current,
      metrics,
    );

    // FlatList applies the matching non-animated offset; its native scroll event drives
    // the thumb, preserving the existing no-JS-updates-on-scroll performance path.
    listScrollOffsetRef.current = offset;
    handleListScroll(offset);
    listScrollToOffsetRef.current?.(offset);
  }, [handleListScroll, listContentH, listViewH]);

  const fastScrollPanResponder = useMemo(() => {
    const cancelCandidate = () => {
      clearFastScrollLongPressTimer();
      fastScrollCandidateRef.current = false;
      fastScrollLongPressedRef.current = false;
      scrollbarPressingRef.current = false;
      animateScrollbarActive(false);
      scheduleHideScrollbar();
    };

    const shouldClaimMove = (
      _event: unknown,
      gesture: { dx: number; dy: number; moveX: number },
    ) => {
      if (!fastScrollCandidateRef.current) return false;
      if (!fastScrollLongPressedRef.current) {
        if (Math.abs(gesture.dx) > FAST_SCROLL_MOVE_SLOP || Math.abs(gesture.dy) > FAST_SCROLL_MOVE_SLOP) {
          cancelCandidate();
        }
        return false;
      }
      const bounds = listContainerBoundsRef.current;
      const rightEdge = bounds.pageX + bounds.width;
      const insideActiveGrabZone = gesture.moveX >= rightEdge - FAST_SCROLL_ACTIVE_TOUCH_WIDTH
        && gesture.moveX <= rightEdge;
      if (!insideActiveGrabZone
          && Math.abs(gesture.dx) > Math.abs(gesture.dy)
          && Math.abs(gesture.dx) > FAST_SCROLL_MOVE_SLOP) {
        cancelCandidate();
        return false;
      }
      return Math.abs(gesture.dy) >= 1 || (insideActiveGrabZone && Math.abs(gesture.dx) >= 1);
    };

    return PanResponder.create({
      onStartShouldSetPanResponderCapture: (event) => {
        clearFastScrollLongPressTimer();
        fastScrollCandidateRef.current = false;
        fastScrollLongPressedRef.current = false;

        const { pageX, pageY } = event.nativeEvent;

        const bounds = listContainerBoundsRef.current;
        const metrics = getScrollBarMetrics(listContentH, listViewH);
        if (!scrollbarVisibleRef.current || !metrics.show || bounds.width <= 0) return false;

        const offset = Math.max(0, Math.min(metrics.maxScroll, listScrollOffsetRef.current));
        const thumbTop = metrics.maxScroll > 0
          ? (offset / metrics.maxScroll) * metrics.maxTravel
          : 0;
        const withinHorizontalTarget = pageX >= bounds.pageX + bounds.width - FAST_SCROLL_TOUCH_WIDTH
          && pageX <= bounds.pageX + bounds.width;
        const withinVerticalTarget = pageY >= bounds.pageY + thumbTop - FAST_SCROLL_VERTICAL_HIT_SLOP
          && pageY <= bounds.pageY + thumbTop + metrics.thumbH + FAST_SCROLL_VERTICAL_HIT_SLOP;
        if (!withinHorizontalTarget || !withinVerticalTarget) return false;

        fastScrollCandidateRef.current = true;
        scrollbarPressingRef.current = true;
        fastScrollStartPageYRef.current = pageY;
        fastScrollGrabOffsetRef.current = pageY - bounds.pageY - thumbTop;
        // Stop any active momentum at its current position before measuring the grab.
        listScrollToOffsetRef.current?.(offset);
        showScrollbar();

        fastScrollLongPressTimer.current = setTimeout(() => {
          if (!fastScrollCandidateRef.current) return;
          const latestMetrics = getScrollBarMetrics(listContentH, listViewH);
          const latestOffset = Math.max(
            0,
            Math.min(latestMetrics.maxScroll, listScrollOffsetRef.current),
          );
          const latestThumbTop = latestMetrics.maxScroll > 0
            ? (latestOffset / latestMetrics.maxScroll) * latestMetrics.maxTravel
            : 0;
          fastScrollGrabOffsetRef.current = fastScrollStartPageYRef.current
            - listContainerBoundsRef.current.pageY
            - latestThumbTop;
          fastScrollLongPressedRef.current = true;
          verticalGestureLockedRef.current = true;
          closeOpenCard.current?.();
          animateScrollbarActive(true);
          showScrollbar();
        }, FAST_SCROLL_LONG_PRESS_MS);
        return false;
      },
      onMoveShouldSetPanResponderCapture: shouldClaimMove,
      onMoveShouldSetPanResponder: shouldClaimMove,
      onPanResponderGrant: () => {
        scrollbarDraggingRef.current = true;
        verticalGestureLockedRef.current = true;
        closeOpenCard.current?.();
        showScrollbar();
      },
      onPanResponderMove: (_event, gesture) => {
        handleFastScrollMove(gesture.moveY);
      },
      onPanResponderRelease: finishFastScrollGesture,
      onPanResponderTerminate: finishFastScrollGesture,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }, [
    clearFastScrollLongPressTimer,
    closeOpenCard,
    animateScrollbarActive,
    finishFastScrollGesture,
    handleFastScrollMove,
    listContentH,
    listViewH,
    scheduleHideScrollbar,
    showScrollbar,
  ]);

  const handleFastScrollTouchEnd = useCallback(() => {
    if (scrollbarDraggingRef.current) return;
    const wasCandidate = fastScrollCandidateRef.current || scrollbarPressingRef.current;
    if (scrollbarActiveRef.current || fastScrollLongPressedRef.current) {
      suppressWordItemActionUntilRef.current = Date.now() + 250;
    }
    clearFastScrollLongPressTimer();
    fastScrollCandidateRef.current = false;
    fastScrollLongPressedRef.current = false;
    scrollbarPressingRef.current = false;
    animateScrollbarActive(false);
    if (wasCandidate) scheduleHideScrollbar();
  }, [animateScrollbarActive, clearFastScrollLongPressTimer, scheduleHideScrollbar]);

  const handleScrollBeginDrag = useCallback(() => {
    isRestoringListPositionRef.current = false;
    restoreTargetWordIdRef.current = null;
    restoreTargetIndexRef.current = -1;
    if (!horizontalSwipeLockedRef.current) verticalGestureLockedRef.current = true;
    closeOpenCard.current?.();
    showScrollbar();
  }, [showScrollbar]);

  // onScrollEndDrag fires before onMomentumScrollBegin — schedule hide and let
  // handleMomentumScrollBegin cancel it if a momentum scroll follows.
  const handleScrollEndDrag     = useCallback(() => {
    verticalGestureLockedRef.current = false;
    scheduleHideScrollbar();
  }, [scheduleHideScrollbar]);
  const handleMomentumScrollBegin = useCallback(() => { showScrollbar(); },          [showScrollbar]);
  const handleMomentumScrollEnd   = useCallback(() => { scheduleHideScrollbar(); }, [scheduleHideScrollbar]);

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (listFadeTimer.current) clearTimeout(listFadeTimer.current);
    if (fastScrollLongPressTimer.current) clearTimeout(fastScrollLongPressTimer.current);
    scrollbarShapeAnim.stopAnimation();
  }, [scrollbarShapeAnim]);

  const renderWordCard = useCallback((
    item: WordCard,
    reorderMode = false,
    reorderHandle?: React.ReactNode,
  ) => {
    const currentActions = actionsRef.current;
    const currentSelection = selectionRef.current;
    return (
      <SwipeableCard
        item={item}
        isFlipped={flipped.has(item.id)}
        themeColor={themeColor}
        pal={pal}
        voiceLocked={false}
        isSubscribed={isSubscribed}
        onFlip={() => currentActions.onFlip(item.id)}
        onEdit={() => currentActions.onEdit(item)}
        onDelete={() => currentActions.onDelete(item.id)}
        onMove={() => currentActions.onMove([item.id])}
        onToggleNotif={() => currentActions.onToggleNotif(item.id)}
        onVoiceLocked={currentActions.onVoiceLocked}
        onCustomVoiceLocked={currentActions.onCustomVoiceLocked}
        isPremium={isPremium}
        onOpen={onCardOpenRef.current}
        openCardRef={closeOpenCard}
        selectionMode={reorderMode ? false : currentSelection.active}
        selected={currentSelection.selectedIds.has(item.id)}
        onToggleSelect={() => currentSelection.onToggle(item.id)}
        showLevelLabel={showLevelLabels}
        onHorizontalSwipeLockChange={handleHorizontalSwipeLockChange}
        onGestureStart={handleGestureStart}
        onVerticalGestureLock={handleVerticalGestureLock}
        isVerticalGestureLocked={isVerticalGestureLocked}
        isFastScrollGesture={isFastScrollGesture}
        showFullCard={showFullCard}
        reorderMode={reorderMode}
        reorderHandle={reorderHandle}
      />
    );
  }, [
    closeOpenCard,
    flipped,
    handleGestureStart,
    handleHorizontalSwipeLockChange,
    handleVerticalGestureLock,
    isFastScrollGesture,
    isPremium,
    isSubscribed,
    isVerticalGestureLocked,
    pal,
    selection.active,
    selection.selectedIds,
    showFullCard,
    showLevelLabels,
    themeColor,
  ]);

  const handleReorderVisibleCards = useCallback((reorderedVisibleCards: WordCard[]) => {
    reorderRef.current.onReorder(
      mergeVisibleCardOrder(folderCardsRef.current, reorderedVisibleCards),
    );
  }, []);
  const handleListFooterPress = useCallback(() => closeOpenCard.current?.(), [closeOpenCard]);
  const handleFlipEdit = useCallback((card: WordCard) => actionsRef.current.onEdit(card), []);
  const handleFlipDelete = useCallback((id: string) => actionsRef.current.onDelete(id), []);
  const handleFlipMove = useCallback((card: WordCard) => actionsRef.current.onMove([card.id]), []);
  const handleFlipToggleNotif = useCallback((id: string) => actionsRef.current.onToggleNotif(id), []);
  const handleCustomVoiceLocked = useCallback(() => actionsRef.current.onCustomVoiceLocked(), []);
  const handleOpenAdd = useCallback(() => actionsRef.current.onOpenAdd(), []);

  // ── Header ───────────────────────────────────────────────────────────────────
  // Memoized: these walk the whole folder on every render, including the renders a
  // scroll gesture triggers.
  const allVisibleCardsSelected = useMemo(
    () => filteredFolderCards.length > 0
      && filteredFolderCards.every(card => selection.selectedIds.has(card.id)),
    [filteredFolderCards, selection.selectedIds],
  );
  const header = (
    <View style={[s.header, wordListLayoutStyles.header]} onTouchStart={() => closeOpenCard.current?.()}>
      {selection.active ? (
        <>
          <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
            {selection.selectedIds.size} {t('selected')}
          </Text>
          <View style={reorderToolStyles.headerActions}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={selection.onSelectAll}
              accessibilityRole="button"
              accessibilityLabel={t('select_all')}
              accessibilityState={{ selected: allVisibleCardsSelected }}
            >
              <Text style={{ color: themeColor, fontSize: 16, fontWeight: '600' }}>
                {t('select_all')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={selection.onExit}>
              <Text style={{ color: themeColor, fontSize: 16, fontWeight: '600' }}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
          </View>
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
            {(isPremium || hasTextToSpeechHistory) && (
              <TouchableOpacity
                style={s.iconBtn}
                onPress={actions.onOpenTextToSpeech}
                accessibilityLabel="Text-to-Speech"
              >
                <Ionicons name="volume-high-outline" size={22} color={pal.sub} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.iconBtn} onPress={actions.onOpenNotifications}>
              <Ionicons
                name={notificationsEnabled ? 'notifications' : 'notifications-off-outline'}
                size={22}
                color={notificationsEnabled ? themeColor : pal.sub}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={handleToggleViewMode}
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

  // ── Word count / scroll position ──────────────────────────────────────────────
  // Doubles as the scroll position readout: the same line reads "350 words" at the top
  // of the list and "120 / 350" once scrolled.
  const wordCountSummary = `${
    isFilterActive
      ? `${filteredFolderCards.length} / ${folderCards.length}`
      : folderCards.length
  } ${t(folderCards.length === 1 ? 'words_singular' : 'words_plural')}`;

  const wordCount = (
    <View onTouchStart={() => closeOpenCard.current?.()}>
      <WordListPositionLabel
        ref={positionLabelRef}
        total={filteredFolderCards.length}
        topContent={wordCountSummary}
        currentIndex={resolvedCurrentWordIndex + 1}
        showCurrentPosition={cardViewMode === 'flip'}
        style={[s.wordCount, { color: pal.sub }]}
      />
    </View>
  );

  // ── Level filter bar ──────────────────────────────────────────────────────────
  // One pass over the folder produces the untested total and every chip count, instead
  // of six separate passes on each render.
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { none: 0 };
    let untested = 0;
    for (const card of folderCards) {
      const level = card.testLevel ?? 'none';
      counts[level] = (counts[level] ?? 0) + 1;
      if (!card.testLevel) untested += 1;
    }
    return { counts, untested };
  }, [folderCards]);
  const untestedCount = levelCounts.untested;
  const isTestComplete = folderCards.length > 0 && untestedCount === 0;

  // Keep this slot only when it has visible label controls or when the reorder
  // toolbar is using it. Hiding labels should restore the compact list offset.
  const filterBar = folderCards.length > 0 && !selection.active && (showLevelLabels || reorder.active) ? (
    <View
      style={[filterStyles.bar, reorder.active && filterStyles.hidden]}
      pointerEvents={reorder.active ? 'none' : 'auto'}
      onTouchStart={() => closeOpenCard.current?.()}
    >
      {showLevelLabels && (
        <>
          <View style={filterStyles.chipGroup}>
            {LEVEL_FILTER_OPTIONS.map(({ level, icon, color }) => {
              const count = levelCounts.counts[level] ?? 0;
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
        </>
      )}
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
  } else {
    const flipModeContent = (
      <FlipCardBrowser
        cards={filteredFolderCards}
        currentWordId={resolvedCurrentWordId}
        onCurrentWordChange={onCurrentWordChange}
        active={cardViewMode === 'flip' && !reorder.active}
        pal={pal}
        themeColor={themeColor}
        isSubscribed={isSubscribed}
        isPremium={isPremium}
        onCustomVoiceLocked={handleCustomVoiceLocked}
        onEdit={handleFlipEdit}
        onDelete={handleFlipDelete}
        onMove={handleFlipMove}
        onToggleNotif={handleFlipToggleNotif}
        showLevelLabel={showLevelLabels}
        verticalFlip={verticalFlip}
      />
    );
    const listModeContent = (
      <View
        ref={listContainerRef}
        style={{ flex: 1 }}
        onLayout={measureListContainer}
        onTouchEndCapture={handleFastScrollTouchEnd}
        onTouchCancel={handleFastScrollTouchEnd}
        {...fastScrollPanResponder.panHandlers}
      >
        {reorder.active && (
          <View key="reorder-toolbar" style={reorderToolStyles.toolbar}>
            <TouchableOpacity
              style={[
                reorderToolStyles.sortBtn,
                { backgroundColor: pal.card, borderColor: pal.border },
                reorder.sortDir === 'asc' && { borderColor: themeColor, backgroundColor: themeColor + '14' },
              ]}
              onPress={() => reorder.onSortByLevel('asc')}
              activeOpacity={0.85}
              accessibilityLabel={t('reorder_sort_best_first')}
            >
              <View style={[reorderToolStyles.levelCircle, { backgroundColor: LEVEL_HIGH_COLOR }]} />
              <Text style={[reorderToolStyles.sortArrow, { color: pal.sub }]}>→</Text>
              <Text
                style={[reorderToolStyles.btnText, { color: reorder.sortDir === 'asc' ? themeColor : pal.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.58}
              >
                {t('reorder_sort_best_first')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                reorderToolStyles.sortBtn,
                { backgroundColor: pal.card, borderColor: pal.border },
                reorder.sortDir === 'desc' && { borderColor: themeColor, backgroundColor: themeColor + '14' },
              ]}
              onPress={() => reorder.onSortByLevel('desc')}
              activeOpacity={0.85}
              accessibilityLabel={t('reorder_sort_least_first')}
            >
              <View style={[reorderToolStyles.levelCircle, { backgroundColor: LEVEL_LOW_COLOR }]} />
              <Text style={[reorderToolStyles.sortArrow, { color: pal.sub }]}>→</Text>
              <Text
                style={[reorderToolStyles.btnText, { color: reorder.sortDir === 'desc' ? themeColor : pal.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.58}
              >
                {t('reorder_sort_least_first')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                reorderToolStyles.registrationBtn,
                { backgroundColor: pal.card, borderColor: pal.border },
                reorder.sortDir === 'registration' && {
                  borderColor: themeColor,
                  backgroundColor: themeColor + '14',
                },
              ]}
              onPress={reorder.onRegistrationOrder}
              activeOpacity={0.85}
              accessibilityLabel={t('reorder_registration_order')}
              accessibilityState={{ selected: reorder.sortDir === 'registration' }}
            >
              <Ionicons
                name="list-outline"
                size={15}
                color={reorder.sortDir === 'registration' ? themeColor : pal.sub}
              />
              <Text
                style={[
                  reorderToolStyles.registrationText,
                  { color: reorder.sortDir === 'registration' ? themeColor : pal.text },
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              >
                {t('reorder_registration_order')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <ReorderableList
          key="persistent-word-list"
          cards={filteredFolderCards}
          onReorder={handleReorderVisibleCards}
          pal={pal}
          reorderEnabled={reorder.active}
          extraPaddingBottom={
            (isSubscribed ? 0 : AD_BANNER_HEIGHT)
              + (selection.active ? SEL_BAR_H : 0)
              + FAB_LIST_EXTRA_CLEARANCE
          }
          showLevelLabel={showLevelLabels}
          renderWordCard={renderWordCard}
          scrollEnabled={reorder.active || !horizontalSwipeLocked}
          scrollAnim={listScrollAnim}
          onTopVisibleCardChange={handleTopVisibleCardChange}
          onScrollOffsetChange={handleListScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollBegin={handleMomentumScrollBegin}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onContentHeightChange={setListContentH}
          onViewportHeightChange={setListViewH}
          onFooterPress={handleListFooterPress}
          scrollToOffsetRef={listScrollToOffsetRef}
          scrollToIndexRef={listScrollToIndexRef}
          initialScrollIndex={initialListPositionRef.current.index}
        />
        {!reorder.active && (
          <ScrollBar
            key="word-list-scrollbar"
            scrollAnim={listScrollAnim}
            contentH={listContentH}
            viewH={listViewH}
            fadeAnim={listFadeAnim}
            shapeAnim={scrollbarShapeAnim}
            color={pal.sub}
          />
        )}
      </View>
    );
    cardContent = (
      <View style={modeLayerStyles.stack}>
        <View
          style={[
            modeLayerStyles.layer,
            showListLayer ? modeLayerStyles.visible : modeLayerStyles.hidden,
          ]}
          pointerEvents={showListLayer ? 'auto' : 'none'}
          accessibilityElementsHidden={!showListLayer}
          importantForAccessibility={showListLayer ? 'auto' : 'no-hide-descendants'}
        >
          {listModeContent}
        </View>
        <View
          style={[
            modeLayerStyles.layer,
            showFlipLayer ? modeLayerStyles.visible : modeLayerStyles.hidden,
          ]}
          pointerEvents={showFlipLayer && cardViewMode === 'flip' ? 'auto' : 'none'}
          accessibilityElementsHidden={!showFlipLayer || cardViewMode !== 'flip'}
          importantForAccessibility={showFlipLayer && cardViewMode === 'flip'
            ? 'auto'
            : 'no-hide-descendants'}
        >
          {flipModeContent}
        </View>
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
      onPress={handleOpenAdd}
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
      {fab ? (
        <View style={fabOverlayStyles.root} pointerEvents="box-none">
          {fab}
        </View>
      ) : null}
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

const wordListLayoutStyles = StyleSheet.create({
  // Normal, selection, and reorder headers contain different controls, but the
  // list must always begin at the same screen coordinate when modes change.
  header: { height: 50 },
});

const modeLayerStyles = StyleSheet.create({
  stack: { flex: 1 },
  layer: { ...StyleSheet.absoluteFillObject },
  visible: { opacity: 1, zIndex: 1 },
  hidden: { opacity: 0, zIndex: 0 },
});

const fabOverlayStyles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
});

const filterStyles = StyleSheet.create({
  bar: {
    height: 50,
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
  hidden: { opacity: 0 },
});

const reorderToolStyles = StyleSheet.create({
  toolbar: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: -46,
    zIndex: 5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 10,
  },
  registrationBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
  },
  registrationText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
  },
  // Direction sort pills — colored level circle → arrow → label.
  sortBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  levelCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sortArrow: {
    fontSize: 14,
    fontWeight: '700',
    marginHorizontal: -1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btnText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
