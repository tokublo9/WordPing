import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Palette, WordCard } from '../types';
import { speak as ttsSpeak, stopPlayback } from '../lib/tts';
import { useLang } from '../i18n';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W          = SCREEN_W - 48;
const CARD_H          = 280;
const CARD_MARGIN     = (SCREEN_W - CARD_W) / 2;
const SWIPE_THRESHOLD = SCREEN_W * 0.25;

interface Props {
  cards: WordCard[];
  pal: Palette;
  themeColor: string;
  isSubscribed: boolean;
  onEdit: (card: WordCard) => void;
  onDelete: (id: string) => void;
  onMove: (card: WordCard) => void;
  onToggleNotif: (id: string) => void;
  showLevelLabel?: boolean;
}

// Returns { curr, next, prev } slot indices given the current center slot.
// Slots rotate: 0→1→2→0 so next = (curr+1)%3, prev = (curr+2)%3.
function getSlots(curr: number) {
  return { curr, next: (curr + 1) % 3, prev: (curr + 2) % 3 };
}

// Font size computed from text length — single-pass, no re-measurement, no flash.
// Thresholds are derived from card inner area: (SCREEN_W-48-56) × 224px at each size.
// Default (32 / 22) is kept whenever the text fits; only reduced as much as needed.
function wordFontSize(text: string): number {
  const n = text.length;
  if (n <= 40)  return 32;
  if (n <= 65)  return 26;
  if (n <= 100) return 20;
  return 16;
}

function meaningFontSize(text: string): { fontSize: number; lineHeight: number } {
  const n = text.length;
  if (n <= 80)  return { fontSize: 22, lineHeight: 30 };
  if (n <= 140) return { fontSize: 18, lineHeight: 25 };
  if (n <= 200) return { fontSize: 15, lineHeight: 21 };
  return { fontSize: 13, lineHeight: 18 };
}

export function FlipCardBrowser({ cards, pal, themeColor, isSubscribed, onEdit, onDelete, onMove, onToggleNotif, showLevelLabel = true }: Props) {
  const t = useLang();

  // ── Three independent slot positions ──────────────────────────────────────
  //
  // Each physical slot has its OWN Animated.Value so positions are never
  // coupled via Animated.add. Slots rotate through "curr / next / prev" roles
  // as the user swipes. Content is only updated on whichever slot is currently
  // offscreen (±SCREEN_W), so a native view with stale text is never visible.

  const slot0X = useRef(new Animated.Value(0)).current;
  const slot1X = useRef(new Animated.Value(SCREEN_W)).current;
  const slot2X = useRef(new Animated.Value(-SCREEN_W)).current;
  // Stable reference array for access inside the panResponder closure.
  const slotXRef = useRef([slot0X, slot1X, slot2X]);

  // Which WordCard each physical slot is currently loaded with.
  const [slotCards, setSlotCards] = useState<(WordCard | undefined)[]>(() => [
    cards[0],
    cards[1],
    undefined,   // no prev card when starting at index 0
  ]);

  // Which slot index is the centered "current" card.
  const [currSlot, setCurrSlot] = useState(0);
  const currSlotRef             = useRef(0);
  currSlotRef.current           = currSlot;

  // ── General state ─────────────────────────────────────────────────────────

  const [idx,     setIdx]     = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [playing, setPlaying] = useState(false);

  const flipAnim = useRef(new Animated.Value(0)).current;

  const hasNext = idx < cards.length - 1;
  const hasPrev = idx > 0;

  const idxRef          = useRef(idx);
  const hasNextRef      = useRef(hasNext);
  const hasPrevRef      = useRef(hasPrev);
  idxRef.current        = idx;
  hasNextRef.current    = hasNext;
  hasPrevRef.current    = hasPrev;

  const cardsRef        = useRef(cards);
  cardsRef.current      = cards;

  // Prevents a second swipe from starting mid-animation.
  const transitioningRef = useRef(false);

  // ── Flip interpolations (native driver) ───────────────────────────────────

  const frontRotate  = flipAnim.interpolate({ inputRange: [0, 0.5],    outputRange: ['0deg', '-90deg'], extrapolate: 'clamp' });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0.35, 0.5], outputRange: [1, 0],             extrapolate: 'clamp' });
  const backRotate   = flipAnim.interpolate({ inputRange: [0.5, 1],    outputRange: ['90deg', '0deg'],  extrapolate: 'clamp' });
  const backOpacity  = flipAnim.interpolate({ inputRange: [0.5, 0.65], outputRange: [0, 1],             extrapolate: 'clamp' });

  useEffect(() => () => { stopPlayback(); }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  // Jump to any arbitrary index (progress scrubber, delete navigation).
  // Resets all slots to a clean layout: slot 0 = curr, slot 1 = next, slot 2 = prev.
  const goTo = useCallback((newIdx: number) => {
    stopPlayback();
    setPlaying(false);
    flipAnim.setValue(0);
    setFlipped(false);
    const c  = cardsRef.current;
    const sX = slotXRef.current;
    setSlotCards([c[newIdx], c[newIdx + 1], c[newIdx - 1]]);
    sX[0].setValue(0);
    sX[1].setValue(SCREEN_W);
    sX[2].setValue(-SCREEN_W);
    currSlotRef.current = 0;
    setCurrSlot(0);
    setIdx(newIdx);
  }, [flipAnim]);

  const doFlip = useCallback(() => {
    const toValue = flipped ? 0 : 1;
    Animated.timing(flipAnim, { toValue, duration: 350, useNativeDriver: true })
      .start(() => setFlipped(f => !f));
  }, [flipped, flipAnim]);

  const speak = useCallback((text: string, lang?: string) => {
    if (playing) { stopPlayback(); setPlaying(false); return; }
    setPlaying(true);
    ttsSpeak(text, isSubscribed, lang).then(() => setPlaying(false)).catch(() => setPlaying(false));
  }, [playing, isSubscribed]);

  const handleDelete = useCallback(() => {
    const c = cardsRef.current[idxRef.current];
    if (!c) return;
    stopPlayback();
    setPlaying(false);
    if (hasPrevRef.current) {
      goTo(idxRef.current - 1);
    } else if (hasNextRef.current) {
      flipAnim.setValue(0);
      setFlipped(false);
      // Stay at same index; the useEffect below resyncs slots after onDelete.
    }
    onDelete(c.id);
  }, [goTo, flipAnim, onDelete]);

  // ── PanResponder ──────────────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, { dx, dy }) =>
        !transitioningRef.current &&
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,

      // All three slots move together by dx — no Animated.add coupling.
      onPanResponderMove: (_, { dx }) => {
        const { curr, next, prev } = getSlots(currSlotRef.current);
        const sX = slotXRef.current;
        sX[curr].setValue(dx);
        sX[next].setValue(SCREEN_W  + dx);
        sX[prev].setValue(-SCREEN_W + dx);
      },

      onPanResponderRelease: (_, { dx, vx }) => {
        const slots  = getSlots(currSlotRef.current);
        const sX     = slotXRef.current;
        const toNext = (dx < -SWIPE_THRESHOLD || vx < -0.5) && hasNextRef.current;
        const toPrev = (dx > SWIPE_THRESHOLD  || vx > 0.5)  && hasPrevRef.current;

        if (toNext || toPrev) {
          transitioningRef.current = true;
          const outSlot   = slots.curr;
          const inSlot    = toNext ? slots.next : slots.prev;
          const outTarget = toNext ? -SCREEN_W : SCREEN_W;

          Animated.parallel([
            Animated.timing(sX[outSlot], { toValue: outTarget, duration: 220, useNativeDriver: false }),
            Animated.timing(sX[inSlot],  { toValue: 0,         duration: 220, useNativeDriver: false }),
          ]).start(() => {
            const newIdx    = toNext ? idxRef.current + 1 : idxRef.current - 1;
            const c         = cardsRef.current;
            // The third slot (not outSlot, not inSlot) was the opposite adjacent.
            // Reposition it offscreen on the other side and load the new card.
            const unusedSlot = ([0, 1, 2] as const).find(s => s !== outSlot && s !== inSlot)!;

            if (toNext) {
              // unusedSlot was prev → becomes new next (right side).
              sX[unusedSlot].setValue(SCREEN_W);
              setSlotCards(prev => { const n = [...prev]; n[unusedSlot] = c[newIdx + 1]; return n; });
            } else {
              // unusedSlot was next → becomes new prev (left side).
              sX[unusedSlot].setValue(-SCREEN_W);
              setSlotCards(prev => { const n = [...prev]; n[unusedSlot] = c[newIdx - 1]; return n; });
            }

            // inSlot is already at x=0 showing the correct card — no content change here.
            // outSlot is at ±SCREEN_W with its old card — it now becomes the opposite adjacent.
            currSlotRef.current = inSlot;
            setCurrSlot(inSlot);
            setIdx(newIdx);
            flipAnim.setValue(0);
            setFlipped(false);
            stopPlayback();
            setPlaying(false);
            transitioningRef.current = false;
          });

        } else {
          // Threshold not reached — spring everything back to home positions.
          const { curr, next, prev } = slots;
          Animated.parallel([
            Animated.spring(sX[curr], { toValue: 0,         useNativeDriver: false, restSpeedThreshold: 0.1, restDisplacementThreshold: 0.1 }),
            Animated.spring(sX[next], { toValue: SCREEN_W,  useNativeDriver: false, restSpeedThreshold: 0.1, restDisplacementThreshold: 0.1 }),
            Animated.spring(sX[prev], { toValue: -SCREEN_W, useNativeDriver: false, restSpeedThreshold: 0.1, restDisplacementThreshold: 0.1 }),
          ]).start(() => {
            sX[curr].setValue(0);
            sX[next].setValue(SCREEN_W);
            sX[prev].setValue(-SCREEN_W);
          });
        }
      },

      onPanResponderTerminate: () => {
        const { curr, next, prev } = getSlots(currSlotRef.current);
        const sX = slotXRef.current;
        sX[curr].setValue(0);
        sX[next].setValue(SCREEN_W);
        sX[prev].setValue(-SCREEN_W);
      },
    })
  ).current;

  // ── Progress bar scrubber ─────────────────────────────────────────────────

  const TRACK_W = CARD_W;

  const thumbX        = useRef(new Animated.Value(0)).current;
  const thumbXRef     = useRef(0);
  const cardsLenRef   = useRef(cards.length);
  const goToRef       = useRef(goTo);
  cardsLenRef.current = cards.length;
  goToRef.current     = goTo;

  useEffect(() => {
    const n = cards.length;
    const x = n > 1 ? (idx / (n - 1)) * TRACK_W : 0;
    thumbXRef.current = x;
    thumbX.setValue(x);
  }, [idx, cards.length, thumbX]);

  const progressPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderMove: (_, { dx }) => {
        const x = Math.max(0, Math.min(TRACK_W, thumbXRef.current + dx));
        thumbX.setValue(x);
      },
      onPanResponderRelease: (_, { dx }) => {
        const n      = cardsLenRef.current;
        const x      = Math.max(0, Math.min(TRACK_W, thumbXRef.current + dx));
        const i      = n > 1 ? Math.round((x / TRACK_W) * (n - 1)) : 0;
        const target = Math.max(0, Math.min(n - 1, i));
        const snapX  = n > 1 ? (target / (n - 1)) * TRACK_W : 0;
        thumbXRef.current = snapX;
        thumbX.setValue(snapX);
        goToRef.current(target);
      },
    })
  ).current;

  // ── Sync slots after external card list change (e.g. deletion) ────────────

  useEffect(() => {
    if (!transitioningRef.current) {
      const i = idxRef.current;
      const c = cardsRef.current;
      if (c[i]) {
        const sX = slotXRef.current;
        setSlotCards([c[i], c[i + 1], c[i - 1]]);
        sX[0].setValue(0);
        sX[1].setValue(SCREEN_W);
        sX[2].setValue(-SCREEN_W);
        currSlotRef.current = 0;
        setCurrSlot(0);
      }
    }
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Level stripe ──────────────────────────────────────────────────────────

  const STRIPE_COLORS: Partial<Record<string, string>> = {
    perfect: '#22c55e', good: '#3B82F6', slightly: '#f59e0b', unknown: '#ef4444',
  };
  const stripe = (c: WordCard) => {
    const color = showLevelLabel && c.testLevel ? STRIPE_COLORS[c.testLevel] : null;
    return color ? <View style={[s.flipStripe, { backgroundColor: color }]} /> : null;
  };

  const card = slotCards[currSlot];
  if (!card) return null;

  const voiceIcon = 'volume-medium-outline';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>

      <Text style={[s.counter, { color: pal.sub }]}>{`${idx + 1} / ${cards.length}`}</Text>

      <View style={s.deckWrap}>
        {([0, 1, 2] as const).map(si => {
          const c = slotCards[si];
          if (!c) return null;
          const isCurr = si === currSlot;

          return (
            <Animated.View
              key={si}
              style={[s.cardOuter, { transform: [{ translateX: slotXRef.current[si] }] }]}
              {...(isCurr ? panResponder.panHandlers : undefined)}
            >
              {isCurr ? (
                // Current card — flip + voice enabled.
                <TouchableOpacity activeOpacity={0.95} onPress={doFlip} style={s.flipArea}>
                  <Animated.View
                    style={[s.face, { opacity: frontOpacity, transform: [{ perspective: 900 }, { rotateY: frontRotate }] }]}
                  >
                    <View style={[s.cardInner, { backgroundColor: pal.card }]}>
                      {stripe(c)}
                      <Text style={[s.wordText, { color: pal.text, fontSize: wordFontSize(c.word) }]}>
                        {c.word}
                      </Text>
                    </View>
                    <TouchableOpacity style={s.voiceBtn} onPress={() => speak(c.word, c.wordLang)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name={voiceIcon as any} size={20} color={themeColor} />
                    </TouchableOpacity>
                  </Animated.View>
                  <Animated.View
                    style={[s.face, s.faceAbsolute, { opacity: backOpacity, transform: [{ perspective: 900 }, { rotateY: backRotate }] }]}
                  >
                    <View style={[s.cardInner, { backgroundColor: pal.card }]}>
                      <Text style={[s.meaningText, { color: pal.text, ...meaningFontSize(c.meaning) }]}>{c.meaning}</Text>
                      {c.note ? <Text style={[s.noteText, { color: pal.sub }]}>{c.note}</Text> : null}
                    </View>
                    <TouchableOpacity style={s.voiceBtn} onPress={() => speak(c.meaning, c.meaningLang)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name={voiceIcon as any} size={20} color={themeColor} />
                    </TouchableOpacity>
                  </Animated.View>
                </TouchableOpacity>
              ) : (
                // Adjacent card — front face only, no interaction.
                <View style={[s.cardInner, { backgroundColor: pal.card }]}>
                  {stripe(c)}
                  <Text style={[s.wordText, { color: pal.text, fontSize: wordFontSize(c.word) }]}>
                    {c.word}
                  </Text>
                </View>
              )}
            </Animated.View>
          );
        })}
      </View>

      {/* Progress bar */}
      <View style={s.progressWrap}>
        <View style={[s.trackBg, { backgroundColor: pal.border }]} />
        <Animated.View style={[s.trackFill, { backgroundColor: themeColor, width: thumbX }]} />
        <Animated.View
          style={[s.thumb, { backgroundColor: themeColor, transform: [{ translateX: thumbX }] }]}
          {...progressPan.panHandlers}
        />
      </View>

      {/* Action buttons — order: Notification (icon-only) · Move · Edit · Delete (text-only) */}
      <View style={s.actionRow}>
        <TouchableOpacity
          style={[s.notifBtn, { borderColor: card.notifOff ? pal.border : themeColor }]}
          onPress={() => onToggleNotif(card.id)}
        >
          <Ionicons
            name={card.notifOff ? 'notifications-off-outline' : 'notifications-outline'}
            size={20}
            color={card.notifOff ? pal.sub : themeColor}
          />
        </TouchableOpacity>

        <TouchableOpacity style={[s.actionBtn, { borderColor: pal.border }]} onPress={() => onMove(card)}>
          <Ionicons name="folder-outline" size={17} color={pal.sub} />
          <Text style={[s.actionLabel, { color: pal.sub }]}>{t('move')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.actionBtn, { borderColor: pal.border }]} onPress={() => onEdit(card)}>
          <Ionicons name="pencil-outline" size={17} color={pal.sub} />
          <Text style={[s.actionLabel, { color: pal.sub }]}>{t('edit')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.actionBtn, { borderColor: pal.border }]} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={17} color={pal.sub} />
          <Text style={[s.actionLabel, { color: pal.sub }]}>{t('delete')}</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
  },
  counter: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
  },
  deckWrap: {
    width: SCREEN_W,
    height: CARD_H,
  },
  cardOuter: {
    position: 'absolute',
    top: 0,
    left: CARD_MARGIN,
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 5,
  },
  cardInner: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  flipArea: {
    width: CARD_W,
    height: CARD_H,
  },
  face: {
    width: CARD_W,
    height: CARD_H,
  },
  faceAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  wordText: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  meaningText: {
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 30,
  },
  noteText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 23,
    marginTop: 20,
  },
  voiceBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  notifBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressWrap: {
    width: CARD_W,
    height: 26,
    justifyContent: 'center',
    marginTop: 20,
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    left: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  flipStripe: {
    position: 'absolute',
    bottom: 4,
    right: -15,
    width: 40,
    height: 8,
    opacity: 0.7,
    transform: [{ rotate: '-45deg' }],
  },
});
