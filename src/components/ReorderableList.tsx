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

const STRIPE_COLORS: Record<string, string> = {
  perfect: '#22c55e', good: '#3B82F6', slightly: '#f59e0b', unknown: '#ef4444',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface RowMeasure { pageY: number; height: number }

interface Props {
  cards: WordCard[];
  onReorder: (cards: WordCard[]) => void;
  pal: Palette;
  themeColor: string;
  extraPaddingBottom?: number;
  showLevelLabel?: boolean;
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
  // Absolute window Y of the initial touch; absolute window Y on each move
  onDragStart: (idx: number, touchPageY: number) => void;
  onDragMove:  (pageY: number) => void;
  onDragEnd:   () => void;
}

function DraggableRow({
  card, index, pal, themeColor, isDragging, translateY, rowRef,
  showLevelLabel, onDragStart, onDragMove, onDragEnd,
}: RowProps) {
  const idxRef          = useRef(index);
  const onDragStartRef  = useRef(onDragStart);
  const onDragMoveRef   = useRef(onDragMove);
  const onDragEndRef    = useRef(onDragEnd);
  idxRef.current        = index;
  onDragStartRef.current  = onDragStart;
  onDragMoveRef.current   = onDragMove;
  onDragEndRef.current    = onDragEnd;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder:         () => true,
      onPanResponderTerminationRequest:    () => false,
      // Pass absolute window Y so the parent can compute offset without dy drift
      onPanResponderGrant: (e) => {
        onDragStartRef.current(idxRef.current, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e) => {
        onDragMoveRef.current(e.nativeEvent.pageY);
      },
      onPanResponderRelease:   () => { onDragEndRef.current(); },
      onPanResponderTerminate: () => { onDragEndRef.current(); },
    })
  ).current;

  const stripeColor = card.testLevel ? (STRIPE_COLORS[card.testLevel] ?? null) : null;

  return (
    <Animated.View
      ref={rowRef as any}
      style={[
        styles.row,
        { transform: [{ translateY }], opacity: isDragging ? 0 : 1 },
      ]}
    >
      <View style={[styles.rowInner, { backgroundColor: pal.card }]}>
        {showLevelLabel && stripeColor && (
          <View style={[styles.rowStripe, { backgroundColor: stripeColor }]} pointerEvents="none" />
        )}
        <View style={styles.flipArea}>
          <Text style={[styles.cardText, { color: pal.text }]} numberOfLines={1}>
            {card.word}
          </Text>
        </View>
        <View style={styles.handle} {...panResponder.panHandlers}>
          <Ionicons name="reorder-three-outline" size={26} color={pal.sub} />
        </View>
      </View>
    </Animated.View>
  );
}

// ── ReorderableList ───────────────────────────────────────────────────────────

export function ReorderableList({ cards, onReorder, pal, themeColor, extraPaddingBottom = 0, showLevelLabel = true }: Props) {
  const rowRefs     = useRef<(View | null)[]>([]);
  const rowMeasures = useRef<(RowMeasure | null)[]>([]);

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const ghostY         = useRef(new Animated.Value(0)).current;
  const ghostHeight    = useRef(0);
  // Where within the card the user first touched (pageY - card.pageY)
  const touchOffset    = useRef(0);
  const draggingRef    = useRef<number | null>(null);
  const hoverRef       = useRef<number | null>(null);
  // Latest absolute finger Y — stored even before initialisation completes
  const latestPageY    = useRef(0);

  // Per-row shift animations — one value per list position
  const anims = useRef<Animated.Value[]>([]);
  while (anims.current.length < cards.length) {
    anims.current.push(new Animated.Value(0));
  }

  // ── Core position logic ─────────────────────────────────────────────────────

  // Apply a new absolute finger pageY: update ghost + hover + shift animations.
  // Only valid after draggingRef is set.
  const applyPageY = useCallback((pageY: number) => {
    const measures = rowMeasures.current;
    const nonNull  = measures.filter((m): m is RowMeasure => !!m);
    if (!nonNull.length) return;

    // Compute ghost top so the card stays anchored to the touch point
    const minY  = nonNull[0].pageY;
    const lastM = nonNull[nonNull.length - 1];
    const maxY  = lastM.pageY + lastM.height - ghostHeight.current;
    const absY  = Math.max(minY, Math.min(maxY, pageY - touchOffset.current));
    ghostY.setValue(absY);

    // Nearest slot by center distance
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

    // Shift other rows: use timing (no overshoot) so fast drags never overlap
    const srcIdx = draggingRef.current ?? 0;
    const cardH  = ghostHeight.current;
    anims.current.forEach((anim, i) => {
      if (i === srcIdx) return;
      let target = 0;
      if (srcIdx < newHover && i > srcIdx && i <= newHover) target = -cardH;
      if (srcIdx > newHover && i >= newHover && i < srcIdx) target = cardH;
      Animated.timing(anim, {
        toValue: target, duration: 120, useNativeDriver: true,
      }).start();
    });
  }, [ghostY]);

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const startDrag = useCallback(async (idx: number, initialTouchPageY: number) => {
    latestPageY.current = initialTouchPageY;

    // Measure all rows in window coordinates
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

    // Anchor ghost to touch point within the card
    touchOffset.current  = initialTouchPageY - m.pageY;
    ghostHeight.current  = m.height;
    draggingRef.current  = idx;
    hoverRef.current     = idx;
    setDraggingIdx(idx);

    // Apply any finger movement that arrived during measurement
    applyPageY(latestPageY.current);
  }, [applyPageY]);

  const moveDrag = useCallback((pageY: number) => {
    latestPageY.current = pageY;
    if (draggingRef.current === null) return; // Still measuring
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

  const draggingCard = draggingIdx !== null ? cards[draggingIdx] : null;

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
            onDragStart={startDrag}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
          />
        ))}
      </ScrollView>

      {/* Ghost card — Modal so it floats above the ScrollView */}
      {draggingCard && (
        <Modal visible transparent animationType="none">
          <Animated.View
            style={[styles.ghost, { top: ghostY, backgroundColor: pal.card }]}
          >
            <View style={styles.flipArea}>
              {showLevelLabel && draggingCard.testLevel && STRIPE_COLORS[draggingCard.testLevel] && (
                <View style={[styles.rowStripe, { backgroundColor: STRIPE_COLORS[draggingCard.testLevel]! }]} pointerEvents="none" />
              )}
              <Text style={[styles.cardText, { color: pal.text }]} numberOfLines={1}>
                {draggingCard.word}
              </Text>
            </View>
            <View style={styles.handle}>
              <Ionicons name="reorder-three-outline" size={26} color={pal.sub} />
            </View>
          </Animated.View>
        </Modal>
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20 },

  row:      { marginBottom: 10 },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'stretch',   // handle stretches to text height, not the other way round
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // Mirrors SwipeableCard's cardFlipArea exactly
  flipArea: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  cardText: { fontSize: 18, fontWeight: '600' },

  handle: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowStripe: {
    position: 'absolute',
    bottom: 4,
    right: -15,
    width: 40,
    height: 5,
    opacity: 0.7,
    transform: [{ rotate: '-45deg' }],
  },

  // Ghost card — absolute, lifted shadow, slightly scaled
  ghost: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    transform: [{ scale: 1.03 }],
  },
});
