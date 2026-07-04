import { useCallback, useRef, useState } from 'react';
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface RowMeasure { pageY: number; height: number }

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
}

// ── DraggableRow ──────────────────────────────────────────────────────────────

interface RowProps {
  card: WordCard;
  index: number;
  pal: Palette;
  themeColor: string;
  isDragging: boolean;
  translateY: Animated.Value;
  rowRef: (el: View | null) => void;
  showLevelLabel: boolean;
  folderItem?: FolderRowData;
  onDragStart: (idx: number, touchPageY: number) => void;
  onDragMove:  (pageY: number) => void;
  onDragEnd:   () => void;
}

function DraggableRow({
  card, index, pal, themeColor, isDragging, translateY, rowRef,
  showLevelLabel, folderItem, onDragStart, onDragMove, onDragEnd,
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
      onPanResponderMove:      (e) => { onDragMoveRef.current(e.nativeEvent.pageY); },
      onPanResponderRelease:   () => { onDragEndRef.current(); },
      onPanResponderTerminate: () => { onDragEndRef.current(); },
    })
  ).current;

  const stripeColor = card.testLevel ? (STRIPE_COLORS[card.testLevel] ?? null) : null;

  const handleEl = (
    <View style={styles.handle} {...panResponder.panHandlers}>
      <Ionicons name="reorder-three-outline" size={26} color={pal.sub} />
    </View>
  );

  return (
    <Animated.View
      ref={rowRef as any}
      style={[styles.row, { transform: [{ translateY }], opacity: isDragging ? 0 : 1 }]}
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
          {handleEl}
        </View>
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
  showLevelLabel = true, folderData,
}: Props) {
  const t           = useLang();
  const rowRefs     = useRef<(View | null)[]>([]);
  const rowMeasures = useRef<(RowMeasure | null)[]>([]);

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const ghostY         = useRef(new Animated.Value(0)).current;
  const ghostHeight    = useRef(0);
  const touchOffset    = useRef(0);
  const draggingRef    = useRef<number | null>(null);
  const hoverRef       = useRef<number | null>(null);
  const latestPageY    = useRef(0);

  const anims = useRef<Animated.Value[]>([]);
  while (anims.current.length < cards.length) {
    anims.current.push(new Animated.Value(0));
  }

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
    const cardH  = ghostHeight.current;
    anims.current.forEach((anim, i) => {
      if (i === srcIdx) return;
      let target = 0;
      if (srcIdx < newHover && i > srcIdx && i <= newHover) target = -cardH;
      if (srcIdx > newHover && i >= newHover && i < srcIdx) target = cardH;
      Animated.timing(anim, { toValue: target, duration: 120, useNativeDriver: true }).start();
    });
  }, [ghostY]);

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const startDrag = useCallback(async (idx: number, initialTouchPageY: number) => {
    latestPageY.current = initialTouchPageY;

    await new Promise<void>(resolve => {
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

    const m = rowMeasures.current[idx];
    if (!m) return;

    touchOffset.current = initialTouchPageY - m.pageY;
    ghostHeight.current = m.height;
    draggingRef.current = idx;
    hoverRef.current    = idx;
    setDraggingIdx(idx);
    applyPageY(latestPageY.current);
  }, [applyPageY]);

  const moveDrag = useCallback((pageY: number) => {
    latestPageY.current = pageY;
    if (draggingRef.current === null) return;
    applyPageY(pageY);
  }, [applyPageY]);

  const endDrag = useCallback(() => {
    const srcIdx = draggingRef.current;
    const hovIdx = hoverRef.current;

    anims.current.forEach(v => v.setValue(0));

    if (srcIdx !== null && hovIdx !== null && srcIdx !== hovIdx) {
      const next = [...cards];
      const [removed] = next.splice(srcIdx, 1);
      next.splice(hovIdx, 0, removed);
      onReorder(next);
    }

    draggingRef.current = null;
    hoverRef.current    = null;
    setDraggingIdx(null);
  }, [cards, onReorder]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const draggingCard     = draggingIdx !== null ? cards[draggingIdx] : null;
  const draggingFolderItem = draggingCard && folderData ? folderData[draggingCard.id] : undefined;

  return (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEnabled={draggingIdx === null}
        contentContainerStyle={[styles.list, { paddingBottom: 100 + extraPaddingBottom }]}
      >
        {cards.map((card, idx) => (
          <DraggableRow
            key={card.id}
            card={card}
            index={idx}
            pal={pal}
            themeColor={themeColor}
            isDragging={draggingIdx === idx}
            translateY={anims.current[idx] ?? new Animated.Value(0)}
            rowRef={el => { rowRefs.current[idx] = el; }}
            showLevelLabel={showLevelLabel}
            folderItem={folderData ? folderData[card.id] : undefined}
            onDragStart={startDrag}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
          />
        ))}
      </ScrollView>

      {/* Ghost card — Modal so it floats above the ScrollView */}
      {draggingCard && (
        <Modal visible transparent animationType="none">
          <Animated.View style={[styles.ghostBase, { top: ghostY }]}>
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
  list: { paddingHorizontal: 20 },

  row: { marginBottom: 10 },

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

  // ── Ghost ──────────────────────────────────────────────────────────────────
  ghostBase: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
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
