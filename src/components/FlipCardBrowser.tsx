import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { speakWithAI, stopPlayback } from '../lib/tts';
import { useLang } from '../i18n';

const { width: SCREEN_W } = Dimensions.get('window');

const CARD_W          = SCREEN_W - 48;
const CARD_H          = 280;
const CARD_MARGIN     = (SCREEN_W - CARD_W) / 2;   // = 24
const SWIPE_THRESHOLD = SCREEN_W * 0.25;

interface Props {
  cards: WordCard[];
  pal: Palette;
  themeColor: string;
  onEdit: (card: WordCard) => void;
  onDelete: (id: string) => void;
  onToggleNotif: (id: string) => void;
  showLevelLabel?: boolean;
}

export function FlipCardBrowser({ cards, pal, themeColor, onEdit, onDelete, onToggleNotif, showLevelLabel = true }: Props) {
  const t = useLang();

  const [idx,     setIdx]     = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [playing, setPlaying] = useState(false);

  const pan         = useRef(new Animated.Value(0)).current;
  const flipAnim    = useRef(new Animated.Value(0)).current;
  const deckOpacity = useRef(new Animated.Value(1)).current;
  const swapPending = useRef(false);

  // Adjacent cards share the same pan so they slide as a connected deck.
  const prevX = useRef(Animated.add(pan, new Animated.Value(-SCREEN_W))).current;
  const nextX = useRef(Animated.add(pan, new Animated.Value(SCREEN_W))).current;

  const card    = cards[idx];
  const hasNext = idx < cards.length - 1;
  const hasPrev = idx > 0;

  const idxRef     = useRef(idx);
  const hasNextRef = useRef(hasNext);
  const hasPrevRef = useRef(hasPrev);
  idxRef.current     = idx;
  hasNextRef.current = hasNext;
  hasPrevRef.current = hasPrev;

  // ── Flip interpolations (native driver) ───────────────────────────────────
  // Front → Back: right edge folds away (0 → -90°), back swings in from right (90° → 0°).

  const frontRotate  = flipAnim.interpolate({ inputRange: [0, 0.5],    outputRange: ['0deg', '-90deg'], extrapolate: 'clamp' });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0.35, 0.5], outputRange: [1, 0],             extrapolate: 'clamp' });
  const backRotate   = flipAnim.interpolate({ inputRange: [0.5, 1],    outputRange: ['90deg', '0deg'],  extrapolate: 'clamp' });
  const backOpacity  = flipAnim.interpolate({ inputRange: [0.5, 0.65], outputRange: [0, 1],             extrapolate: 'clamp' });

  useEffect(() => () => { stopPlayback(); }, []);

  // Reveal the deck only after React has committed the new idx to the native layer.
  // useLayoutEffect fires synchronously post-commit, before the screen is painted —
  // the only reliable moment to know new card content is already in place.
  useLayoutEffect(() => {
    if (swapPending.current) {
      swapPending.current = false;
      deckOpacity.setValue(1);
    }
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────

  const goTo = useCallback((newIdx: number) => {
    stopPlayback();
    setPlaying(false);
    flipAnim.setValue(0);
    setFlipped(false);
    setIdx(newIdx);
  }, [flipAnim]);

  const doFlip = useCallback(() => {
    const toValue = flipped ? 0 : 1;
    Animated.timing(flipAnim, { toValue, duration: 350, useNativeDriver: true })
      .start(() => setFlipped(f => !f));
  }, [flipped, flipAnim]);

  // Toggle: if already playing → stop; otherwise start.
  const speak = useCallback((text: string) => {
    if (playing) {
      stopPlayback();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    speakWithAI(text)
      .then(() => setPlaying(false))
      .catch(() => setPlaying(false));
  }, [playing]);

  const handleDelete = useCallback(() => {
    if (!card) return;
    stopPlayback();
    setPlaying(false);
    // Move to adjacent card before deleting so the list update doesn't
    // leave idx pointing at an out-of-bounds position.
    if (hasPrev) {
      goTo(idxRef.current - 1);
    } else if (hasNext) {
      // Stay at same index; after deletion the next card slides into idx.
      flipAnim.setValue(0);
      setFlipped(false);
    }
    onDelete(card.id);
  }, [card, hasPrev, hasNext, goTo, flipAnim, onDelete]);

  // ── PanResponder ──────────────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,

      onPanResponderMove: (_, { dx }) => pan.setValue(dx),

      onPanResponderRelease: (_, { dx, vx }) => {
        const toNext = (dx < -SWIPE_THRESHOLD || vx < -0.5) && hasNextRef.current;
        const toPrev = (dx > SWIPE_THRESHOLD  || vx > 0.5)  && hasPrevRef.current;

        if (toNext) {
          Animated.timing(pan, { toValue: -SCREEN_W, duration: 220, useNativeDriver: false })
            .start(() => {
              deckOpacity.setValue(0);
              pan.setValue(0);
              swapPending.current = true;
              goTo(idxRef.current + 1);
            });
        } else if (toPrev) {
          Animated.timing(pan, { toValue: SCREEN_W, duration: 220, useNativeDriver: false })
            .start(() => {
              deckOpacity.setValue(0);
              pan.setValue(0);
              swapPending.current = true;
              goTo(idxRef.current - 1);
            });
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: false, restSpeedThreshold: 0.1, restDisplacementThreshold: 0.1 })
            .start(() => pan.setValue(0));
        }
      },

      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: 0, useNativeDriver: false, restSpeedThreshold: 0.1, restDisplacementThreshold: 0.1 })
          .start(() => pan.setValue(0));
      },
    })
  ).current;

  // ── Progress bar scrubber ─────────────────────────────────────────────────

  const TRACK_W  = CARD_W;
  const THUMB_R  = 9;

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

  // ── Level stripe ──────────────────────────────────────────────────────────

  const STRIPE_COLORS: Partial<Record<string, string>> = {
    perfect: '#22c55e', good: '#3B82F6', slightly: '#f59e0b', unknown: '#ef4444',
  };
  const stripe = (c: WordCard) => {
    const color = showLevelLabel && c.testLevel ? STRIPE_COLORS[c.testLevel] : null;
    return color ? <View style={[s.flipStripe, { backgroundColor: color }]} /> : null;
  };

  if (!card) return null;

  const voiceIcon = 'volume-medium-outline';

  return (
    <View style={s.root}>

      <Text style={[s.counter, { color: pal.sub }]}>{`${idx + 1} / ${cards.length}`}</Text>

      {/* Full-width deck strip */}
      <Animated.View style={[s.deckWrap, { opacity: deckOpacity }]}>

        {hasPrev && (
          <Animated.View key={cards[idx - 1].id} style={[s.cardOuter, { transform: [{ translateX: prevX }] }]}>
            <View style={[s.cardInner, { backgroundColor: pal.card }]}>
              {stripe(cards[idx - 1])}
              <Text style={[s.wordText, { color: pal.text }]} adjustsFontSizeToFit numberOfLines={5} minimumFontScale={0.35}>
                {cards[idx - 1].word}
              </Text>
            </View>
          </Animated.View>
        )}

        {hasNext && (
          <Animated.View key={cards[idx + 1].id} style={[s.cardOuter, { transform: [{ translateX: nextX }] }]}>
            <View style={[s.cardInner, { backgroundColor: pal.card }]}>
              {stripe(cards[idx + 1])}
              <Text style={[s.wordText, { color: pal.text }]} adjustsFontSizeToFit numberOfLines={5} minimumFontScale={0.35}>
                {cards[idx + 1].word}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Current card — rendered last (on top), supports flip + swipe */}
        <Animated.View
          style={[s.cardOuter, { transform: [{ translateX: pan }] }]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity activeOpacity={0.95} onPress={doFlip} style={s.flipArea}>

            {/* Front face */}
            <Animated.View
              style={[s.face, { opacity: frontOpacity, transform: [{ perspective: 900 }, { rotateY: frontRotate }] }]}
            >
              <View style={[s.cardInner, { backgroundColor: pal.card }]}>
                {stripe(card)}
                <Text style={[s.wordText, { color: pal.text }]} adjustsFontSizeToFit numberOfLines={5} minimumFontScale={0.35}>
                  {card.word}
                </Text>
              </View>
              <TouchableOpacity
                style={s.voiceBtn}
                onPress={() => speak(card.word)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name={voiceIcon as any} size={20} color={themeColor} />
              </TouchableOpacity>
            </Animated.View>

            {/* Back face */}
            <Animated.View
              style={[s.face, s.faceAbsolute, { opacity: backOpacity, transform: [{ perspective: 900 }, { rotateY: backRotate }] }]}
            >
              <View style={[s.cardInner, { backgroundColor: pal.card }]}>
                <Text style={[s.meaningText, { color: pal.text }]}>{card.meaning}</Text>
                {card.note ? (
                  <Text style={[s.noteText, { color: pal.sub }]}>{card.note}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={s.voiceBtn}
                onPress={() => speak(card.meaning)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name={voiceIcon as any} size={20} color={themeColor} />
              </TouchableOpacity>
            </Animated.View>

          </TouchableOpacity>
        </Animated.View>

      </Animated.View>

      {/* Progress bar */}
      <View style={s.progressWrap}>
        <View style={[s.trackBg, { backgroundColor: pal.border }]} />
        <Animated.View style={[s.trackFill, { backgroundColor: themeColor, width: thumbX }]} />
        <Animated.View
          style={[s.thumb, { backgroundColor: themeColor, transform: [{ translateX: thumbX }] }]}
          {...progressPan.panHandlers}
        />
      </View>

      {/* Action buttons below the dot indicator */}
      <View style={s.actionRow}>
        <TouchableOpacity
          style={[s.actionBtn, { borderColor: pal.border }]}
          onPress={() => onEdit(card)}
        >
          <Ionicons name="pencil-outline" size={19} color={pal.sub} />
          <Text style={[s.actionLabel, { color: pal.sub }]}>{t('edit')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actionBtn, { borderColor: pal.border }]}
          onPress={handleDelete}
        >
          <Ionicons name="trash-outline" size={19} color={pal.sub} />
          <Text style={[s.actionLabel, { color: pal.sub }]}>{t('delete')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actionBtn, { borderColor: card.notifOff ? pal.border : themeColor }]}
          onPress={() => onToggleNotif(card.id)}
        >
          <Ionicons
            name={card.notifOff ? 'notifications-off-outline' : 'notifications-outline'}
            size={19}
            color={card.notifOff ? pal.sub : themeColor}
          />
          <Text style={[s.actionLabel, { color: card.notifOff ? pal.sub : themeColor }]}>
            {t(card.notifOff ? 'notif_off_action' : 'notif_on')}
          </Text>
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

  // Row of action buttons below the card deck
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
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
