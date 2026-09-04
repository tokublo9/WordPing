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
import {
  LEVEL_FILTER_OPTIONS,
  type LevelFilterKey,
} from '../../features/cards/levels';
import { matchesResultFilter } from '../../features/cards/testSchedule';
import {
  RESULT_COLOR_FILTERS,
  isResultColorFilter,
  type ResultColorFilter,
} from '../../features/cards/resultFilterCopy';
import { ResultFilterExplanationDialog } from '../../components/ResultFilterExplanationDialog';
import { ResultWordsSheet } from '../../components/ResultWordsSheet';
import { appNow } from '../../lib/appClock';
import { useReduceMotion } from '../../hooks/useReduceMotion';
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
import { resolveWordListEmptyState } from '../../features/cards/emptyState';
import { TEXT_TO_SPEECH_ENABLED } from '../../features/flags';

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
const FILTER_BORDER_WIDTH = 1;
const CHIP_PADDING_V = 6;
// The result-count flash. Short enough not to sit under the next answer, long
// enough to be seen while the eye is still on the card that was just graded.
const CHIP_FLASH_IN_MS = 130;
const CHIP_FLASH_OUT_MS = 420;
// Peak of the flash: the chip fills with its own colour and swells slightly.
const CHIP_FLASH_TINT_OPACITY = 0.3;
const CHIP_FLASH_SCALE = 1.22;
// ReorderableList already reserves 100pt. This extra clearance keeps its final row
// above the 58pt add button at the existing 48pt bottom offset.
const FAB_LIST_EXTRA_CLEARANCE = 32;

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
  /** Adds every selected word to its folder's notification list, or removes them. */
  onSetNotifCandidate(candidate: boolean): void;
  onMoveSelected(): void;
  onDelete(): void;
}

export interface WordListReorderProps {
  active: boolean;
  sortDir: 'registration' | 'random' | null;
  onRegistrationOrder(): void;
  onRandomOrder(): void;
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
  /** Flip Mode's Move button and the selection bar. The word rows no longer offer it. */
  onMove(ids: string[]): void;
  /** Flip Mode's notification button. The word rows no longer offer it. */
  onToggleNotif(id: string): void;
  /** The swipe / long-press Hide Front Word action on a word row. */
  onToggleHideWord(id: string): void;
  /** Bulk delete, used by the result sheet. Deletes and nothing else. */
  onDeleteWords(ids: string[]): void;
  onVoiceLocked(): void;
  onOpenAdd(): void;
}

export interface WordListScreenProps {
  pal: Palette;
  themeColor: string;
  isSubscribed: boolean;
  isPremium?: boolean;
  /** The plan includes High-Quality AI Voice — Premium only. */
  canUseAIVoice?: boolean;
  hasTextToSpeechHistory?: boolean;

  // Deep Sea skin scroll animation
  scrollY: Animated.Value;
  deepSeaSkin: boolean;

  // Folder / data
  currentFolder: Folder | null;
  /** All existing cards in the folder, including sync-hidden result cards. */
  allFolderCards: WordCard[];
  visibleFolderCards: WordCard[];
  showFullCard: boolean;
  verticalFlip: boolean;
  notificationsEnabled: boolean;
  cardViewMode: 'list' | 'flip';
  onChangeViewMode(mode: 'list' | 'flip'): void;
  /** Lets the Settings control reuse the list-position handoff before changing mode. */
  viewModeChangeRef: { current: ((mode: 'list' | 'flip') => void) | null };
  currentWordId: string | null;
  onCurrentWordChange(id: string | null): void;

  // Level filter
  /**
   * Whether the result-colour chips may be shown at all.
   *
   * False for a user who has never answered a card in Test Mode: the colours
   * categorise test results, and before there are any the chips would be four
   * inert controls with nothing to explain them. The whole group is left out
   * rather than disabled, so no empty spacing is left behind.
   */
  showResultFilters: boolean;
  showLevelLabels: boolean;
  /**
   * How many words sit under each chip, taken at the current time by the hook
   * that owns the clock. Never counted here: a reading taken during render
   * would go stale the moment a waiting interval elapsed, which is exactly when
   * a word moves from its colour into grey.
   */
  levelCounts: Record<LevelFilterKey, number>;

  // Card-open tracking
  flipped: Set<string>;
  closeOpenCard: React.RefObject<(() => void) | null>;
  onCardOpen(close: () => void): void;

  selection: WordListSelectionProps;
  reorder: WordListReorderProps;
  actions: WordListActionsProps;

  /**
   * Test Mode is a third card-area mode, not a sheet. `content` is the Test
   * screen itself; it stays mounted for as long as `active` is true, so the
   * session, its progress and its answers survive every unrelated re-render.
   * List and Flip stay mounted underneath, which is what lets exiting return to
   * whichever of them the user was on, at the position they left it.
   */
  testMode: {
    active: boolean;
    content: React.ReactNode;
    onQuit(): void;
  };

  menuBtnRef: React.RefObject<View | null>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WordListScreen({
  pal, themeColor, isSubscribed, isPremium = false,
  canUseAIVoice = false,
  hasTextToSpeechHistory = false,
  scrollY, deepSeaSkin,
  currentFolder, allFolderCards, visibleFolderCards,
  showFullCard, verticalFlip, notificationsEnabled,
  cardViewMode, onChangeViewMode, viewModeChangeRef, currentWordId, onCurrentWordChange,
  showResultFilters, showLevelLabels, levelCounts,
  flipped, closeOpenCard, onCardOpen,
  selection, reorder, actions, testMode,
  menuBtnRef,
}: WordListScreenProps) {
  const t = useLang();
  // Selection and reorder own the whole card area when they run, so Test Mode
  // steps aside for them — by being hidden, never by being unmounted, or the
  // session would be lost to a menu tap.
  const showTestLayer = testMode.active && !selection.active && !reorder.active;
  const actionsRef = useRef(actions);
  const selectionRef = useRef(selection);
  const reorderRef = useRef(reorder);
  const allFolderCardsRef = useRef(allFolderCards);
  const onCardOpenRef = useRef(onCardOpen);
  actionsRef.current = actions;
  selectionRef.current = selection;
  reorderRef.current = reorder;
  allFolderCardsRef.current = allFolderCards;
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
  const previousDisplayedCardsRef = useRef(visibleFolderCards);
  const cardViewModeRef = useRef(cardViewMode);
  const reorderActiveRef = useRef(reorder.active);
  const isRestoringListPositionRef = useRef(false);
  const restoreTargetWordIdRef = useRef<string | null>(null);
  const restoreTargetIndexRef = useRef(-1);
  const [preparedListPosition, setPreparedListPosition] = useState<{
    id: string;
    index: number;
  } | null>(null);
  const [preparedFlipPosition, setPreparedFlipPosition] = useState<{
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
    previousDisplayedCardsRef.current = visibleFolderCards;
    isRestoringListPositionRef.current = false;
    restoreTargetWordIdRef.current = null;
    restoreTargetIndexRef.current = -1;
    // A different folder is a fresh screen: nothing from the previous one is on
    // display, so the previous folder's Flip must not cover this folder's list.
    visibleLayerRef.current = null;
  }

  const resolvedCurrentWordIndex = resolveCurrentWordIndex(
    visibleFolderCards,
    currentWordId,
    currentWordIndexRef.current,
    previousDisplayedCardsRef.current,
  );
  const resolvedCurrentWordId = resolvedCurrentWordIndex >= 0
    ? visibleFolderCards[resolvedCurrentWordIndex]?.id ?? null
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
  const flipPositionPrepared = resolvedCurrentWordId === null
    || (preparedFlipPosition?.id === resolvedCurrentWordId
      && preparedFlipPosition.index === resolvedCurrentWordIndex);

  // Both mode layers stay mounted; this decides visibility only. See modeLayers.ts
  // for the rule — in short, Flip is a destination and never a loading placeholder.
  const layerVisibility = resolveModeLayers({
    cardViewMode,
    reorderActive: reorder.active,
    listPositionPrepared,
    flipPositionPrepared,
    visibleLayer: visibleLayerRef.current,
  });
  const { showListLayer, showFlipLayer } = layerVisibility;
  // An empty folder renders the empty state instead of either layer, so neither
  // was really on screen and neither may hold it later.
  const hasCards = visibleFolderCards.length > 0;

  useLayoutEffect(() => {
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
  const markFlipPositionPrepared = useCallback((cardId: string, index: number) => {
    setPreparedFlipPosition(previous => previous?.id === cardId && previous.index === index
      ? previous
      : { id: cardId, index });
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
    previousDisplayedCardsRef.current = visibleFolderCards;
  }, [visibleFolderCards]);

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

  const handleViewModeChange = useCallback((nextMode: 'list' | 'flip') => {
    if (cardViewMode === 'list' && nextMode === 'flip') {
      const topWordId = topVisibleWordIdRef.current ?? currentWordIdRef.current;
      if (topWordId) {
        currentWordIdRef.current = topWordId;
        onCurrentWordChange(topWordId);
      }
      // Freeze any native momentum before the list becomes non-interactive and hidden.
      listScrollToOffsetRef.current?.(listScrollOffsetRef.current);
    }
    onChangeViewMode(nextMode);
  }, [cardViewMode, onChangeViewMode, onCurrentWordChange]);

  useLayoutEffect(() => {
    viewModeChangeRef.current = handleViewModeChange;
    return () => {
      if (viewModeChangeRef.current === handleViewModeChange) {
        viewModeChangeRef.current = null;
      }
    };
  }, [handleViewModeChange, viewModeChangeRef]);

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
        canUseAIVoice={canUseAIVoice}
        onFlip={() => currentActions.onFlip(item.id)}
        onEdit={() => currentActions.onEdit(item)}
        onDelete={() => currentActions.onDelete(item.id)}
        onToggleHideWord={() => currentActions.onToggleHideWord(item.id)}
        onVoiceLocked={currentActions.onVoiceLocked}
        onOpen={onCardOpenRef.current}
        openCardRef={closeOpenCard}
        selectionMode={reorderMode ? false : currentSelection.active}
        selected={currentSelection.selectedIds.has(item.id)}
        onToggleSelect={() => currentSelection.onToggle(item.id)}
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
    canUseAIVoice,
    isVerticalGestureLocked,
    pal,
    selection.active,
    selection.selectedIds,
    showFullCard,
    themeColor,
  ]);

  const handleReorderVisibleCards = useCallback((reorderedVisibleCards: WordCard[]) => {
    reorderRef.current.onReorder(
      mergeVisibleCardOrder(allFolderCardsRef.current, reorderedVisibleCards),
    );
  }, []);
  const handleListFooterPress = useCallback(() => closeOpenCard.current?.(), [closeOpenCard]);
  const handleFlipEdit = useCallback((card: WordCard) => actionsRef.current.onEdit(card), []);
  const handleFlipDelete = useCallback((id: string) => actionsRef.current.onDelete(id), []);
  const handleFlipMove = useCallback((card: WordCard) => actionsRef.current.onMove([card.id]), []);
  const handleFlipToggleNotif = useCallback((id: string) => actionsRef.current.onToggleNotif(id), []);
  const handleOpenAdd = useCallback(() => actionsRef.current.onOpenAdd(), []);

  // Entering a test from a filtered list clears the filter and returns the list
  // to the top first, so what waits underneath is the whole folder from the
  // beginning rather than the narrow slice the user left. The queue never
  // depended on the filter — Test Mode is handed the folder's visible cards
  // either way — so this changes what the user comes back to, not what is
  // tested. Leaving a test clears nothing: the same button is the way out.
  const handleOpenTestMode = useCallback(() => {
    actionsRef.current.onOpenTestMode();
  }, []);

  // ── Header ───────────────────────────────────────────────────────────────────
  // Memoized: these walk the whole folder on every render, including the renders a
  // scroll gesture triggers.
  const allVisibleCardsSelected = useMemo(
    () => visibleFolderCards.length > 0
      && visibleFolderCards.every(card => selection.selectedIds.has(card.id)),
    [visibleFolderCards, selection.selectedIds],
  );
  // The ordinary header contents: the folder name and the three icon controls.
  const folderHeaderContent = (
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
        {TEXT_TO_SPEECH_ENABLED && (isPremium || hasTextToSpeechHistory) && (
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
        <View ref={menuBtnRef}>
          <TouchableOpacity style={s.iconBtn} onPress={actions.onOpenMenu}>
            <Ionicons name="ellipsis-vertical" size={22} color={pal.sub} />
          </TouchableOpacity>
        </View>
      </View>
    </>
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
      ) : testMode.active ? (
        /* The title remains centred while the dedicated X occupies the
           rightmost header position. Quitting only hides this mounted Test
           Mode layer; already submitted answers have been persisted. */
        <View style={testHeaderStyles.row}>
          <Text
            style={[testHeaderStyles.title, { color: pal.text }]}
            accessibilityRole="header"
          >
            TEST
          </Text>
          <TouchableOpacity
            style={[s.iconBtn, testHeaderStyles.closeButton]}
            onPress={testMode.onQuit}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Ionicons name="close" size={24} color={pal.sub} />
          </TouchableOpacity>
        </View>
      ) : (
        folderHeaderContent
      )}
    </View>
  );

  // ── Word count / scroll position ──────────────────────────────────────────────
  // At the top the line is a plain total — just how many words are in the list. The
  // same line becomes a "current / total" position readout once the list is scrolled,
  // or while browsing an explicitly selected result category. Both counts are the
  // rows actually on screen, so the summary and the readout's denominator agree.
  /** The folder's word count, as shown under the folder name. */
  const visibleWordCount = visibleFolderCards.length;
  const wordCountSummary = `${visibleWordCount} ${
    t(visibleWordCount === 1 ? 'words_singular' : 'words_plural')
  }`;

  // Whether there is more than one page to be at a position within, measured
  // rather than guessed. In List Mode that is the app's existing "the content
  // is taller than the viewport" test — the same one the scrollbar uses, so the
  // readout and the scrollbar always agree. In Flip Mode each card is a page.
  // Both recompute from live values, so adding, deleting, importing, moving or
  // filtering words updates this without any extra bookkeeping.
  const hasMultiplePages = cardViewMode === 'flip'
    ? visibleFolderCards.length > 1
    : getScrollBarMetrics(listContentH, listViewH).show;

  // Test Mode does not need the Word List total. Keep this row in the layout but
  // make it invisible and inaccessible while the test is active, so the filter
  // controls and card area do not jump when entering or leaving the mode.
  const wordCount = (
    <View
      style={testMode.active ? wordListLayoutStyles.hiddenWordCount : undefined}
      pointerEvents={testMode.active ? 'none' : 'auto'}
      accessibilityElementsHidden={testMode.active}
      importantForAccessibility={testMode.active ? 'no-hide-descendants' : 'auto'}
      onTouchStart={() => closeOpenCard.current?.()}
    >
      <WordListPositionLabel
        ref={positionLabelRef}
        total={visibleWordCount}
        topContent={wordCountSummary}
        currentIndex={resolvedCurrentWordIndex + 1}
        // The "n of m" readout existed to orient the user inside a filtered
        // slice. Nothing narrows the list now, so there is no slice to be
        // somewhere within, and the line stays the plain word count.
        showCurrentPosition={false}
        hasMultiplePages={hasMultiplePages}
        style={[s.wordCount, { color: pal.sub }]}
      />
    </View>
  );

  // ── Colour chips: explain first, then their own sheet ─────────────────────────
  // A colour is a holding area, not a view of the list, so tapping one opens its
  // explanation rather than narrowing anything. "Edit" hands the same colour to
  // the sheet, which is the only place those resting words can be acted on.
  // Grey is untouched: it is the queue, and it still filters the list directly.
  const [explainedLevel, setExplainedLevel] = useState<ResultColorFilter | null>(null);
  const [sheetLevel, setSheetLevel] = useState<ResultColorFilter | null>(null);

  const handleChipPress = useCallback((level: LevelFilterKey) => {
    if (!isResultColorFilter(level)) return;
    setExplainedLevel(level);
  }, []);

  // Called by the dialog once it is actually off screen, with the colour it was
  // showing — never while it is still dismissing.
  const openSheetForLevel = useCallback((level: ResultColorFilter) => {
    setSheetLevel(level);
  }, []);

  // The same rule the chip counted with, asked again at the moment the sheet
  // draws — so a word whose interval ran out while the popup was open is not
  // listed here as though it were still resting.
  const sheetWords = useMemo(() => {
    if (sheetLevel === null) return [];
    const now = appNow();
    return allFolderCards.filter(card => matchesResultFilter(card, sheetLevel, now));
  }, [allFolderCards, sheetLevel]);

  // ── Level filter bar ──────────────────────────────────────────────────────────
  // `levelCounts` arrives already counted, from the one place that knows when a
  // waiting interval elapses. Grey is the queue, so its count is the number of
  // words the Test button would actually put in front of the user, and a folder
  // with nothing due is a folder whose test is complete.
  const untestedCount = levelCounts.none;
  const isTestComplete = allFolderCards.length > 0 && untestedCount === 0;

  // ── Result-count flash ────────────────────────────────────────────────────────
  // Answering "Pretty good", "Not really" or "Don't know" raises one of these
  // counts by one, and this row stays on screen for the whole test — so without a
  // cue the only feedback for an answer is a digit quietly changing somewhere
  // above the card. The chip that took the answer swells and fills with its own
  // colour for a moment.
  //
  // Driven by the count itself rather than by a signal from Test Mode: whatever
  // makes a category grow is the thing worth pointing at, and the screen needs no
  // new prop to know it happened. Restricted to a running test so that adding,
  // importing or restoring words — which also raise the grey untested count —
  // does not flash a chip the user was not looking at.
  const reduceMotion = useReduceMotion();
  const chipFlashRef = useRef<Record<ResultColorFilter, Animated.Value> | null>(null);
  if (chipFlashRef.current === null) {
    chipFlashRef.current = {
      good: new Animated.Value(0),
      slightly: new Animated.Value(0),
      unknown: new Animated.Value(0),
    };
  }
  const chipFlash = chipFlashRef.current;
  const prevLevelCounts = useRef(levelCounts);
  const chipFlashAnim = useRef<Animated.CompositeAnimation | null>(null);
  /**
   * The colours that took an answer during this test.
   *
   * A chip that went up keeps its colour for the rest of the session rather than
   * returning to grey when the flash fades: the row becomes a record of what the
   * session did, readable at a glance while it is still running. Each colour is
   * independent — one going up says nothing about the others.
   *
   * Held per session and cleared when the test ends, below.
   */
  const [raisedLevels, setRaisedLevels] = useState<ReadonlySet<ResultColorFilter>>(new Set());
  useEffect(() => {
    const prev = prevLevelCounts.current;
    prevLevelCounts.current = levelCounts;
    if (!testMode.active) return;
    // Only the drawn results: the due count has no chip to flash or colour.
    const risen = RESULT_COLOR_FILTERS.filter(level => levelCounts[level] > prev[level]);
    if (risen.length === 0) return;
    setRaisedLevels(current => {
      const next = new Set(current);
      for (const level of risen) next.add(level);
      return next.size === current.size ? current : next;
    });
    // Answering faster than the flash fades restarts it on the new chip rather
    // than letting two overlap at different points of the same curve.
    chipFlashAnim.current?.stop();
    chipFlashAnim.current = Animated.parallel(risen.map(level => {
      const value = chipFlash[level];
      value.setValue(0);
      return Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: CHIP_FLASH_IN_MS, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: CHIP_FLASH_OUT_MS, useNativeDriver: true }),
      ]);
    }));
    chipFlashAnim.current.start();
  }, [levelCounts, testMode.active]);
  useEffect(() => () => chipFlashAnim.current?.stop(), []);
  // Finishing and walking out are the same thing here: the session is over, so
  // the row goes back to reporting rather than recording. Leaving is the only
  // way `testMode.active` turns false, so both routes land here.
  useEffect(() => {
    if (testMode.active) return;
    setRaisedLevels(current => (current.size === 0 ? current : new Set()));
  }, [testMode.active]);

  // Keep this slot only when it has visible label controls or when the reorder
  // toolbar is using it. Hiding labels should restore the compact list offset.
  const filterBar = allFolderCards.length > 0 && !selection.active && (showLevelLabels || reorder.active) ? (
    <View
      style={[filterStyles.bar, reorder.active && filterStyles.hidden]}
      pointerEvents={reorder.active ? 'none' : 'auto'}
      onTouchStart={() => closeOpenCard.current?.()}
    >
      {showLevelLabels && (
        <>
          {/* The chips alone are conditional. The Test Mode button beside them
              is not a result filter and must stay reachable — it is how a new
              user produces the results these chips will filter by.

              The row is `space-between`, so with the chip group absent entirely
              the Test button would become the only child and slide to the left
              edge. The `false` branch keeps the same container in the same slot
              with no children: the button holds its position exactly, while
              there is nothing rendered to see, tap or focus. */}
          {showResultFilters ? (
          <View style={filterStyles.chipGroup}>
            {LEVEL_FILTER_OPTIONS.map(({ level, icon, color }) => {
              const count = levelCounts[level];
              // A colour that took an answer this session stays in its own
              // colour; everything else is neutral.
              const contentColor = raisedLevels.has(level as ResultColorFilter)
                ? color
                : '#9CA3AF';
              const accessibilityLabel = level === 'good'
                ? t('test_know_good')
                : level === 'slightly'
                ? t('test_know_slightly')
                : t('test_dont_know');
              const flash = chipFlash[level as ResultColorFilter];
              const chipContent = (
                <>
                  {/* Behind the icon and the number, so neither is tinted or
                      made harder to read at the peak of the flash. */}
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      filterStyles.chipFlash,
                      {
                        backgroundColor: color,
                        opacity: flash.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, CHIP_FLASH_TINT_OPACITY],
                        }),
                      },
                    ]}
                  />
                  {icon != null
                    ? <Ionicons name={icon as any} size={13} color={contentColor} />
                    : null
                  }
                  <Text style={[filterStyles.chipCount, { color: contentColor }]}>
                    {count}
                  </Text>
                </>
              );
              return (
                <Animated.View
                  key={level}
                  // Reduce Motion keeps the colour fill and drops the swell, so the
                  // count that changed is still marked without anything moving.
                  style={reduceMotion ? undefined : {
                    transform: [{
                      scale: flash.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, CHIP_FLASH_SCALE],
                      }),
                    }],
                  }}
                >
                  <TouchableOpacity
                    style={[filterStyles.chip, { borderColor: pal.border }]}
                    onPress={() => handleChipPress(level)}
                    // Inert during a test: opening a colour's explanation over a
                    // running test would interrupt it. Deliberately not dimmed —
                    // these counts are live while answers are being given, and
                    // the chip that just went up has to be legible.
                    disabled={testMode.active}
                    accessibilityRole="button"
                    accessibilityLabel={`${accessibilityLabel}, ${count}`}
                    accessibilityState={{ disabled: testMode.active }}
                  >
                    {chipContent}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
          ) : (
            <View
              style={filterStyles.chipGroup}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          )}
          <TouchableOpacity
            style={s.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={handleOpenTestMode}
            accessibilityRole="button"
            accessibilityLabel={
              isTestComplete
                ? 'Test complete.'
                : untestedCount > 0
                ? `Test, ${untestedCount} remaining`
                : 'Test'
            }
            // The same control enters and leaves Test Mode, exactly as the mode
            // itself is entered and left in place — there is nothing to dismiss.
            accessibilityState={{ selected: testMode.active }}
          >
            <TestStatusIcon
              cardCount={allFolderCards.length}
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
  const emptyState = resolveWordListEmptyState({
    allCardCount: allFolderCards.length,
    visibleCardCount: visibleWordCount,
  });

  let cardContent: React.ReactNode;
  if (emptyState === 'session-complete') {
    // The words are all still here — each one is inside the hide its grade set,
    // so the review is finished rather than the folder being empty.
    //
    // This is the only completion screen there is. Test Mode no longer draws one
    // of its own: finishing the last card leaves the mode, and what the user
    // lands on is this — the finished session stated once, with no button
    // between them and their word list.
    const title = t('test_complete_title');
    const hint = t('test_complete_hint');
    cardContent = (
      <View
        style={s.empty}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}. ${hint}`}
        accessibilityLiveRegion="polite"
        testID="empty-session-complete"
      >
        <View style={[emptyIconWrap, { backgroundColor: themeColor + '18' }]}>
          <Ionicons name="trophy-outline" size={40} color={themeColor} />
        </View>
        <Text style={[s.emptyTitle, { color: pal.text }]}>{title}</Text>
        <Text style={[s.emptyHint, { color: pal.sub }]}>{hint}</Text>
      </View>
    );
  } else if (emptyState === 'generic') {
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
        cards={visibleFolderCards}
        currentWordId={resolvedCurrentWordId}
        onCurrentWordChange={onCurrentWordChange}
        preparing={cardViewMode === 'flip' && !flipPositionPrepared && !reorder.active}
        onPositionPrepared={markFlipPositionPrepared}
        // During Flip → List, Flip remains the displayed layer until the hidden
        // list confirms its restored position. Keep that held layer active so
        // its reset effect cannot visibly alter it before List takes over.
        active={showFlipLayer && !reorder.active && !showTestLayer}
        pal={pal}
        themeColor={themeColor}
        canUseAIVoice={canUseAIVoice}
        onEdit={handleFlipEdit}
        onDelete={handleFlipDelete}
        onMove={handleFlipMove}
        onToggleNotif={handleFlipToggleNotif}
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
                reorderToolStyles.presetBtn,
                { backgroundColor: pal.card, borderColor: pal.border },
                reorder.sortDir === 'registration' && {
                  borderColor: themeColor,
                  backgroundColor: themeColor + '14',
                },
              ]}
              onPress={reorder.onRegistrationOrder}
              activeOpacity={0.85}
              accessibilityRole="button"
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
                  reorderToolStyles.presetText,
                  { color: reorder.sortDir === 'registration' ? themeColor : pal.text },
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              >
                {t('reorder_registration_order')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                reorderToolStyles.presetBtn,
                { backgroundColor: pal.card, borderColor: pal.border },
                reorder.sortDir === 'random' && {
                  borderColor: themeColor,
                  backgroundColor: themeColor + '14',
                },
              ]}
              onPress={reorder.onRandomOrder}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('reorder_random')}
              accessibilityState={{ selected: reorder.sortDir === 'random' }}
            >
              <Ionicons
                name="shuffle-outline"
                size={15}
                color={reorder.sortDir === 'random' ? themeColor : pal.sub}
              />
              <Text
                style={[
                  reorderToolStyles.presetText,
                  { color: reorder.sortDir === 'random' ? themeColor : pal.text },
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              >
                {t('reorder_random')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <ReorderableList
          key="persistent-word-list"
          cards={visibleFolderCards}
          onReorder={handleReorderVisibleCards}
          pal={pal}
          reorderEnabled={reorder.active}
          extraPaddingBottom={
            (isSubscribed ? 0 : AD_BANNER_HEIGHT)
              + (selection.active ? SEL_BAR_H : 0)
              + FAB_LIST_EXTRA_CLEARANCE
          }
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
        onPress={() => selection.onSetNotifCandidate(true)}
        disabled={selection.selectedIds.size === 0}
      >
        <Ionicons
          name="notifications-outline"
          size={20}
          color={selection.selectedIds.size === 0 ? pal.sub : themeColor}
        />
        <Text style={[selStyles.barLabel, { color: selection.selectedIds.size === 0 ? pal.sub : themeColor }]}>
          {t('notif_add_word')}
        </Text>
      </TouchableOpacity>
      <View style={[selStyles.barDivider, { backgroundColor: pal.border }]} />
      <TouchableOpacity
        style={selStyles.barBtn}
        onPress={() => selection.onSetNotifCandidate(false)}
        disabled={selection.selectedIds.size === 0}
      >
        <Ionicons name="notifications-off-outline" size={20} color={pal.sub} />
        <Text style={[selStyles.barLabel, { color: pal.sub }]}>{t('notif_remove_word')}</Text>
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
  const fab = !selection.active && !reorder.active && !showTestLayer ? (
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

  // Header, word count and the colour-filter row — including the Test button —
  // stay exactly where they are. Test Mode occupies the card area below them and
  // nothing else. Both layers are mounted and only their visibility changes, so
  // entering or leaving cannot flash the word list, an empty state, or the
  // "No words yet" screen a completed test would otherwise leave behind.
  return (
    <>
      {header}
      {wordCount}
      {filterBar}
      <View style={cardAreaStyles.stack}>
        <View
          style={[
            cardAreaStyles.layer,
            showTestLayer ? cardAreaStyles.hidden : cardAreaStyles.visible,
          ]}
          pointerEvents={showTestLayer ? 'none' : 'auto'}
          accessibilityElementsHidden={showTestLayer}
          importantForAccessibility={showTestLayer ? 'no-hide-descendants' : 'auto'}
        >
          {cardContent}
        </View>
        {testMode.active ? (
          <View
            style={[
              cardAreaStyles.layer,
              showTestLayer ? cardAreaStyles.visible : cardAreaStyles.hidden,
            ]}
            pointerEvents={showTestLayer ? 'auto' : 'none'}
            accessibilityElementsHidden={!showTestLayer}
            importantForAccessibility={showTestLayer ? 'auto' : 'no-hide-descendants'}
          >
            {testMode.content}
          </View>
        ) : null}
      </View>
      {selectionBar}
      {fab ? (
        <View style={fabOverlayStyles.root} pointerEvents="box-none">
          {fab}
        </View>
      ) : null}

      {/* A colour's explanation, and the sheet it hands through to. Never both
          at once: Edit closes the dialog and the sheet opens only once it has
          finished dismissing. */}
      <ResultFilterExplanationDialog
        level={explainedLevel}
        onClose={() => setExplainedLevel(null)}
        onEdit={openSheetForLevel}
        pal={pal}
        themeColor={themeColor}
      />
      <ResultWordsSheet
        level={sheetLevel}
        words={sheetWords}
        onClose={() => setSheetLevel(null)}
        onDelete={actions.onDeleteWords}
        pal={pal}
        themeColor={themeColor}
      />
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
  // Normal, selection, reorder and test headers contain different controls, but
  // the list must always begin at the same screen coordinate when modes change.
  header: { height: 50 },
  hiddenWordCount: { opacity: 0 },
});

const modeLayerStyles = StyleSheet.create({
  stack: { flex: 1 },
  layer: { ...StyleSheet.absoluteFillObject },
  visible: { opacity: 1, zIndex: 1 },
  hidden: { opacity: 0, zIndex: 0 },
});

// The same stacking rule one level up, between the List/Flip pair and Test Mode.
const cardAreaStyles = StyleSheet.create({
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

const testHeaderStyles = StyleSheet.create({
  row: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // A mode badge, not a page title: smaller than the folder name it replaces,
  // and letter-spaced so four capitals do not read as an abbreviation.
  title: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
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
    paddingVertical: CHIP_PADDING_V,
    borderRadius: 20,
    borderWidth: FILTER_BORDER_WIDTH,
    backgroundColor: 'transparent',
  },
  chipCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Matches the chip's own radius so the flash fills the pill rather than a
  // rectangle behind it. Inset by the border so the outline stays visible.
  chipFlash: {
    position: 'absolute',
    top: FILTER_BORDER_WIDTH,
    right: FILTER_BORDER_WIDTH,
    bottom: FILTER_BORDER_WIDTH,
    left: FILTER_BORDER_WIDTH,
    borderRadius: 20,
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
  presetBtn: {
    minHeight: 38,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
  },
  presetText: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
