import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Palette, WordCard } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLang, type TranslationKey } from '../i18n';
import { speak, stopPlayback } from '../lib/tts';
import { AD_BANNER_HEIGHT, ADS_ENABLED } from './AdBannerPlaceholder';

const TEST_MUTED_KEY = 'wordping_test_muted';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
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

// ── Forgetting curve illustration ────────────────────────────────────────────

const CHART_H  = 130;
const Y_AXIS_W = 38;

// Exponential decay: segment from tStart→tEnd in T total time units, mapped to PLOT_W pixels.
function seg(
  tStart: number, tEnd: number, T: number, ret0: number, k: number, plotW: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let t = tStart; t <= tEnd; t += 1.5) {
    const ret = ret0 * Math.exp(-k * (t - tStart));
    pts.push({ x: (t / T) * plotW, y: CHART_H * (1 - ret) });
  }
  return pts;
}

function ForgettingCurve({ pal, themeColor }: { pal: Palette; themeColor: string }) {
  const t = useLang();
  const [plotW, setPlotW] = useState(240);

  // Time axis: T=140 units. Review points at t=22 (Day1), t=62 (Day3), t=105 (Day7).
  const T  = 140;
  const t1 = 22;   // Day 1
  const t2 = 62;   // Day 3
  const t3 = 105;  // Day 7

  // ── Reviewed curve (4 segments with jumps) ───────────────────────────────
  // Seg 0: fast initial forgetting
  const s0End = 0.98 * Math.exp(-0.044 * t1);               // ≈ 0.42
  // Seg 1: moderate forgetting after Day 1 review
  const r1    = 0.82;                                        // retention after Day 1 review
  const s1End = r1 * Math.exp(-0.013 * (t2 - t1));          // ≈ 0.49
  // Seg 2: slow forgetting after Day 3 review
  const r2    = 0.88;                                        // retention after Day 3 review
  const s2End = r2 * Math.exp(-0.009 * (t3 - t2));          // ≈ 0.59
  // Seg 3: very slow forgetting after Day 7 review
  const r3    = 0.93;                                        // retention after Day 7 review

  const pts0 = seg(0,  t1, T, 0.98, 0.044, plotW);
  const pts1 = seg(t1, t2, T, r1,   0.013, plotW);
  const pts2 = seg(t2, t3, T, r2,   0.009, plotW);
  const pts3 = seg(t3, T,  T, r3,   0.006, plotW);
  const allPts = [...pts0, ...pts1, ...pts2, ...pts3];

  // ── Without-review baseline (faint) ─────────────────────────────────────
  const noReviewPts = seg(0, T, T, 0.98, 0.022, plotW);

  // ── Pixel coordinates ────────────────────────────────────────────────────
  const x1 = (t1 / T) * plotW;
  const x2 = (t2 / T) * plotW;
  const x3 = (t3 / T) * plotW;

  // y = CHART_H * (1 - retention); lower y = higher retention
  const y1Before = CHART_H * (1 - s0End);
  const y1After  = CHART_H * (1 - r1);
  const y2Before = CHART_H * (1 - s1End);
  const y2After  = CHART_H * (1 - r2);
  const y3Before = CHART_H * (1 - s2End);
  const y3After  = CHART_H * (1 - r3);

  const midY = CHART_H * 0.5;  // 50% grid line

  const reviewColor = '#22c55e';
  const dotSize     = 2.5;
  const smallFont   = { fontSize: 8, color: pal.sub } as const;

  return (
    <View>
      {/* Y-axis title */}
      <Text style={{ fontSize: 9, color: pal.sub, marginBottom: 4, marginLeft: Y_AXIS_W }}>
        {t('chart_memory')}
      </Text>

      {/* Chart row: Y labels + plot */}
      <View style={{ flexDirection: 'row', alignItems: 'stretch', overflow: 'visible' }}>
        {/* Y-axis labels */}
        <View style={{ width: Y_AXIS_W, height: CHART_H }}>
          <Text style={[smallFont, { position: 'absolute', top: -5, right: 6 }]}>100%</Text>
          <Text style={[smallFont, { position: 'absolute', top: midY - 5, right: 6 }]}>50%</Text>
          <Text style={[smallFont, { position: 'absolute', bottom: -5, right: 6 }]}>0%</Text>
        </View>

        {/* Plot area */}
        <View
          style={{ flex: 1, height: CHART_H, overflow: 'visible' }}
          onLayout={e => setPlotW(e.nativeEvent.layout.width)}
        >
          {/* Bottom baseline */}
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: StyleSheet.hairlineWidth, backgroundColor: pal.border,
          }} />
          {/* Left axis line */}
          <View style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: StyleSheet.hairlineWidth, backgroundColor: pal.border,
          }} />
          {/* 50% horizontal grid line */}
          <View style={{
            position: 'absolute', left: 0, right: 0, top: midY,
            height: StyleSheet.hairlineWidth, backgroundColor: pal.border, opacity: 0.5,
          }} />

          {/* Without-review curve (faint baseline) */}
          {noReviewPts.map((p, i) => (
            <View key={`nr${i}`} style={{
              position: 'absolute',
              left: p.x - dotSize / 2, top: p.y - dotSize / 2,
              width: dotSize, height: dotSize, borderRadius: dotSize / 2,
              backgroundColor: pal.sub, opacity: 0.28,
            }} />
          ))}

          {/* Main review curve */}
          {allPts.map((p, i) => (
            <View key={`r${i}`} style={{
              position: 'absolute',
              left: p.x - dotSize / 2, top: p.y - dotSize / 2,
              width: dotSize, height: dotSize, borderRadius: dotSize / 2,
              backgroundColor: themeColor, opacity: 0.9,
            }} />
          ))}

          {/* Review bounce lines (green vertical) */}
          {[
            { x: x1, yFrom: y1Before, yTo: y1After },
            { x: x2, yFrom: y2Before, yTo: y2After },
            { x: x3, yFrom: y3Before, yTo: y3After },
          ].map(({ x, yFrom, yTo }, i) => (
            <View key={`rv${i}`} style={{
              position: 'absolute', left: x - 0.75, top: yTo,
              width: 1.5, height: yFrom - yTo,
              backgroundColor: reviewColor, opacity: 0.9,
            }} />
          ))}

          {/* Review labels: "↑ Review" above each bounce */}
          {[
            { x: x1, y: y1After },
            { x: x2, y: y2After },
            { x: x3, y: y3After },
          ].map(({ x, y }, i) => {
            // Keep label inside chart bounds
            const labelX = Math.min(x - 2, plotW - 36);
            return (
              <Text key={`rl${i}`} style={{
                position: 'absolute',
                left: labelX,
                top: Math.max(y - 14, 0),
                fontSize: 8, color: reviewColor, fontWeight: '700',
              }}>{'↑ '}{t('chart_review')}</Text>
            );
          })}

          {/* "After review" annotation on last segment */}
          <Text style={{
            position: 'absolute',
            left: x3 + 6,
            top: CHART_H * (1 - r3) - 26,
            fontSize: 8, color: themeColor, fontWeight: '600',
          }}>{t('chart_after_review')}</Text>

          {/* Day tick marks on baseline */}
          {[x1, x2, x3].map((x, i) => (
            <View key={`tick${i}`} style={{
              position: 'absolute', left: x - 0.5, bottom: 0,
              width: 1, height: 5, backgroundColor: pal.sub, opacity: 0.5,
            }} />
          ))}
        </View>
      </View>

      {/* X-axis labels */}
      <View style={{ flexDirection: 'row', marginTop: 3 }}>
        <View style={{ width: Y_AXIS_W }} />
        <View style={{ flex: 1, position: 'relative', height: 14 }}>
          <Text style={[smallFont, { position: 'absolute', left: 0 }]}>{t('chart_now')}</Text>
          <Text style={[smallFont, { position: 'absolute', left: x1 - 10 }]}>{t('chart_day_1')}</Text>
          <Text style={[smallFont, { position: 'absolute', left: x2 - 10 }]}>{t('chart_day_3')}</Text>
          <Text style={[smallFont, { position: 'absolute', left: x3 - 10 }]}>{t('chart_day_7')}</Text>
          <Text style={[smallFont, { position: 'absolute', right: 0 }]}>{t('chart_time')} →</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 8, marginLeft: Y_AXIS_W }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 18, height: 2.5, borderRadius: 1.5, backgroundColor: themeColor }} />
          <Text style={{ fontSize: 9, color: pal.sub }}>{t('chart_after_review')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 18, height: 2.5, borderRadius: 1.5, backgroundColor: pal.sub, opacity: 0.4 }} />
          <Text style={{ fontSize: 9, color: pal.sub }}>{t('chart_no_review')}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Info sheet ────────────────────────────────────────────────────────────────

const INFO_ITEMS: {
  icon: '◎' | null;
  iconName: 'ellipse-outline' | 'triangle-outline' | 'close-outline' | null;
  color: string;
  labelKey: TranslationKey;
  expKey: TranslationKey;
}[] = [
  { icon: '◎', iconName: null,               color: '#22c55e', labelKey: 'test_know_perfectly', expKey: 'test_info_perfect_exp' },
  { icon: null, iconName: 'ellipse-outline',  color: '#3B82F6', labelKey: 'test_know_good',      expKey: 'test_info_good_exp'    },
  { icon: null, iconName: 'triangle-outline', color: '#f59e0b', labelKey: 'test_know_slightly',  expKey: 'test_info_slightly_exp'},
  { icon: null, iconName: 'close-outline',    color: '#ef4444', labelKey: 'test_dont_know',      expKey: 'test_info_unknown_exp' },
];

function InfoSheet({
  visible, onClose, pal, themeColor,
}: {
  visible: boolean; onClose: () => void; pal: Palette; themeColor: string;
}) {
  const t      = useLang();
  const insets = useSafeAreaInsets();
  const sheetH = SCREEN_H - insets.top - 10;
  const slideY    = useRef(new Animated.Value(900)).current;
  const backdropO = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideY.setValue(900);
      backdropO.setValue(0);
      Animated.parallel([
        Animated.timing(backdropO, { toValue: 1, duration: 220, useNativeDriver: false }),
        Animated.timing(slideY,    { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  const close = () => {
    Animated.parallel([
      Animated.timing(backdropO, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(slideY,    { toValue: 900, duration: 230, useNativeDriver: false }),
    ]).start(() => onClose());
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)', opacity: backdropO }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <View style={is.sheetOuter} pointerEvents="box-none">
          <Animated.View
            style={[is.sheet, {
              backgroundColor: pal.dialog,
              height: sheetH,
              paddingBottom: insets.bottom,
              transform: [{ translateY: slideY }],
            }]}
          >
            <TouchableOpacity activeOpacity={1} style={{ flex: 1 }}>
              {/* Drag handle */}
              <View style={is.handleArea}>
                <View style={is.handle} />
              </View>

              {/* Header */}
              <View style={is.headerRow}>
                <Text style={[is.title, { color: pal.text }]}>{t('test_info_title')}</Text>
                <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color={pal.sub} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
                contentContainerStyle={is.scrollContent}
              >
                {/* Forgetting curve */}
                <View style={[is.chartBox, { backgroundColor: pal.chip, borderColor: pal.border }]}>
                  <ForgettingCurve pal={pal} themeColor={themeColor} />
                </View>

                {/* Caption */}
                <Text style={[is.caption, { color: pal.sub }]}>{t('test_info_caption')}</Text>

                {/* Divider */}
                <View style={[is.divider, { backgroundColor: pal.border }]} />
                <Text style={[is.sectionLabel, { color: pal.sub }]}>{t('test_info_section')}</Text>

                {/* Answer explanations */}
                {INFO_ITEMS.map(item => (
                  <View key={item.color} style={[is.infoRow, { borderBottomColor: pal.border }]}>
                    <View style={[is.iconBox, { backgroundColor: item.color + '18' }]}>
                      {item.icon ? (
                        <Text style={{ fontSize: 17, color: item.color, lineHeight: 20 }}>{item.icon}</Text>
                      ) : (
                        <Ionicons name={item.iconName!} size={18} color={item.color} />
                      )}
                    </View>
                    <Text style={[is.infoLabel, { color: item.color }]}>{t(item.labelKey)}</Text>
                    <Text style={[is.infoDesc, { color: pal.sub }]}>{t(item.expKey)}</Text>
                  </View>
                ))}
              </ScrollView>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const is = StyleSheet.create({
  sheetOuter: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  handleArea: { paddingTop: 12, paddingBottom: 6, alignItems: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#C0C0C0' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  chartBox: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 14, marginBottom: 14,
  },
  caption: { fontSize: 13, lineHeight: 20, marginBottom: 20 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 12 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  infoLabel: { fontSize: 14, fontWeight: '700', flex: 1 },
  infoDesc:  { fontSize: 13, color: '#9CA3AF' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  isSubscribed: boolean;
}

export function TestModeScreen({ cards, onUpdateCard, onClose, pal, themeColor, isSubscribed }: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();

  const [queue, setQueue] = useState<WordCard[]>(() => {
    const now = Date.now();
    return cards.filter(c => !c.testMastered && (!c.testNextReview || c.testNextReview <= now));
  });

  const [idx,         setIdx]         = useState(0);
  const [flipped,    setFlipped]    = useState(false);
  const [backPlayed, setBackPlayed] = useState(false);
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
  const [infoVisible, setInfoVisible] = useState(false);

  const flipAnim    = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  const total  = queue.length;
  const active = idx >= 0 && idx < total;
  const done   = idx >= total;
  const card   = active ? queue[idx] : null;

  // ── Auto-play word when a new card (or new session) becomes active ────────

  useEffect(() => {
    if (!mutedLoaded) return;
    const current = queue[idx];
    if (!current?.word || muted) return;
    setPlaying(true);
    speak(current.word, isSubscribed, current.wordLang)
      .then(() => setPlaying(false))
      .catch(() => setPlaying(false));
  }, [idx, sessionKey, mutedLoaded, isSubscribed]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const speakText = useCallback((text: string, lang?: string) => {
    if (muted) return;
    if (playing) { stopPlayback(); setPlaying(false); return; }
    setPlaying(true);
    speak(text, isSubscribed, lang)
      .then(() => setPlaying(false))
      .catch(() => setPlaying(false));
  }, [muted, playing, isSubscribed]);

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
              speak(card.meaning, isSubscribed, card.meaningLang)
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
      setBackPlayed(false);
      setIdx(i => i + 1);
      Animated.timing(cardOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    });
  }, [card, onUpdateCard, flipAnim, cardOpacity]);

  // ── Layout ────────────────────────────────────────────────────────────────

  const headerPad = insets.top + 10;
  const bottomPad = 16;

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
          <TouchableOpacity
            onPress={() => setInfoVisible(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="information-circle-outline" size={24} color={pal.sub} />
          </TouchableOpacity>
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
                onPress={handleReset}
              >
                <Ionicons name="refresh-outline" size={15} color={pal.text} />
                <Text style={[s.toolBtnText, { color: pal.text }]}>{t('test_reset')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toolBtn, { backgroundColor: pal.card, borderColor: pal.border }]}
                onPress={handleShuffle}
              >
                <Ionicons name="shuffle" size={15} color={pal.text} />
                <Text style={[s.toolBtnText, { color: pal.text }]}>{t('test_shuffle')}</Text>
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
                  name="volume-mute-outline"
                  size={15}
                  color={muted ? themeColor : pal.text}
                />
                <Text style={[s.toolBtnText, { color: muted ? themeColor : pal.text }]}>{t('test_mute')}</Text>
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
                      {!muted && (
                        <TouchableOpacity
                          style={s.voiceBtn}
                          onPress={() => speakText(card!.word, card!.wordLang)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="volume-medium-outline" size={20} color={themeColor} />
                        </TouchableOpacity>
                      )}
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
                      {!muted && (
                        <TouchableOpacity
                          style={s.voiceBtn}
                          onPress={() => speakText(card!.meaning, card!.meaningLang)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="volume-medium-outline" size={20} color={themeColor} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
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

        {/* Banner ad — hidden for Pro subscribers; also suppressed when ADS_ENABLED = false */}
        {ADS_ENABLED && !isSubscribed ? (
          <View
            style={{
              width: '100%',
              height: AD_BANNER_HEIGHT,
              marginBottom: insets.bottom,
              backgroundColor: pal.chip,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: pal.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 11, letterSpacing: 0.5, color: pal.sub }}>Advertisement</Text>
          </View>
        ) : (
          <View style={{ height: insets.bottom }} />
        )}

      </View>

      <InfoSheet
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        pal={pal}
        themeColor={themeColor}
      />
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
