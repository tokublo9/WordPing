import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Palette, WordCard } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLang } from '../i18n';
import { speakWithAI, stopPlayback } from '../lib/tts';

const TEST_MUTED_KEY = 'wordping_test_muted';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W     = SCREEN_W - 32;
const CARD_MIN_H = 220;

type AnswerKind = 'perfect' | 'good' | 'slightly' | 'unknown';

interface Answer {
  kind: AnswerKind;
  labelKey: string;
  descKey: string;
  icon: string;
  color: string;
}

const ANSWERS: Answer[] = [
  { kind: 'perfect',  labelKey: 'test_know_perfectly', descKey: 'test_desc_perfect',  icon: '◎',               color: '#22c55e' },
  { kind: 'good',     labelKey: 'test_know_good',      descKey: 'test_desc_good',     icon: 'ellipse-outline',  color: '#3B82F6' },
  { kind: 'slightly', labelKey: 'test_know_slightly',  descKey: 'test_desc_slightly', icon: 'triangle-outline', color: '#f59e0b' },
  { kind: 'unknown',  labelKey: 'test_dont_know',      descKey: 'test_desc_unknown',  icon: 'close-outline',    color: '#ef4444' },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Props {
  cards: WordCard[];
  onUpdateCard: (id: string, patch: Partial<WordCard>) => void;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
}

export function TestModeScreen({ cards, onUpdateCard, onClose, pal, themeColor }: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();

  const [queue, setQueue] = useState<WordCard[]>(() => {
    const now = Date.now();
    return cards.filter(c => !c.testMastered && (!c.testNextReview || c.testNextReview <= now));
  });

  const [idx,         setIdx]         = useState(0);
  const [flipped,     setFlipped]     = useState(false);
  const [frontPlayed, setFrontPlayed] = useState(false);
  const [backPlayed,  setBackPlayed]  = useState(false);
  const [muted,       setMuted]       = useState(false);
  const [mutedLoaded, setMutedLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(TEST_MUTED_KEY).then(v => {
      if (v === 'true') setMuted(true);
      setMutedLoaded(true);
    });
  }, []);
  // Incrementing this forces the auto-play useEffect to re-fire even when
  // idx stays at 0 (e.g., after Shuffle / Reset from the first card).
  const [sessionKey,  setSessionKey]  = useState(0);
  const [playing,     setPlaying]     = useState(false);

  const flipAnim    = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  const total  = queue.length;
  const active = idx >= 0 && idx < total;
  const done   = idx >= total;
  const card   = active ? queue[idx] : null;

  // Voice icon visible only when unmuted and auto-play has fired for this side
  const showVoiceIcon =
    !muted && card !== null && ((!flipped && frontPlayed) || (flipped && backPlayed));

  // ── Auto-play word when a new card (or new session) becomes active ────────

  useEffect(() => {
    if (!mutedLoaded) return;
    const current = queue[idx];
    if (!current?.word || muted) return;
    setFrontPlayed(true);
    setPlaying(true);
    speakWithAI(current.word)
      .then(() => setPlaying(false))
      .catch(() => setPlaying(false));
  }, [idx, sessionKey, mutedLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { stopPlayback(); }, []);

  // ── Flip animation interpolations ────────────────────────────────────────

  const frontRotate  = flipAnim.interpolate({ inputRange: [0, 0.5],    outputRange: ['0deg', '-90deg'], extrapolate: 'clamp' });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0.35, 0.5], outputRange: [1, 0],             extrapolate: 'clamp' });
  const backRotate   = flipAnim.interpolate({ inputRange: [0.5, 1],    outputRange: ['90deg', '0deg'],  extrapolate: 'clamp' });
  const backOpacity  = flipAnim.interpolate({ inputRange: [0.5, 0.65], outputRange: [0, 1],             extrapolate: 'clamp' });

  // ── Actions ───────────────────────────────────────────────────────────────

  // Shared restart: reset all per-card state, set new queue, go back to card 0.
  // sessionKey bump ensures the auto-play effect fires even when idx is already 0.
  const restart = useCallback((newQueue: WordCard[]) => {
    stopPlayback();
    setPlaying(false);
    flipAnim.setValue(0);
    cardOpacity.setValue(1);
    setFlipped(false);
    setFrontPlayed(false);
    setBackPlayed(false);
    setQueue(newQueue);
    setIdx(0);
    setSessionKey(k => k + 1);
  }, [flipAnim, cardOpacity]);

  const handleShuffle = () => restart(shuffle([...queue]));

  const handleReset = () => {
    Alert.alert(t('test_reset'), t('test_reset_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('test_reset'),
        style: 'destructive',
        onPress: () => {
          cards.forEach(c => {
            onUpdateCard(c.id, { testMastered: false, testNextReview: 0, testLevel: undefined });
          });
          restart([...cards]);
        },
      },
    ]);
  };

  const handleMuteToggle = () => {
    if (!muted) {
      stopPlayback();
      setPlaying(false);
    }
    setMuted(m => {
      const next = !m;
      AsyncStorage.setItem(TEST_MUTED_KEY, next ? 'true' : 'false');
      return next;
    });
  };

  const handleReplay = useCallback(() => {
    if (!card || muted) return;
    if (playing) {
      stopPlayback();
      setPlaying(false);
      return;
    }
    const text = flipped ? card.meaning : card.word;
    setPlaying(true);
    speakWithAI(text)
      .then(() => setPlaying(false))
      .catch(() => setPlaying(false));
  }, [card, flipped, muted, playing]);

  const doToggleFlip = useCallback(() => {
    if (flipped) {
      if (!muted) { stopPlayback(); setPlaying(false); }
      Animated.timing(flipAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => setFlipped(false));
    } else {
      Animated.timing(flipAnim, { toValue: 1, duration: 300, useNativeDriver: true })
        .start(() => {
          setFlipped(true);
          if (!backPlayed) {
            setBackPlayed(true);
            if (!muted && card?.meaning) {
              setPlaying(true);
              speakWithAI(card.meaning)
                .then(() => setPlaying(false))
                .catch(() => setPlaying(false));
            }
          }
        });
    }
  }, [flipped, flipAnim, card, backPlayed, muted]);

  const advance = useCallback((kind: AnswerKind) => {
    if (!card) return;
    stopPlayback();
    setPlaying(false);

    const now = Date.now();
    if (kind === 'perfect')  onUpdateCard(card.id, { testMastered: true, testLevel: 'perfect' });
    if (kind === 'good')     onUpdateCard(card.id, { testNextReview: now + 3 * 86_400_000, testLevel: 'good' });
    if (kind === 'slightly') onUpdateCard(card.id, { testNextReview: now + 86_400_000, testLevel: 'slightly' });
    if (kind === 'unknown')  onUpdateCard(card.id, { testLevel: 'unknown' });

    Animated.timing(cardOpacity, { toValue: 0, duration: 130, useNativeDriver: true }).start(() => {
      flipAnim.setValue(0);
      setFlipped(false);
      setFrontPlayed(false);
      setBackPlayed(false);
      setIdx(i => i + 1);
      Animated.timing(cardOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    });
  }, [card, onUpdateCard, flipAnim, cardOpacity]);

  // ── Layout ────────────────────────────────────────────────────────────────

  const headerPad = insets.top + 10;
  const bottomPad = insets.bottom + 16;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[s.root, { backgroundColor: pal.bg }]}>

        {/* Header */}
        <View style={[s.header, { paddingTop: headerPad, borderBottomColor: pal.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={pal.text} />
          </TouchableOpacity>
          {active ? (
            <Text style={[s.progressText, { color: pal.sub }]}>{`${idx + 1} / ${total}`}</Text>
          ) : (
            <View />
          )}
          <View style={{ width: 24 }} />
        </View>

        {/* Progress bar */}
        {active && (
          <View style={[s.progressTrack, { backgroundColor: pal.border }]}>
            <View style={[s.progressFill, { backgroundColor: themeColor, width: `${(idx / total) * 100}%` }]} />
          </View>
        )}

        {/* Main content */}
        {done ? (
          /* ── Completion / empty state ──────────────────────────────────── */
          <View style={s.center}>
            <View style={[s.iconWrap, { backgroundColor: themeColor + '20' }]}>
              <Ionicons
                name={total === 0 ? 'checkmark-done-outline' : 'trophy-outline'}
                size={48}
                color={themeColor}
              />
            </View>
            <Text style={[s.centerTitle, { color: pal.text }]}>
              {t(total === 0 ? 'test_empty_title' : 'test_complete_title')}
            </Text>
            <Text style={[s.centerHint, { color: pal.sub }]}>
              {t(total === 0 ? 'test_empty_hint' : 'test_complete_hint')}
            </Text>
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: themeColor }]} onPress={onClose}>
              <Text style={s.primaryBtnText}>{t('close')}</Text>
            </TouchableOpacity>
            {total === 0 && (
              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: pal.border }]}
                onPress={handleReset}
              >
                <Ionicons name="refresh-outline" size={16} color={pal.sub} />
                <Text style={[s.secondaryBtnText, { color: pal.sub }]}>{t('test_reset')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          /* ── Card area ─────────────────────────────────────────────────── */
          <View style={s.cardArea}>

            {/* Toolbar: always visible above the card during the test */}
            <View style={s.toolbar}>
              <TouchableOpacity
                style={[s.toolBtn, { backgroundColor: pal.card, borderColor: pal.border }]}
                onPress={handleShuffle}
              >
                <Ionicons name="shuffle" size={15} color={pal.text} />
                <Text style={[s.toolBtnText, { color: pal.text }]}>{t('test_shuffle')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toolBtn, { backgroundColor: pal.card, borderColor: pal.border }]}
                onPress={handleReset}
              >
                <Ionicons name="refresh-outline" size={15} color={pal.text} />
                <Text style={[s.toolBtnText, { color: pal.text }]}>{t('test_reset')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.toolBtn,
                  {
                    backgroundColor: muted ? themeColor + '18' : pal.card,
                    borderColor:     muted ? themeColor : pal.border,
                  },
                ]}
                onPress={handleMuteToggle}
              >
                <Ionicons
                  name={muted ? 'volume-mute-outline' : 'volume-medium-outline'}
                  size={15}
                  color={muted ? themeColor : pal.text}
                />
              </TouchableOpacity>
            </View>

            {/* Word card */}
            <View style={s.cardCenter}>
              <Animated.View style={[s.cardFadeWrap, { opacity: cardOpacity }]}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={doToggleFlip}
                  style={s.cardTouch}
                >
                  <View style={s.cardSlot}>
                    {/* Front face */}
                    <Animated.View
                      style={[
                        s.cardFace,
                        { backgroundColor: pal.card },
                        { opacity: frontOpacity, transform: [{ perspective: 900 }, { rotateY: frontRotate }] },
                      ]}
                    >
                      <Text style={[s.wordText, { color: pal.text }]}>{card!.word}</Text>
                    </Animated.View>

                    {/* Back face */}
                    <Animated.View
                      style={[
                        s.cardFace,
                        StyleSheet.absoluteFillObject,
                        { backgroundColor: pal.card },
                        { opacity: backOpacity, transform: [{ perspective: 900 }, { rotateY: backRotate }] },
                      ]}
                    >
                      <Text style={[s.meaningText, { color: pal.text }]}>{card!.meaning}</Text>
                      {card!.note ? (
                        <Text style={[s.noteText, { color: pal.sub }]}>{card!.note}</Text>
                      ) : null}
                    </Animated.View>

                    {/* Voice replay icon */}
                    {showVoiceIcon && (
                      <TouchableOpacity
                        style={s.voiceBtn}
                        onPress={handleReplay}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name="volume-medium-outline"
                          size={20}
                          color={themeColor}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        )}

        {/* Answer buttons — revealed after first flip */}
        {!done && (
          <View
            style={[s.answerRow, { paddingBottom: bottomPad, opacity: backPlayed ? 1 : 0 }]}
            pointerEvents={backPlayed ? 'auto' : 'none'}
          >
            {ANSWERS.map(({ kind, labelKey, descKey, icon, color }) => (
              <TouchableOpacity
                key={kind}
                style={[s.answerBtn, { backgroundColor: color + '18', borderColor: color + '70' }]}
                onPress={() => advance(kind)}
                activeOpacity={0.75}
              >
                <View style={s.answerBtnLeft}>
                  {icon === '◎'
                    ? <Text style={{ fontSize: 19, color, lineHeight: 20 }}>◎</Text>
                    : <Ionicons name={icon as any} size={18} color={color} />
                  }
                  <Text style={[s.answerBtnLabel, { color }]}>{t(labelKey as any)}</Text>
                </View>
                <Text style={[s.answerBtnDesc, { color }]}>{t(descKey as any)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  progressText: {
    fontSize: 15,
    fontWeight: '500',
  },

  progressTrack: {
    height: 3,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },

  // Card area: column layout — toolbar at top, card centered in remaining space
  cardArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // Always-visible toolbar: Shuffle, Reset, Mute
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  toolBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Flex container that centers the card below the toolbar
  cardCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  cardFadeWrap: { alignItems: 'center' },
  cardTouch:    { alignItems: 'center' },

  cardSlot: {
    width: CARD_W,
    minHeight: CARD_MIN_H,
    position: 'relative',
  },
  cardFace: {
    width: CARD_W,
    minHeight: CARD_MIN_H,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 6,
  },

  wordText: {
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  meaningText: {
    fontSize: 19,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 27,
  },
  noteText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 24,
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

  // Answer buttons — stacked pill buttons
  answerRow: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  answerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  answerBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  answerBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  answerBtnDesc: {
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.75,
  },

  // Completion / empty screen
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  centerTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  centerHint: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  primaryBtn: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
