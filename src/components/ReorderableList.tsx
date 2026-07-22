import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Palette, WordCard } from '../types';
import { useLang } from '../i18n';

const STRIPE_COLORS: Record<string, string> = {
  perfect: '#22c55e', good: '#3B82F6', slightly: '#f59e0b', unknown: '#ef4444',
};

const AUTO_SCROLL_EDGE = 72;
const AUTO_SCROLL_MAX_SPEED = 16;
const DROP_SETTLE_DURATION = 120;

// ── Types ─────────────────────────────────────────────────────────────────────

interface RowMeasure { pageY: number; height: number }

interface DragRenderState {
  draggingId: string | null;
  localOrder: string[];
  pendingOrder: string[] | null;
}

function ordersMatch(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export interface FolderRowData {
  icon: string;
  color: string;
  cardCount: number;
}

interface Props {
  cards: WordCard[];
  onReorder: (cards: WordCard[]) => void;
  pal: Palette;
  themeColor: string;
  extraPaddingBottom?: number;
  showLevelLabel?: boolean;
  /** When provided, rows render as folder items instead of word cards. */
  folderData?: Record<string, FolderRowData>;
  /** Uses the normal word-card renderer and injects its handle only in reorder mode. */
  renderWordCard?: (card: WordCard, reorderMode: boolean, dragHandle?: ReactNode) => ReactNode;
  reorderEnabled?: boolean;
  scrollEnabled?: boolean;
  onScrollOffsetChange?: (offset: number) => void;
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
  onMomentumScrollBegin?: () => void;
  onMomentumScrollEnd?: () => void;
  onContentHeightChange?: (height: number) => void;
  onViewportHeightChange?: (height: number) => void;
  onFooterPress?: () => void;
}

// ── DraggableRow ──────────────────────────────────────────────────────────────

interface RowProps {
  card: WordCard;
  index: number;
  pal: Palette;
  themeColor: string;
  isDragging: boolean;
  translateY: Animated.Value | null;
  rowRef: (el: View | null) => void;
  showLevelLabel: boolean;
  folderItem?: FolderRowData;
  renderWordCard?: (card: WordCard, reorderMode: boolean, dragHandle?: ReactNode) => ReactNode;
  reorderEnabled: boolean;
  onDragStart: (idx: number, touchPageY: number) => void;
  onDragMove:  (pageY: number) => void;
  onDragEnd:   () => void;
}

function DraggableRow({
  card, index, pal, themeColor, isDragging, translateY, rowRef,
  showLevelLabel, folderItem, renderWordCard, reorderEnabled,
  onDragStart, onDragMove, onDragEnd,
}: RowProps) {
  const t = useLang();

  const idxRef             = useRef(index);
  const onDragStartRef     = useRef(onDragStart);
  const onDragMoveRef      = useRef(onDragMove);
  const onDragEndRef       = useRef(onDragEnd);
  idxRef.current           = index;
  onDragStartRef.current   = onDragStart;
  onDragMoveRef.current    = onDragMove;
  onDragEndRef.current     = onDragEnd;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder:         () => true,
      onPanResponderTerminationRequest:    () => false,
      onPanResponderGrant: (e) => {
        onDragStartRef.current(idxRef.current, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e) => { onDragMoveRef.current(e.nativeEvent.pageY); },
      onPanResponderRelease: () => {
        onDragEndRef.current();
      },
      onPanResponderTerminate: () => {
        onDragEndRef.current();
      },
    })
  ).current;

  const stripeColor = card.testLevel ? (STRIPE_COLORS[card.testLevel] ?? null) : null;

  const wordCardHandle = !!renderWordCard && !folderItem;
  const handleEl = (
    <View
      style={[styles.handle, wordCardHandle ? styles.wordCardHandle : null]}
      hitSlop={wordCardHandle ? { top: 8, bottom: 10, left: 8, right: 8 } : undefined}
      {...panResponder.panHandlers}
    >
      <Ionicons name="reorder-three-outline" size={wordCardHandle ? 24 : 26} color={pal.sub} />
    </View>
  );

  return (
    <Animated.View
      ref={rowRef as any}
      style={[
        styles.row,
        renderWordCard && !folderItem ? styles.renderedWordRow : null,
        translateY ? { transform: [{ translateY }] } : null,
        { opacity: isDragging ? 0 : 1 },
      ]}
    >
      {folderItem ? (
        // ── Folder-style row ───────────────────────────────────────────────
        <View style={[styles.folderRow, { backgroundColor: pal.card }]}>
          <View style={[styles.folderIconWrap, { backgroundColor: folderItem.color + '22' }]}>
            <Ionicons name={folderItem.icon as any} size={22} color={folderItem.color} />
          </View>
          <View style={styles.folderTextBlock}>
            <Text style={[styles.folderName, { color: pal.text }]} numberOfLines={1}>
              {card.word}
            </Text>
            <Text style={[styles.folderCount, { color: pal.sub }]}>
              {folderItem.cardCount}{' '}
              {t(folderItem.cardCount === 1 ? 'words_singular' : 'words_plural')}
            </Text>
          </View>
          {reorderEnabled && handleEl}
        </View>
      ) : renderWordCard ? (
        renderWordCard(card, reorderEnabled, reorderEnabled ? handleEl : undefined)
      ) : (
        // ── Word-card row ──────────────────────────────────────────────────
        <View style={[styles.rowInner, { backgroundColor: pal.card }]}>
          {showLevelLabel && stripeColor && (
            <View style={[styles.rowStripe, { backgroundColor: stripeColor }]} pointerEvents="none" />
          )}
          <View style={styles.flipArea}>
            <Text style={[styles.cardText, { color: pal.text }]} numberOfLines={1}>
              {card.word}
            </Text>
          </View>
          {handleEl}
        </View>
      )}
    </Animated.View>
  );
}

// ── ReorderableList ───────────────────────────────────────────────────────────

export function ReorderableList({
  cards, onReorder, pal, themeColor, extraPaddingBottom = 0,
  showLevelLabel = true, folderData, renderWordCard,
  reorderEnabled = true, scrollEnabled = true,
  onScrollOffsetChange,
  onScrollBeginDrag, onScrollEndDrag, onMomentumScrollBegin, onMomentumScrollEnd,
  onContentHeightChange, onViewportHeightChange,
  onFooterPress,
}: Props) {
  const t           = useLang();
  const scrollRef   = useRef<ScrollView | null>(null);
  const rowRefs     = useRef<(View | null)[]>([]);
  const rowMeasures = useRef<(RowMeasure | null)[]>([]);

  const [dragRenderState, setDragRenderState] = useState<DragRenderState>(() => ({
    draggingId: null,
    localOrder: cards.map(card => card.id),
    pendingOrder: null,
  }));
  const { draggingId, localOrder, pendingOrder } = dragRenderState;

  const ghostY         = useRef(new Animated.Value(0)).current;
  const ghostHeight    = useRef(0);
  const dragSlotHeight = useRef(0);
  const touchOffset    = useRef(0);
  const draggingRef    = useRef<number | null>(null);
  const hoverRef       = useRef<number | null>(null);
  const latestPageY    = useRef(0);
  const dragSession    = useRef(0);
  const scrollOffset   = useRef(0);
  const contentHeight  = useRef(0);
  const viewport       = useRef({ pageY: 0, height: 0 });
  const autoScrollSpeed = useRef(0);
  const autoScrollFrame = useRef<number | null>(null);
  const autoScrollTickRef = useRef<() => void>(() => {});
  const dragOrderRef = useRef<string[]>([]);
  const dragCardsRef = useRef(new Map<string, WordCard>());
  const cardsRef = useRef(cards);
  const onReorderRef = useRef(onReorder);
  const pendingCardsRef = useRef<WordCard[] | null>(null);
  const droppingRef = useRef(false);
  cardsRef.current = cards;
  onReorderRef.current = onReorder;

  // Animated values are owned by stable item IDs, never by array positions.
  // This prevents a reordered row from inheriting another row's transform.
  const anims = useRef(new Map<string, Animated.Value>());
  cards.forEach(card => {
    if (!anims.current.has(card.id)) anims.current.set(card.id, new Animated.Value(0));
  });

  const propOrder = cards.map(card => card.id);
  const renderOrder = draggingId !== null || pendingOrder !== null ? localOrder : propOrder;
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const renderedCards = renderOrder
    .map(id => cardsById.get(id))
    .filter((card): card is WordCard => card !== undefined);

  // Parent state is notified only after the local drop order has committed.
  useEffect(() => {
    if (!pendingOrder || !pendingCardsRef.current) return;
    const reorderedCards = pendingCardsRef.current;
    pendingCardsRef.current = null;
    onReorderRef.current(reorderedCards);
  }, [pendingOrder]);

  // Keep rendering the committed local order until the parent confirms it.
  useEffect(() => {
    if (pendingOrder && ordersMatch(propOrder, pendingOrder)) {
      setDragRenderState(current => current.pendingOrder
        ? { ...current, pendingOrder: null }
        : current);
    }
  }, [cards, pendingOrder]);

  // Refresh the local snapshot only while idle. During a drag/drop lifecycle it
  // must remain immutable so rows never swap identities under the gesture.
  useEffect(() => {
    if (draggingId === null && pendingOrder === null) {
      setDragRenderState(current => ordersMatch(current.localOrder, propOrder)
        ? current
        : { ...current, localOrder: propOrder });
    }
  }, [cards, draggingId, pendingOrder]);

  // ── Core position logic ─────────────────────────────────────────────────────

  const applyPageY = useCallback((pageY: number) => {
    const measures = rowMeasures.current;
    const nonNull  = measures.filter((m): m is RowMeasure => !!m);
    if (!nonNull.length) return;

    const minY  = nonNull[0].pageY;
    const lastM = nonNull[nonNull.length - 1];
    const maxY  = lastM.pageY + lastM.height - ghostHeight.current;
    const absY  = Math.max(minY, Math.min(maxY, pageY - touchOffset.current));
    ghostY.setValue(absY);

    const ghostCenter = absY + ghostHeight.current / 2;
    let newHover  = draggingRef.current ?? 0;
    let bestDist  = Infinity;
    measures.forEach((m, i) => {
      if (!m) return;
      const dist = Math.abs(m.pageY + m.height / 2 - ghostCenter);
      if (dist < bestDist) { bestDist = dist; newHover = i; }
    });

    if (newHover === hoverRef.current) return;
    hoverRef.current = newHover;

    const srcIdx = draggingRef.current ?? 0;
    // Shift neighboring rows by the dragged row's complete layout slot, not
    // just its visible height. The slot also includes the inter-row margin;
    // omitting it leaves the placeholder offset and makes the list jump when
    // the transforms are cleared after dropping.
    const slotH = dragSlotHeight.current;
    dragOrderRef.current.forEach((id, i) => {
      const anim = anims.current.get(id);
      if (!anim) return;
      if (i === srcIdx) return;
      let target = 0;
      if (srcIdx < newHover && i > srcIdx && i <= newHover) target = -slotH;
      if (srcIdx > newHover && i >= newHover && i < srcIdx) target = slotH;
      Animated.timing(anim, { toValue: target, duration: 120, useNativeDriver: false }).start();
    });
  }, [ghostY]);

  // ── Edge auto-scroll ───────────────────────────────────────────────────────

  const stopAutoScroll = useCallback(() => {
    autoScrollSpeed.current = 0;
    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  }, []);

  const autoScrollTick = useCallback(() => {
    autoScrollFrame.current = null;
    if (draggingRef.current === null || autoScrollSpeed.current === 0) return;

    const maxOffset = Math.max(0, contentHeight.current - viewport.current.height);
    const previousOffset = scrollOffset.current;
    const nextOffset = Math.max(0, Math.min(maxOffset, previousOffset + autoScrollSpeed.current));
    const delta = nextOffset - previousOffset;

    if (delta === 0) {
      autoScrollSpeed.current = 0;
      return;
    }

    scrollOffset.current = nextOffset;
    scrollRef.current?.scrollTo({ y: nextOffset, animated: false });

    // Row measurements use window coordinates. Keep them aligned with the
    // programmatic scroll so hover detection remains accurate over long drags.
    rowMeasures.current.forEach(measure => {
      if (measure) measure.pageY -= delta;
    });
    applyPageY(latestPageY.current);

    autoScrollFrame.current = requestAnimationFrame(autoScrollTickRef.current);
  }, [applyPageY]);
  autoScrollTickRef.current = autoScrollTick;

  const updateAutoScroll = useCallback((pageY: number) => {
    const { pageY: top, height } = viewport.current;
    if (!height) return;

    const bottom = top + height;
    let speed = 0;
    if (pageY < top + AUTO_SCROLL_EDGE) {
      const strength = Math.min(1, Math.max(0, (top + AUTO_SCROLL_EDGE - pageY) / AUTO_SCROLL_EDGE));
      speed = -Math.max(2, AUTO_SCROLL_MAX_SPEED * strength);
    } else if (pageY > bottom - AUTO_SCROLL_EDGE) {
      const strength = Math.min(1, Math.max(0, (pageY - (bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE));
      speed = Math.max(2, AUTO_SCROLL_MAX_SPEED * strength);
    }

    autoScrollSpeed.current = speed;
    if (speed === 0) {
      if (autoScrollFrame.current !== null) {
        cancelAnimationFrame(autoScrollFrame.current);
        autoScrollFrame.current = null;
      }
    } else if (autoScrollFrame.current === null) {
      autoScrollFrame.current = requestAnimationFrame(autoScrollTickRef.current);
    }
  }, []);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const startDrag = useCallback(async (idx: number, initialTouchPageY: number) => {
    const session = ++dragSession.current;
    const startingOrder = [...renderOrder];
    dragOrderRef.current = startingOrder;
    dragCardsRef.current = new Map(renderedCards.map(card => [card.id, card]));
    // Values from the previous drag are reset only while transforms are
    // detached, so no post-drop frame can expose the reset visually.
    anims.current.forEach(value => value.setValue(0));
    setDragRenderState(current => ordersMatch(current.localOrder, startingOrder)
      ? current
      : { ...current, localOrder: startingOrder });
    latestPageY.current = initialTouchPageY;

    const measureRows = new Promise<void>(resolve => {
      const refs = rowRefs.current;
      let pending = refs.filter(Boolean).length;
      if (pending === 0) { resolve(); return; }
      refs.forEach((ref, i) => {
        if (!ref) return;
        ref.measureInWindow((_x, y, _w, h) => {
          rowMeasures.current[i] = { pageY: y, height: h };
          pending--;
          if (pending === 0) resolve();
        });
      });
    });
    const measureViewport = new Promise<void>(resolve => {
      const nativeScrollRef = scrollRef.current?.getNativeScrollRef();
      if (!nativeScrollRef) { resolve(); return; }
      nativeScrollRef.measureInWindow((_x, y, _w, h) => {
        viewport.current = { pageY: y, height: h };
        resolve();
      });
    });
    await Promise.all([measureRows, measureViewport]);
    if (session !== dragSession.current) return;

    const m = rowMeasures.current[idx];
    if (!m) return;

    touchOffset.current = initialTouchPageY - m.pageY;
    ghostHeight.current = m.height;
    const nextMeasure = rowMeasures.current[idx + 1];
    const previousMeasure = rowMeasures.current[idx - 1];
    dragSlotHeight.current = nextMeasure
      ? nextMeasure.pageY - m.pageY
      : previousMeasure
        ? m.pageY - previousMeasure.pageY
        : m.height;
    draggingRef.current = idx;
    hoverRef.current    = idx;
    setDragRenderState(current => ({ ...current, draggingId: startingOrder[idx] ?? null }));
    applyPageY(latestPageY.current);
    updateAutoScroll(latestPageY.current);
  }, [applyPageY, renderOrder, updateAutoScroll]);

  const moveDrag = useCallback((pageY: number) => {
    latestPageY.current = pageY;
    if (draggingRef.current === null) return;
    applyPageY(pageY);
    updateAutoScroll(pageY);
  }, [applyPageY, updateAutoScroll]);

  const endDrag = useCallback(() => {
    if (droppingRef.current) return;
    dragSession.current++;
    stopAutoScroll();
    const srcIdx = draggingRef.current;
    const hovIdx = hoverRef.current;
    if (srcIdx === null || hovIdx === null) {
      setDragRenderState(current => ({ ...current, draggingId: null }));
      return;
    }

    droppingRef.current = true;

    const nextOrder = [...dragOrderRef.current];
    if (srcIdx !== hovIdx) {
      const [removed] = nextOrder.splice(srcIdx, 1);
      nextOrder.splice(hovIdx, 0, removed);
    }

    const settleAnimations: Animated.CompositeAnimation[] = [];
    dragOrderRef.current.forEach((id, index) => {
      const value = anims.current.get(id);
      if (!value || index === srcIdx) return;

      let target = 0;
      if (srcIdx < hovIdx && index > srcIdx && index <= hovIdx) target = -dragSlotHeight.current;
      if (srcIdx > hovIdx && index >= hovIdx && index < srcIdx) target = dragSlotHeight.current;
      settleAnimations.push(Animated.timing(value, {
        toValue: target,
        duration: DROP_SETTLE_DURATION,
        useNativeDriver: false,
      }));
    });

    const destinationMeasure = rowMeasures.current[hovIdx];
    if (destinationMeasure) {
      settleAnimations.push(Animated.timing(ghostY, {
        toValue: destinationMeasure.pageY,
        duration: DROP_SETTLE_DURATION,
        useNativeDriver: false,
      }));
    }

    Animated.parallel(settleAnimations).start(() => {
      if (srcIdx !== hovIdx) {
        const latestCardsById = new Map(cardsRef.current.map(card => [card.id, card]));
        const nextCards: WordCard[] = [];
        for (const id of nextOrder) {
          const card = latestCardsById.get(id) ?? dragCardsRef.current.get(id);
          if (!card) {
            // Never publish a partial order. If external data changed during
            // the drag, fall back to the complete parent list.
            draggingRef.current = null;
            hoverRef.current = null;
            droppingRef.current = false;
            setDragRenderState(current => ({ ...current, draggingId: null }));
            return;
          }
          nextCards.push(card);
        }

        // Commit the complete order in one render. pendingOrder keeps this
        // exact sequence on screen until the parent acknowledges it.
        pendingCardsRef.current = nextCards;
        setDragRenderState({
          draggingId: null,
          localOrder: nextOrder,
          pendingOrder: nextOrder,
        });
      } else {
        setDragRenderState(current => ({ ...current, draggingId: null }));
      }

      draggingRef.current = null;
      hoverRef.current = null;
      droppingRef.current = false;
    });
  }, [ghostY, stopAutoScroll]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const draggingCard     = draggingId !== null ? cardsById.get(draggingId) ?? null : null;
  const draggingFolderItem = draggingCard && folderData ? folderData[draggingCard.id] : undefined;

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled && draggingId === null}
        scrollEventThrottle={16}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScroll={e => {
          scrollOffset.current = e.nativeEvent.contentOffset.y;
          onScrollOffsetChange?.(scrollOffset.current);
        }}
        onContentSizeChange={(_width, height) => {
          contentHeight.current = height;
          onContentHeightChange?.(height);
        }}
        onLayout={e => {
          viewport.current.height = e.nativeEvent.layout.height;
          onViewportHeightChange?.(e.nativeEvent.layout.height);
          scrollRef.current?.getNativeScrollRef()?.measureInWindow((_x, y, _w, h) => {
            viewport.current = { pageY: y, height: h };
          });
        }}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: 100 + extraPaddingBottom },
        ]}
      >
        {renderedCards.map((card, idx) => (
          <DraggableRow
            key={card.id}
            card={card}
            index={idx}
            pal={pal}
            themeColor={themeColor}
            isDragging={draggingId === card.id}
            translateY={draggingId !== null ? (anims.current.get(card.id) ?? null) : null}
            rowRef={el => { rowRefs.current[idx] = el; }}
            showLevelLabel={showLevelLabel}
            folderItem={folderData ? folderData[card.id] : undefined}
            renderWordCard={renderWordCard}
            reorderEnabled={reorderEnabled}
            onDragStart={startDrag}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
          />
        ))}
        {renderWordCard && <View style={styles.wordListFooter} onTouchStart={onFooterPress} />}
      </ScrollView>

      {/* Ghost card — Modal so it floats above the ScrollView */}
      {reorderEnabled && draggingCard && (
        <Modal visible transparent animationType="none">
          <Animated.View style={[styles.ghostBase, renderWordCard ? styles.renderedWordGhost : null, { top: ghostY }]}>
            {draggingFolderItem ? (
              // ── Folder ghost ───────────────────────────────────────────────
              <View style={[styles.folderRow, styles.ghostElevation, { backgroundColor: pal.card }]}>
                <View style={[styles.folderIconWrap, { backgroundColor: draggingFolderItem.color + '22' }]}>
                  <Ionicons name={draggingFolderItem.icon as any} size={22} color={draggingFolderItem.color} />
                </View>
                <View style={styles.folderTextBlock}>
                  <Text style={[styles.folderName, { color: pal.text }]} numberOfLines={1}>
                    {draggingCard.word}
                  </Text>
                  <Text style={[styles.folderCount, { color: pal.sub }]}>
                    {draggingFolderItem.cardCount}{' '}
                    {t(draggingFolderItem.cardCount === 1 ? 'words_singular' : 'words_plural')}
                  </Text>
                </View>
                <View style={styles.handle}>
                  <Ionicons name="reorder-three-outline" size={26} color={pal.sub} />
                </View>
              </View>
            ) : renderWordCard ? (
              <View style={styles.ghostElevation} pointerEvents="none">
                {renderWordCard(
                  draggingCard,
                  true,
                  <View style={[styles.handle, styles.wordCardHandle]}>
                    <Ionicons name="reorder-three-outline" size={24} color={pal.sub} />
                  </View>,
                )}
              </View>
            ) : (
              // ── Word-card ghost ────────────────────────────────────────────
              <View style={[styles.ghostWordInner, styles.ghostElevation, { backgroundColor: pal.card }]}>
                {showLevelLabel && draggingCard.testLevel && STRIPE_COLORS[draggingCard.testLevel] && (
                  <View style={[styles.rowStripe, { backgroundColor: STRIPE_COLORS[draggingCard.testLevel]! }]} pointerEvents="none" />
                )}
                <View style={styles.flipArea}>
                  <Text style={[styles.cardText, { color: pal.text }]} numberOfLines={1}>
                    {draggingCard.word}
                  </Text>
                </View>
                <View style={styles.handle}>
                  <Ionicons name="reorder-three-outline" size={26} color={pal.sub} />
                </View>
              </View>
            )}
          </Animated.View>
        </Modal>
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  list: { paddingHorizontal: 20 },

  row: { marginBottom: 10 },
  renderedWordRow: { marginBottom: 0 },
  wordListFooter: { height: 300 },

  // ── Word-card row ──────────────────────────────────────────────────────────
  rowInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  flipArea: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  cardText: { fontSize: 18, fontWeight: '600' },
  rowStripe: {
    position: 'absolute',
    bottom: 4,
    right: -15,
    width: 40,
    height: 5,
    opacity: 0.7,
    transform: [{ rotate: '-45deg' }],
  },

  // ── Folder row — mirrors SwipeableFolder's item + itemOuter styles ─────────
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  folderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderTextBlock: { flex: 1 },
  folderName:  { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  folderCount: { fontSize: 13 },

  // ── Shared drag handle ─────────────────────────────────────────────────────
  handle: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordCardHandle: {
    width: 38,
    height: 25,
    paddingHorizontal: 0,
  },

  // ── Ghost ──────────────────────────────────────────────────────────────────
  ghostBase: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  renderedWordGhost: { right: 20 },
  ghostElevation: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    transform: [{ scale: 1.03 }],
  },
  ghostWordInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
  },
});
