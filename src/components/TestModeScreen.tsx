import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Palette, ReviewEntry, WordCard } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BCP47_TO_UI_LANG, translate, useLang, type TranslationKey } from '../i18n';
import { speak, speakWordCard, stopPlayback } from '../lib/tts';
import { AD_BANNER_HEIGHT, ADS_ENABLED } from './AdBannerPlaceholder';
import {
  FLIP_CARD_H, FLIP_CARD_RADIUS, FLIP_CARD_W,
  FLIP_MEANING_FONT_SIZE, FLIP_MEANING_LINE_H,
  FLIP_NOTE_FONT_SIZE, FLIP_NOTE_LINE_H, FLIP_NOTE_MARGIN_TOP,
  FLIP_WORD_FONT_SIZE,
} from '../constants';
import { CardScrollFace } from './CardScrollFace';

const TEST_MUTED_KEY = 'wordping_test_muted';

const { height: SCREEN_H } = Dimensions.get('window');

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

function ForgettingCurve({ t }: { t: (key: TranslationKey) => string }) {
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

  const curveColor  = '#3478E5';
  const reviewColor = '#35B978';
  const axisColor   = '#7183A4';
  const gridColor   = '#D7E2F3';
  const dotSize     = 2.8;
  const smallFont   = { fontSize: 8, color: axisColor } as const;

  return (
    <LinearGradient
      colors={['#F1F6FF', '#DDE9FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={curve.card}
    >
      <View style={curve.plotCard}>
        <View style={curve.chartRow}>
          <View style={curve.yAxis}>
            <Text style={[smallFont, curve.yTop]}>100%</Text>
            <Text style={[smallFont, curve.yMid]}>50%</Text>
            <Text style={[smallFont, curve.yBottom]}>0%</Text>
          </View>

          <View
            style={curve.plot}
            onLayout={e => setPlotW(e.nativeEvent.layout.width)}
          >
            <View style={[curve.axisBottom, { backgroundColor: gridColor }]} />
            <View style={[curve.axisLeft, { backgroundColor: gridColor }]} />
            <View style={[curve.gridLine, { top: midY, backgroundColor: gridColor }]} />

            {noReviewPts.map((p, i) => (
              <View key={`nr${i}`} style={{
                position: 'absolute',
                left: p.x - dotSize / 2, top: p.y - dotSize / 2,
                width: dotSize, height: dotSize, borderRadius: dotSize / 2,
                backgroundColor: '#98A8BF', opacity: 0.35,
              }} />
            ))}

            {allPts.map((p, i) => (
              <View key={`r${i}`} style={{
                position: 'absolute',
                left: p.x - dotSize / 2, top: p.y - dotSize / 2,
                width: dotSize, height: dotSize, borderRadius: dotSize / 2,
                backgroundColor: curveColor, opacity: 0.96,
              }} />
            ))}

            {[
              { x: x1, yFrom: y1Before, yTo: y1After },
              { x: x2, yFrom: y2Before, yTo: y2After },
              { x: x3, yFrom: y3Before, yTo: y3After },
            ].map(({ x, yFrom, yTo }, i) => (
              <View key={`review${i}`} style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={{
                  position: 'absolute', left: x - 1, top: yTo,
                  width: 2, height: yFrom - yTo,
                  backgroundColor: reviewColor, borderRadius: 1,
                }} />
                <View style={[curve.reviewPoint, { left: x - 9, top: Math.max(yTo - 9, 0) }]}>
                  <Ionicons name="arrow-up" size={10} color="#fff" />
                </View>
              </View>
            ))}

            {[x1, x2, x3].map((x, i) => (
              <View key={`tick${i}`} style={[curve.tick, { left: x - 0.5 }]} />
            ))}
          </View>
        </View>

        <View style={curve.xAxisRow}>
          <View style={{ width: Y_AXIS_W }} />
          <View style={curve.xAxisLabels}>
            <Text style={[smallFont, curve.xNow]}>{t('chart_now')}</Text>
            <Text style={[smallFont, { position: 'absolute', left: x1 - 10 }]}>{t('chart_day_1')}</Text>
            <Text style={[smallFont, { position: 'absolute', left: x2 - 10 }]}>{t('chart_day_3')}</Text>
            <Text style={[smallFont, { position: 'absolute', left: x3 - 10 }]}>{t('chart_day_7')}</Text>
            <Text style={[smallFont, curve.xTime]}>{t('chart_time')} →</Text>
          </View>
        </View>
      </View>

      <Text style={curve.explanation}>{t('test_info_caption')}</Text>

      <View style={curve.legend}>
        <View style={curve.legendPill}>
          <View style={[curve.legendLine, { backgroundColor: curveColor }]} />
          <Text style={curve.legendText}>{t('chart_after_review')}</Text>
        </View>
        <View style={curve.legendPill}>
          <View style={[curve.legendLine, { backgroundColor: '#A5B1C3' }]} />
          <Text style={curve.legendText}>{t('chart_no_review')}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const curve = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#C8D8F2',
    overflow: 'hidden',
    padding: 16,
    marginBottom: 14,
  },
  plotCard: {
    alignSelf: 'center',
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(180,200,232,0.75)',
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: 10,
    paddingTop: 13,
    paddingBottom: 9,
  },
  chartRow: { flexDirection: 'row', overflow: 'visible' },
  yAxis: { width: Y_AXIS_W, height: CHART_H },
  yTop: { position: 'absolute', right: 6, top: -4 },
  yMid: { position: 'absolute', right: 6, top: CHART_H * 0.5 - 5 },
  yBottom: { position: 'absolute', right: 6, bottom: -3 },
  plot: { flex: 1, height: CHART_H, overflow: 'visible' },
  axisBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 },
  axisLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 1 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.82 },
  reviewPoint: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#35B978',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { position: 'absolute', bottom: 0, width: 1, height: 5, backgroundColor: '#8FA1BB', opacity: 0.7 },
  xAxisRow: { flexDirection: 'row', marginTop: 5 },
  xAxisLabels: { flex: 1, position: 'relative', height: 14 },
  xNow: { position: 'absolute', left: 0 },
  xTime: { position: 'absolute', right: 0 },
  explanation: {
    color: '#5E7395',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 11 },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(180,200,232,0.8)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  legendLine: { width: 18, height: 3, borderRadius: 2 },
  legendText: { color: '#5E7395', fontSize: 9, fontWeight: '600' },
});

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
  visible, onClose, pal, explanationLang,
}: {
  visible: boolean; onClose: () => void; pal: Palette; explanationLang: string;
}) {
  const t      = useLang();
  const explanationUiLang = BCP47_TO_UI_LANG[explanationLang] ?? 'en-US';
  const explanationT = useCallback(
    (key: TranslationKey) => translate(explanationUiLang, key),
    [explanationUiLang],
  );
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
              backgroundColor: pal.bg,
              borderColor: pal.border,
              height: sheetH,
              paddingBottom: insets.bottom,
              transform: [{ translateY: slideY }],
            }]}
          >
            <TouchableOpacity activeOpacity={1} style={{ flex: 1 }}>
              {/* Header */}
              <View style={[is.headerRow, { backgroundColor: pal.dialog, borderBottomColor: pal.border }]}>
                <View style={is.headerTitleRow}>
                  <Text style={[is.title, { color: pal.text }]}>{explanationT('test_info_title')}</Text>
                </View>
                <TouchableOpacity
                  style={[is.closeButton, { backgroundColor: pal.input }]}
                  onPress={close}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
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
                <ForgettingCurve t={explanationT} />

                {/* Answer explanations */}
                {INFO_ITEMS.map(item => (
                  <View key={item.color} style={[is.infoCard, { backgroundColor: pal.card, borderColor: pal.border }]}>
                    <View style={[is.iconBox, { backgroundColor: item.color + '18' }]}>
                      {item.icon ? (
                        <Text style={{ fontSize: 18, color: item.color, lineHeight: 21 }}>{item.icon}</Text>
                      ) : (
                        <Ionicons name={item.iconName!} size={20} color={item.color} />
                      )}
                    </View>
                    <View style={is.infoCopy}>
                      <Text style={[is.infoLabel, { color: item.color }]}>{t(item.labelKey)}</Text>
                      <Text style={[is.infoDesc, { color: pal.sub }]}>{t(item.expKey)}</Text>
                    </View>
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
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#0F2F60',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 18,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 21, lineHeight: 26, fontWeight: '800' },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 26 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    padding: 13,
    marginBottom: 10,
  },
  iconBox: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginRight: 12,
  },
  infoCopy: { flex: 1 },
  infoLabel: { fontSize: 14, lineHeight: 18, fontWeight: '700', marginBottom: 3 },
  infoDesc: { fontSize: 12, lineHeight: 17 },
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
  isPremium?: boolean;
  explanationLang: string;
  verticalFlip: boolean;
}

export function TestModeScreen({ cards, onUpdateCard, onClose, pal, themeColor, isSubscribed, isPremium = false, explanationLang, verticalFlip }: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();

  // ── Locked custom-voice banner ────────────────────────────────────────────
  // Rendered inside this full-screen modal so it appears above the Test sheet.
  // Tap or swipe up to dismiss.
  const [voiceBannerShowing, setVoiceBannerShowing] = useState(false);
  const voiceBannerAnim  = useRef(new Animated.Value(0)).current;
  const voiceBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissVoiceBanner = useCallback(() => {
    if (voiceBannerTimer.current) { clearTimeout(voiceBannerTimer.current); voiceBannerTimer.current = null; }
    Animated.timing(voiceBannerAnim, { toValue: 0, duration: 220, useNativeDriver: false })
      .start(({ finished }) => { if (finished) setVoiceBannerShowing(false); });
  }, [voiceBannerAnim]);

  const showVoiceLockedBanner = useCallback(() => {
    if (voiceBannerTimer.current) clearTimeout(voiceBannerTimer.current);
    setVoiceBannerShowing(true);
    Animated.spring(voiceBannerAnim, { toValue: 1, tension: 90, friction: 9, useNativeDriver: false }).start();
    voiceBannerTimer.current = setTimeout(dismissVoiceBanner, 4000);
  }, [voiceBannerAnim, dismissVoiceBanner]);

  const voiceBannerPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy < -6,
    onPanResponderMove: (_, g) => {
      if (g.dy < 0) voiceBannerAnim.setValue(Math.max(0, 1 - (-g.dy) / 80));
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy < -28) {
        dismissVoiceBanner();
      } else {
        Animated.spring(voiceBannerAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: false }).start();
        if (voiceBannerTimer.current) clearTimeout(voiceBannerTimer.current);
        voiceBannerTimer.current = setTimeout(dismissVoiceBanner, 4000);
      }
    },
  })).current;

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
  const [sheetReady,  setSheetReady]  = useState(false);

  const flipAnim    = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  const total  = queue.length;
  const active = idx >= 0 && idx < total;
  const done   = idx >= total;
  const card   = active ? queue[idx] : null;

  // ── Auto-play word when a new card (or new session) becomes active ────────

  useEffect(() => {
    if (!sheetReady || !mutedLoaded) return;
    const current = queue[idx];
    if (!current?.word || muted) return;
    if (current.audioUri && !isPremium) { showVoiceLockedBanner(); return; }
    setPlaying(true);
    speakWordCard(current, isSubscribed)
      .then(() => setPlaying(false))
      .catch(() => setPlaying(false));
  }, [idx, sessionKey, sheetReady, mutedLoaded, isSubscribed, isPremium, showVoiceLockedBanner]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    stopPlayback();
    if (voiceBannerTimer.current) clearTimeout(voiceBannerTimer.current);
  }, []);

  // ── Flip animation interpolations ────────────────────────────────────────

  const frontRotate  = flipAnim.interpolate({ inputRange: [0, 0.5],    outputRange: ['0deg', '-90deg'], extrapolate: 'clamp' });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0.35, 0.5], outputRange: [1, 0],             extrapolate: 'clamp' });
  const backRotate   = flipAnim.interpolate({ inputRange: [0.5, 1],    outputRange: ['90deg', '0deg'],  extrapolate: 'clamp' });
  const backOpacity  = flipAnim.interpolate({ inputRange: [0.5, 0.65], outputRange: [0, 1],             extrapolate: 'clamp' });
  const rotateKey = verticalFlip ? 'rotateX' : 'rotateY';

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

  const speakWord = useCallback((card: WordCard) => {
    if (muted) return;
    if (card.audioUri && !isPremium) { showVoiceLockedBanner(); return; }
    if (playing) { stopPlayback(); setPlaying(false); return; }
    setPlaying(true);
    speakWordCard(card, isSubscribed)
      .then(() => setPlaying(false))
      .catch(() => setPlaying(false));
  }, [muted, playing, isSubscribed, isPremium, showVoiceLockedBanner]);

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
    const entry: ReviewEntry = { ts: now, rating: kind };
    const reviewHistory: ReviewEntry[] = [...(card.reviewHistory ?? []), entry];

    if (kind === 'perfect')  onUpdateCard(card.id, { testMastered: true, testLevel: 'perfect', reviewHistory });
    if (kind === 'good')     onUpdateCard(card.id, { testNextReview: now + 3 * 86_400_000, testLevel: 'good', reviewHistory });
    if (kind === 'slightly') onUpdateCard(card.id, { testNextReview: now + 86_400_000, testLevel: 'slightly', reviewHistory });
    if (kind === 'unknown')  onUpdateCard(card.id, { testLevel: 'unknown', reviewHistory });

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
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onShow={() => setSheetReady(true)}
      onRequestClose={onClose}
    >
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
                <View style={s.cardSlot}>
                  {/* Front face */}
                  <Animated.View
                    style={[
                      s.cardFace,
                      { backgroundColor: pal.card },
                      { opacity: frontOpacity, transform: [{ perspective: 900 }, { [rotateKey]: frontRotate } as any] },
                    ]}
                  >
                    <CardScrollFace
                      onFlip={doToggleFlip}
                      onVoice={() => speakWord(card!)}
                      voiceColor={themeColor}
                      showVoice={!muted}
                    >
                      <Text style={[s.wordText, { color: pal.text }]}>{card!.word}</Text>
                    </CardScrollFace>
                  </Animated.View>

                  {/* Back face */}
                  <Animated.View
                    style={[
                      s.cardFace,
                      StyleSheet.absoluteFillObject,
                      { backgroundColor: pal.card },
                      { opacity: backOpacity, transform: [{ perspective: 900 }, { [rotateKey]: backRotate } as any] },
                    ]}
                  >
                    <CardScrollFace
                      onFlip={doToggleFlip}
                      onVoice={() => speakText(card!.meaning, card!.meaningLang)}
                      voiceColor={themeColor}
                      showVoice={!muted}
                    >
                      <Text style={[s.meaningText, { color: pal.text }]}>{card!.meaning}</Text>
                      {card!.note ? (
                        <Text style={[s.noteText, { color: pal.sub }]}>{card!.note}</Text>
                      ) : null}
                    </CardScrollFace>
                  </Animated.View>
                </View>
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
        explanationLang={explanationLang}
      />

      {/* Locked custom-voice error — above the Test sheet; tap or swipe up to dismiss */}
      {voiceBannerShowing && (
        <Animated.View
          style={[
            s.voiceBanner,
            {
              top: insets.top + 8,
              backgroundColor: pal.dialog,
              borderColor: pal.border,
              opacity: voiceBannerAnim,
              transform: [{ translateY: voiceBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-56, 0] }) }],
            },
          ]}
          {...voiceBannerPan.panHandlers}
        >
          <TouchableOpacity activeOpacity={0.85} onPress={dismissVoiceBanner} style={s.voiceBannerTouch}>
            <Ionicons name="warning" size={18} color="#f59e0b" style={{ marginRight: 8 }} />
            <Text style={[s.voiceBannerText, { color: pal.text }]}>{t('custom_voice_locked_msg')}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Locked custom-voice banner (top overlay)
  voiceBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 8,
  },
  voiceBannerTouch: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  voiceBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },

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

  cardSlot: {
    width: FLIP_CARD_W,
    height: FLIP_CARD_H,
    position: 'relative',
  },
  cardFace: {
    width: FLIP_CARD_W,
    height: FLIP_CARD_H,
    borderRadius: FLIP_CARD_RADIUS,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 6,
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
