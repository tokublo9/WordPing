import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useLang } from '../i18n';
import {
  FLIP_CARD_H, FLIP_CARD_RADIUS, FLIP_CARD_W,
  FLIP_MEANING_FONT_SIZE, FLIP_MEANING_LINE_H,
  FLIP_NOTE_FONT_SIZE, FLIP_NOTE_LINE_H, FLIP_NOTE_MARGIN_TOP,
  FLIP_WORD_FONT_SIZE,
} from '../constants';
import { scrubberIndexForX, scrubberXForIndex } from '../features/cards/flipScrubber';
import { resolveCurrentWordIndex } from '../features/cards/currentWordPosition';
import { CardScrollFace } from './CardScrollFace';
import { WordCardVoiceButton } from './WordCardVoiceButton';
import { useWordCardVoicePlayback } from '../hooks/useWordCardVoicePlayback';
import { CardResultAccessibilityLabel } from './CardResultAccessibilityLabel';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_MARGIN     = (SCREEN_W - FLIP_CARD_W) / 2;

// ── Progress scrubber geometry ────────────────────────────────────────────────
// The thumb centre travels 0…TRACK_W; card i sits at xForIndex(i).
const TRACK_W = FLIP_CARD_W;
// Invisible touch target around the 18px circle. The wrapper reserves this much slack
// on every side, because iOS does not hit-test a child outside its parent's bounds.
const THUMB_HIT_SIZE = 44;
const HIT_PAD = THUMB_HIT_SIZE / 2;
// Per-card tick marks, shown only while scrubbing.
const TICK_W = 2;
const TICK_H = 9;
// Height the scrubber row occupied before it had to host the touch target, and the
// slack the taller target adds above and below it. Both surrounding margins shed that
// slack so the track stays on exactly the same baseline as before.
const TRACK_ROW_H = 26;
const HIT_OVERHANG = (THUMB_HIT_SIZE - TRACK_ROW_H) / 2;

const xForIndex = (index: number, count: number): number =>
  scrubberXForIndex(index, count, TRACK_W);

const indexForX = (x: number, count: number): number =>
  scrubberIndexForX(x, count, TRACK_W);
const SWIPE_THRESHOLD = SCREEN_W * 0.25;
const SLOT_INDICES = [0, 1, 2] as const;
const STRIPE_COLORS: Partial<Record<string, string>> = {
  perfect: '#22c55e', good: '#3B82F6', slightly: '#f59e0b', unknown: '#ef4444',
};

interface Props {
  cards: WordCard[];
  currentWordId: string | null;
  onCurrentWordChange: (id: string | null) => void;
  active: boolean;
  pal: Palette;
  themeColor: string;
  isSubscribed: boolean;
  onEdit: (card: WordCard) => void;
  onDelete: (id: string) => void;
  onMove: (card: WordCard) => void;
  onToggleNotif: (id: string) => void;
  showLevelLabel?: boolean;
  verticalFlip?: boolean;
  isPremium?: boolean;
  onCustomVoiceLocked?: () => void;
}

// Returns { curr, next, prev } slot indices given the current center slot.
// Slots rotate: 0→1→2→0 so next = (curr+1)%3, prev = (curr+2)%3.
function getSlots(curr: number) {
  return { curr, next: (curr + 1) % 3, prev: (curr + 2) % 3 };
}


function FlipCardBrowserComponent({
  cards, currentWordId, onCurrentWordChange, active,
  pal, themeColor, isSubscribed, onEdit, onDelete, onMove, onToggleNotif,
  showLevelLabel = true, verticalFlip = false, isPremium = false, onCustomVoiceLocked,
}: Props) {
  const t = useLang();
  const initialIndex = resolveCurrentWordIndex(cards, currentWordId);

  // ── Shared swipe graph with three slot bases ───────────────────────────────
  //
  // All three slots derive from one gesture value. A finger move therefore crosses the
  // JS/native boundary once, and the cards plus progress thumb consume the same value.
  // Slot bases only change after a swipe settles, while the affected cards are offscreen.
  const swipeX = useRef(new Animated.Value(0)).current;
  const slot0BaseX = useRef(new Animated.Value(0)).current;
  const slot1BaseX = useRef(new Animated.Value(SCREEN_W)).current;
  const slot2BaseX = useRef(new Animated.Value(-SCREEN_W)).current;
  const slotBaseXRef = useRef([slot0BaseX, slot1BaseX, slot2BaseX]);
  const slotTranslateX = useMemo(
    () => slotBaseXRef.current.map(baseX => Animated.add(baseX, swipeX)),
    [swipeX],
  );

  // Which WordCard each physical slot is currently loaded with.
  const [slotCards, setSlotCards] = useState<(WordCard | undefined)[]>(() => [
    cards[initialIndex],
    cards[initialIndex + 1],
    cards[initialIndex - 1],
  ]);
  const slotCardsRef = useRef(slotCards);
  slotCardsRef.current = slotCards;

  // Which slot index is the centered "current" card.
  const [currSlot, setCurrSlot] = useState(0);
  const currSlotRef             = useRef(0);
  currSlotRef.current           = currSlot;

  // ── General state ─────────────────────────────────────────────────────────

  const [idx,     setIdx]     = useState(() => Math.max(0, initialIndex));
  const [flipped, setFlipped] = useState(false);

  const cardsById = useMemo(
    () => new Map(cards.map(candidate => [candidate.id, candidate])),
    [cards],
  );

  const activeVoiceCard = slotCards[currSlot]
    ? cardsById.get(slotCards[currSlot]!.id) ?? slotCards[currSlot]
    : null;
  const {
    voiceState,
    playWord,
    playMeaning,
    stopVoice,
  } = useWordCardVoicePlayback({
    item: activeVoiceCard,
    isSubscribed,
    isPremium,
    onCustomVoiceLocked,
  });

  const flipAnim = useRef(new Animated.Value(0)).current;
  const committedThumbX = useRef(new Animated.Value(xForIndex(Math.max(0, initialIndex), cards.length))).current;
  const scrubThumbX = useRef(new Animated.Value(0)).current;
  const thumbXRef = useRef(xForIndex(Math.max(0, initialIndex), cards.length));

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
  const previousCardsRef = useRef(cards);
  const onCurrentWordChangeRef = useRef(onCurrentWordChange);
  onCurrentWordChangeRef.current = onCurrentWordChange;

  // Prevents a second swipe from starting mid-animation.
  const transitioningRef = useRef(false);
  const mountedRef = useRef(true);

  const swipeThumbX = useMemo(() => {
    const step = cards.length > 1 ? TRACK_W / (cards.length - 1) : 0;
    const gestureProgress = Animated.multiply(swipeX, -step / SCREEN_W);
    return Animated.add(committedThumbX, gestureProgress);
  }, [cards.length, committedThumbX, swipeX]);

  // ── Flip interpolations (native driver) ───────────────────────────────────

  const { frontRotate, frontOpacity, backRotate, backOpacity } = useMemo(() => ({
    frontRotate: flipAnim.interpolate({ inputRange: [0, 0.5], outputRange: ['0deg', '-90deg'], extrapolate: 'clamp' }),
    frontOpacity: flipAnim.interpolate({ inputRange: [0.35, 0.5], outputRange: [1, 0], extrapolate: 'clamp' }),
    backRotate: flipAnim.interpolate({ inputRange: [0.5, 1], outputRange: ['90deg', '0deg'], extrapolate: 'clamp' }),
    backOpacity: flipAnim.interpolate({ inputRange: [0.5, 0.65], outputRange: [0, 1], extrapolate: 'clamp' }),
  }), [flipAnim]);

  const rotateKey = verticalFlip ? 'rotateX' : 'rotateY';

  // Both modes remain mounted. If the user switches during a swipe/flip animation,
  // cancel it at the currently committed card so a hidden completion cannot move the
  // visible list afterward.
  useLayoutEffect(() => {
    if (active) return;
    flipAnim.stopAnimation();
    flipAnim.setValue(0);
    setFlipped(false);
    stopVoice();
    const { curr, next, prev } = getSlots(currSlotRef.current);
    swipeX.stopAnimation();
    swipeX.setValue(0);
    const bases = slotBaseXRef.current;
    bases[curr].setValue(0);
    bases[next].setValue(SCREEN_W);
    bases[prev].setValue(-SCREEN_W);
    transitioningRef.current = false;
  }, [active, flipAnim, stopVoice, swipeX]);

  // ── Actions ───────────────────────────────────────────────────────────────

  // Jump to any arbitrary index (progress scrubber, delete navigation).
  // Resets all slots to a clean layout: slot 0 = curr, slot 1 = next, slot 2 = prev.
  const goTo = useCallback((newIdx: number, publishCurrentWord = true) => {
    stopVoice();
    flipAnim.setValue(0);
    setFlipped(false);
    const c  = cardsRef.current;
    if (c.length === 0) {
      idxRef.current = 0;
      setIdx(0);
      setSlotCards([undefined, undefined, undefined]);
      onCurrentWordChangeRef.current(null);
      return;
    }
    const target = Math.max(0, Math.min(Math.trunc(newIdx), c.length - 1));
    setSlotCards([c[target], c[target + 1], c[target - 1]]);
    const bases = slotBaseXRef.current;
    bases[0].setValue(0);
    bases[1].setValue(SCREEN_W);
    bases[2].setValue(-SCREEN_W);
    swipeX.setValue(0);
    currSlotRef.current = 0;
    setCurrSlot(0);
    idxRef.current = target;
    setIdx(target);
    const targetX = xForIndex(target, c.length);
    thumbXRef.current = targetX;
    committedThumbX.setValue(targetX);
    if (publishCurrentWord) onCurrentWordChangeRef.current(c[target].id);
  }, [committedThumbX, flipAnim, stopVoice, swipeX]);

  const doFlip = useCallback(() => {
    const toValue = flipped ? 0 : 1;
    Animated.timing(flipAnim, { toValue, duration: 350, useNativeDriver: true })
      .start(({ finished }) => {
        if (finished && mountedRef.current) setFlipped(f => !f);
      });
  }, [flipped, flipAnim]);

  const handleDelete = useCallback(() => {
    const c = cardsRef.current[idxRef.current];
    if (!c) return;
    stopVoice();
    if (hasPrevRef.current) {
      goTo(idxRef.current - 1);
    } else if (hasNextRef.current) {
      flipAnim.setValue(0);
      setFlipped(false);
      // Stay at same index; the synchronization effect below resyncs after onDelete.
    }
    onDelete(c.id);
  }, [goTo, flipAnim, onDelete, stopVoice]);

  // ── PanResponder ──────────────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, { dx, dy }) =>
        !transitioningRef.current &&
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,

      // One shared value drives all three cards and the progress thumb.
      onPanResponderMove: (_, { dx }) => {
        // Clamp invalid edge movement here rather than using a stateful diffClamp node;
        // this keeps the first/last progress positions exact after a cancelled drag.
        const minX = hasNextRef.current ? -SCREEN_W : 0;
        const maxX = hasPrevRef.current ? SCREEN_W : 0;
        swipeX.setValue(Math.max(minX, Math.min(maxX, dx)));
      },

      onPanResponderRelease: (_, { dx, vx }) => {
        const slots  = getSlots(currSlotRef.current);
        const toNext = (dx < -SWIPE_THRESHOLD || vx < -0.5) && hasNextRef.current;
        const toPrev = (dx > SWIPE_THRESHOLD  || vx > 0.5)  && hasPrevRef.current;

        if (toNext || toPrev) {
          transitioningRef.current = true;
          const outSlot   = slots.curr;
          const inSlot    = toNext ? slots.next : slots.prev;
          const outTarget = toNext ? -SCREEN_W : SCREEN_W;

          Animated.timing(swipeX, {
            toValue: outTarget,
            duration: 220,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (!finished || !mountedRef.current) {
              transitioningRef.current = false;
              return;
            }
            const newIdx    = toNext ? idxRef.current + 1 : idxRef.current - 1;
            const c         = cardsRef.current;
            // The third slot (not outSlot, not inSlot) was the opposite adjacent.
            // Reposition it offscreen on the other side and load the new card.
            const unusedSlot = SLOT_INDICES.find(s => s !== outSlot && s !== inSlot)!;
            const bases = slotBaseXRef.current;

            if (toNext) {
              // unusedSlot was prev → becomes new next (right side).
              bases[outSlot].setValue(-SCREEN_W);
              bases[inSlot].setValue(0);
              bases[unusedSlot].setValue(SCREEN_W);
              setSlotCards(prev => { const n = [...prev]; n[unusedSlot] = c[newIdx + 1]; return n; });
            } else {
              // unusedSlot was next → becomes new prev (left side).
              bases[outSlot].setValue(SCREEN_W);
              bases[inSlot].setValue(0);
              bases[unusedSlot].setValue(-SCREEN_W);
              setSlotCards(prev => { const n = [...prev]; n[unusedSlot] = c[newIdx - 1]; return n; });
            }
            swipeX.setValue(0);

            // inSlot is already at x=0 showing the correct card — no content change here.
            // outSlot is at ±SCREEN_W with its old card — it now becomes the opposite adjacent.
            currSlotRef.current = inSlot;
            setCurrSlot(inSlot);
            idxRef.current = newIdx;
            setIdx(newIdx);
            const targetX = xForIndex(newIdx, c.length);
            thumbXRef.current = targetX;
            committedThumbX.setValue(targetX);
            onCurrentWordChangeRef.current(c[newIdx]?.id ?? null);
            flipAnim.setValue(0);
            setFlipped(false);
            stopVoice();
            transitioningRef.current = false;
          });

        } else {
          // Threshold not reached — spring everything back to home positions.
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
            restSpeedThreshold: 0.1,
            restDisplacementThreshold: 0.1,
          }).start();
        }
      },

      onPanResponderTerminate: () => {
        swipeX.stopAnimation();
        swipeX.setValue(0);
      },
    })
  ).current;

  // ── Progress bar scrubber ─────────────────────────────────────────────────

  const cardsLenRef   = useRef(cards.length);
  const goToRef       = useRef(goTo);
  cardsLenRef.current = cards.length;
  goToRef.current     = goTo;

  // Tick marks are mounted only for the duration of a scrub.
  const [scrubbing, setScrubbing] = useState(false);
  // The thumb follows the finger continuously while the card snaps per tick, so the
  // index-driven sync below must not fight the gesture mid-drag.
  const scrubbingRef  = useRef(false);
  const dragStartXRef = useRef(0);
  const scrubIdxRef   = useRef(0);

  useEffect(() => {
    // Skipped mid-scrub: the gesture owns the thumb until the finger lifts, otherwise
    // each committed card would yank the thumb back onto its tick under the finger.
    if (scrubbingRef.current) return;
    const x = xForIndex(idx, cards.length);
    thumbXRef.current = x;
    committedThumbX.setValue(x);
  }, [idx, cards.length, committedThumbX]);

  const progressPan = useRef(
    PanResponder.create({
      // Claimed on touch down so a press-and-hold owns the gesture before any movement,
      // and nothing else can take it away mid-drag.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: () => {
        scrubbingRef.current = true;
        dragStartXRef.current = thumbXRef.current;
        scrubIdxRef.current = idxRef.current;
        setScrubbing(true);
      },

      onPanResponderMove: (_, { dx }) => {
        const n = cardsLenRef.current;
        const x = Math.max(0, Math.min(TRACK_W, dragStartXRef.current + dx));
        // Continuous so the thumb tracks the finger; the card commits per tick.
        scrubThumbX.setValue(x);
        const target = indexForX(x, n);
        if (target !== scrubIdxRef.current) {
          scrubIdxRef.current = target;
          // Keep the existing live card preview, but defer shared app state and the
          // hidden-list restoration until release instead of doing that work per tick.
          goToRef.current(target, false);
        }
      },

      onPanResponderRelease: () => {
        const n = cardsLenRef.current;
        const target = scrubIdxRef.current;
        // Settle exactly on the tick the card is showing.
        const snapX = xForIndex(target, n);
        thumbXRef.current = snapX;
        scrubThumbX.setValue(snapX);
        if (target !== idxRef.current) goToRef.current(target);
        else onCurrentWordChangeRef.current(cardsRef.current[target]?.id ?? null);
        scrubbingRef.current = false;
        setScrubbing(false);
      },

      onPanResponderTerminate: () => {
        const n = cardsLenRef.current;
        const snapX = xForIndex(idxRef.current, n);
        thumbXRef.current = snapX;
        scrubThumbX.setValue(snapX);
        scrubbingRef.current = false;
        setScrubbing(false);
      },
    })
  ).current;

  // Tapping anywhere on the track jumps to that card. This responder sits *under* the
  // thumb's, so a touch that lands on the thumb is claimed by the thumb and drags as
  // usual — the two never compete for the same gesture.
  const tapXRef = useRef(0);
  const trackTapPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: event => {
        // locationX is relative to this view, which spans the padded wrapper, so the
        // slack beyond either end of the track reads as past-the-end and clamps below.
        tapXRef.current = event.nativeEvent.locationX - HIT_PAD;
      },
      onPanResponderRelease: () => {
        const target = indexForX(tapXRef.current, cardsLenRef.current);
        if (target !== idxRef.current) goToRef.current(target);
      },
    })
  ).current;

  // ── Sync slots after external card order/current-word changes ─────────────

  useLayoutEffect(() => {
    if (!active) {
      previousCardsRef.current = cards;
      return;
    }
    if (transitioningRef.current) return;
    const target = resolveCurrentWordIndex(
      cards,
      currentWordId,
      idxRef.current,
      previousCardsRef.current,
    );
    previousCardsRef.current = cards;
    if (target < 0) {
      if (currentWordId !== null) onCurrentWordChangeRef.current(null);
      return;
    }

    const targetId = cards[target].id;
    const centeredId = slotCardsRef.current[currSlotRef.current]?.id;
    if (target !== idxRef.current || centeredId !== targetId) {
      goTo(target);
    } else if (currentWordId !== targetId) {
      onCurrentWordChangeRef.current(targetId);
    }
  }, [active, cards, currentWordId, goTo]);

  // Cancelling a swipe by switching modes must not let its completion callback publish
  // a stale card after the list has already been restored.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      transitioningRef.current = false;
      flipAnim.stopAnimation();
      swipeX.stopAnimation();
    };
  }, [flipAnim, swipeX]);

  // ── Level stripe ──────────────────────────────────────────────────────────

  const stripe = useCallback((c: WordCard) => {
    const color = showLevelLabel && c.testLevel ? STRIPE_COLORS[c.testLevel] : null;
    return color ? <View style={[s.flipStripe, { backgroundColor: color }]} /> : null;
  }, [showLevelLabel]);

  // One tick per card at its exact scrubber position. Built per card count so a scrub
  // never rebuilds them, and mounted only while scrubbing.
  const ticks = useMemo(() => {
    const n = cards.length;
    if (n < 2) return null;
    return Array.from({ length: n }, (_, i) => (
      <View
        key={i}
        style={[s.tick, { left: HIT_PAD + xForIndex(i, n) - TICK_W / 2, backgroundColor: pal.sub }]}
      />
    ));
  }, [cards.length, pal.sub]);

  // Slot content is intentionally stable during horizontal transitions, but
  // mutable card properties (such as notifOff) must always come from the latest
  // cards prop. This also avoids a stale first frame when Flip View is reopened.
  const resolveLatestCard = useCallback(
    (slotCard: WordCard | undefined) => slotCard
      ? cardsById.get(slotCard.id) ?? slotCard
      : undefined,
    [cardsById],
  );

  const displayedThumbX = scrubbing ? scrubThumbX : swipeThumbX;
  const progressScaleX = useMemo(
    () => Animated.divide(displayedThumbX, TRACK_W),
    [displayedThumbX],
  );

  const card = resolveLatestCard(slotCards[currSlot]);
  if (!card) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>

      {/* Card position — reads straight off `idx`, so a tap, a drag and a swipe all
          move it in step with the thumb and the card below. */}
      <Text style={[s.counter, { color: pal.sub }]}>{`${idx + 1} / ${cards.length}`}</Text>

      <View style={s.deckWrap}>
        {SLOT_INDICES.map(si => {
          const c = resolveLatestCard(slotCards[si]);
          if (!c) return null;
          const isCurr = si === currSlot;
          // Only static adjacent previews may be texture-cached. The current slot
          // owns a ScrollView; rasterizing that interactive subtree can preserve
          // its first viewport-sized layer until scrolling invalidates the cache.
          const cacheStaticPreview = active && !isCurr;

          return (
            <Animated.View
              key={si}
              style={[s.cardOuter, { transform: [{ translateX: slotTranslateX[si] }] }]}
              renderToHardwareTextureAndroid={cacheStaticPreview}
              shouldRasterizeIOS={cacheStaticPreview}
              {...(isCurr ? panResponder.panHandlers : undefined)}
            >
              {isCurr && <CardResultAccessibilityLabel testLevel={c.testLevel} />}
              {isCurr ? (
                // Pressable inside each CardScrollFace handles flip for taps.
                // ScrollView inside CardScrollFace handles vertical scrolling.
                // PanResponder on cardOuter handles horizontal card navigation.
                // All three coexist because Pressable yields its responder to both
                // the ScrollView (vertical) and the PanResponder (horizontal).
                <>
                  <Animated.View
                    style={[s.face, { backgroundColor: pal.card }, { opacity: frontOpacity, transform: [{ perspective: 900 }, { [rotateKey]: frontRotate } as any] }]}
                  >
                    <CardScrollFace
                      onFlip={doFlip}
                      voiceButton={(
                        <WordCardVoiceButton
                          onPress={playWord}
                          phase={voiceState?.target === 'word' ? voiceState.phase : undefined}
                          themeColor={themeColor}
                          inactiveColor={pal.sub}
                        />
                      )}
                    >
                      <Text style={[s.wordText, { color: pal.text }]}>{c.word}</Text>
                    </CardScrollFace>
                    {c.notifOff && (
                      <View style={s.notifOffBadge} pointerEvents="none">
                        <Ionicons name="notifications-off-outline" size={13} color={pal.sub} />
                      </View>
                    )}
                    {stripe(c)}
                  </Animated.View>
                  <Animated.View
                    style={[s.face, s.faceAbsolute, { backgroundColor: pal.card }, { opacity: backOpacity, transform: [{ perspective: 900 }, { [rotateKey]: backRotate } as any] }]}
                  >
                    <CardScrollFace
                      onFlip={doFlip}
                      voiceButton={(
                        <WordCardVoiceButton
                          onPress={playMeaning}
                          phase={voiceState?.target === 'meaning' ? voiceState.phase : undefined}
                          themeColor={themeColor}
                          inactiveColor={pal.sub}
                        />
                      )}
                    >
                      <Text style={[s.meaningText, { color: pal.text }]}>{c.meaning}</Text>
                      {c.note ? <Text style={[s.noteText, { color: pal.sub }]}>{c.note}</Text> : null}
                    </CardScrollFace>
                    {c.notifOff && (
                      <View style={s.notifOffBadge} pointerEvents="none">
                        <Ionicons name="notifications-off-outline" size={13} color={pal.sub} />
                      </View>
                    )}
                  </Animated.View>
                </>
              ) : (
                // Adjacent card — front face only, no interaction needed.
                <View style={[s.cardInner, { backgroundColor: pal.card }]}>
                  {stripe(c)}
                  <Text style={[s.wordText, { color: pal.text }]}>{c.word}</Text>
                  {c.notifOff && (
                    <View style={s.notifOffBadge} pointerEvents="none">
                      <Ionicons name="notifications-off-outline" size={13} color={pal.sub} />
                    </View>
                  )}
                </View>
              )}
            </Animated.View>
          );
        })}
      </View>

      {/* Progress bar */}
      <View style={s.progressWrap}>
        <View style={[s.trackBg, { backgroundColor: pal.border }]} />
        <Animated.View
          style={[
            s.trackFill,
            {
              backgroundColor: themeColor,
              transform: [{ scaleX: progressScaleX }],
            },
          ]}
        />
        {/* Tap layer covering the whole track. Declared before the thumb so the thumb
            stays on top and keeps ownership of drags. */}
        <View style={s.trackTap} {...trackTapPan.panHandlers} />
        {scrubbing && (
          <View style={s.tickLayer} pointerEvents="none">
            {ticks}
          </View>
        )}
        {/* Invisible 44pt target; the visible 18pt circle rides inside it. */}
        <Animated.View
          style={[
            s.thumbHit,
            { transform: [{ translateX: displayedThumbX }] },
          ]}
          {...progressPan.panHandlers}
        >
          <View style={[s.thumb, { backgroundColor: themeColor }]} />
        </Animated.View>
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
    height: FLIP_CARD_H,
  },
  cardOuter: {
    position: 'absolute',
    top: 0,
    left: CARD_MARGIN,
    width: FLIP_CARD_W,
    height: FLIP_CARD_H,
    borderRadius: FLIP_CARD_RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 5,
  },
  // Adjacent (non-interactive) preview cards — centred without scroll.
  cardInner: {
    width: FLIP_CARD_W,
    height: FLIP_CARD_H,
    borderRadius: FLIP_CARD_RADIUS,
    paddingTop: 52,
    paddingHorizontal: 28,
    paddingBottom: 52,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Each animated face — carries borderRadius + overflow so CardScrollFace is clipped.
  face: {
    width: FLIP_CARD_W,
    height: FLIP_CARD_H,
    borderRadius: FLIP_CARD_RADIUS,
    overflow: 'hidden',
  },
  faceAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  wordText: {
    fontSize: FLIP_WORD_FONT_SIZE,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  meaningText: {
    fontSize: FLIP_MEANING_FONT_SIZE,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: FLIP_MEANING_LINE_H,
  },
  noteText: {
    fontSize: FLIP_NOTE_FONT_SIZE,
    textAlign: 'center',
    lineHeight: FLIP_NOTE_LINE_H,
    marginTop: FLIP_NOTE_MARGIN_TOP,
  },
  notifOffBadge: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    zIndex: 3,
    opacity: 0.45,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    // Reduced by the slack progressWrap gained below its track (see progressWrap).
    marginTop: 20 - HIT_OVERHANG,
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
  // Sized to host the 44pt touch target on all sides, since iOS will not hit-test a
  // child outside its parent. The extra box is cancelled by the negative margins and by
  // actionRow's reduced marginTop, so the track sits exactly where it did before.
  progressWrap: {
    width: FLIP_CARD_W + THUMB_HIT_SIZE,
    height: THUMB_HIT_SIZE,
    justifyContent: 'center',
    marginTop: 20 - HIT_OVERHANG,
    marginHorizontal: -HIT_PAD,
  },
  trackBg: {
    position: 'absolute',
    left: HIT_PAD,
    width: TRACK_W,
    height: 3,
    borderRadius: 2,
  },
  trackFill: {
    position: 'absolute',
    left: HIT_PAD,
    width: TRACK_W,
    height: 3,
    borderRadius: 2,
    transformOrigin: 'left center',
  },
  // Full-height tap target over the track. Spans the wrapper's padded width so a tap in
  // the slack past either end clamps to the first or last card.
  trackTap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  // No `top`: Yoga centres an absolute child with no vertical inset using the parent's
  // justifyContent, which is how the track line is centred too.
  tickLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TICK_H,
  },
  tick: {
    position: 'absolute',
    top: 0,
    width: TICK_W,
    height: TICK_H,
    borderRadius: TICK_W / 2,
    opacity: 0.55,
  },
  thumbHit: {
    position: 'absolute',
    left: HIT_PAD - THUMB_HIT_SIZE / 2,
    width: THUMB_HIT_SIZE,
    height: THUMB_HIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
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

function flipCardBrowserPropsEqual(previous: Props, next: Props) {
  // While hidden, defer all render work. The latest props are applied synchronously by
  // the layout effect on the render that activates Flip again.
  if (!previous.active && !next.active) return true;
  return previous.cards === next.cards
    && previous.currentWordId === next.currentWordId
    && previous.onCurrentWordChange === next.onCurrentWordChange
    && previous.active === next.active
    && previous.pal === next.pal
    && previous.themeColor === next.themeColor
    && previous.isSubscribed === next.isSubscribed
    && previous.onEdit === next.onEdit
    && previous.onDelete === next.onDelete
    && previous.onMove === next.onMove
    && previous.onToggleNotif === next.onToggleNotif
    && previous.showLevelLabel === next.showLevelLabel
    && previous.verticalFlip === next.verticalFlip
    && previous.isPremium === next.isPremium
    && previous.onCustomVoiceLocked === next.onCustomVoiceLocked;
}

export const FlipCardBrowser = memo(FlipCardBrowserComponent, flipCardBrowserPropsEqual);
