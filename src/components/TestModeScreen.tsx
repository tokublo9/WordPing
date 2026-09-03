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
import { CLEAR_HIDE } from '../features/cards/visibility';
import { isCardDueForTest } from '../features/cards/testSchedule';
import { StudyAnalytics } from './StudyAnalytics';
import { recordAnswer, type StudyLog } from '../features/study/studyLog';
import { appNow } from '../lib/appClock';
import { SYNC_WITH_TEST_RESULTS_ENABLED } from '../features/flags';
import { gradeCard, type AnswerKind } from '../features/cards/grading';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BCP47_TO_UI_LANG, translate, useLang, type TranslationKey } from '../i18n';
import { WordCardVoiceButton } from './WordCardVoiceButton';
import { useWordCardVoicePlayback } from '../hooks/useWordCardVoicePlayback';
import {
  FLIP_CARD_H, FLIP_CARD_RADIUS, FLIP_CARD_W,
  FLIP_MEANING_FONT_SIZE, FLIP_MEANING_LINE_H,
  FLIP_NOTE_FONT_SIZE, FLIP_NOTE_LINE_H, FLIP_NOTE_MARGIN_TOP,
  FLIP_WORD_FONT_SIZE,
} from '../constants';
import { CardScrollFace } from './CardScrollFace';
import { HiddenWordIcon } from './HiddenWordIcon';
import { isWordTextHidden } from '../features/cards/hideWordAccess';
import { useReduceMotion } from '../hooks/useReduceMotion';

const TEST_MUTED_KEY = 'wordping_test_muted';

// ── Card exit ────────────────────────────────────────────────────────────────
// Every other answer keeps the card in the test — it comes back later — so the
// card is swapped with a quick fade and nothing is implied about where it went.
const ADVANCE_FADE_OUT_MS = 130;
const CARD_FADE_IN_MS = 160;
// "Perfect" is the one answer that takes the card out of the test, so it gets a
// visibly different exit: the card shrinks and lifts away instead of dissolving
// in place. Slower than the ordinary fade because it is saying something.
const PERFECT_EXIT_MS = 320;
const PERFECT_EXIT_SCALE = 0.62;
const PERFECT_EXIT_LIFT = -40;

const { height: SCREEN_H } = Dimensions.get('window');

interface Answer {
  kind: AnswerKind;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: string;
  color: string;
}

const ANSWERS: Answer[] = [
  { kind: 'perfect',  labelKey: 'test_know_perfectly', descKey: 'test_desc_perfect',  icon: '◎',               color: '#22c55e' },
  { kind: 'good',     labelKey: 'test_know_good',      descKey: 'test_desc_good',     icon: 'ellipse-outline',  color: '#3B82F6' },
  { kind: 'slightly', labelKey: 'test_know_slightly',  descKey: 'test_desc_slightly', icon: 'triangle-outline', color: '#f59e0b' },
  { kind: 'unknown',  labelKey: 'test_dont_know',      descKey: 'test_desc_unknown',  icon: 'close-outline',    color: '#ef4444' },
];

// ── Information popup ────────────────────────────────────────────────────────

const INFO_DESCRIPTION_KEYS: Record<AnswerKind, TranslationKey> = {
  perfect: 'test_info_perfect_exp',
  good: 'test_info_good_exp',
  slightly: 'test_info_slightly_exp',
  unknown: 'test_info_unknown_exp',
};

// Derive the presentation from the actual Test Mode answers so the popup can
// never drift to replacement icons or duplicate result-color constants.
const INFO_ITEMS = ANSWERS.map(answer => ({
  ...answer,
  expKey: INFO_DESCRIPTION_KEYS[answer.kind],
}));

function InfoPopup({
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={is.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />

        <View
          style={[
            is.dialog,
            {
              backgroundColor: pal.dialog,
              borderColor: pal.border,
              marginTop: insets.top + 16,
              marginBottom: insets.bottom + 16,
              maxHeight: SCREEN_H - insets.top - insets.bottom - 32,
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={is.headerRow}>
            <Text
              style={[is.title, { color: pal.text }]}
              accessibilityRole="header"
            >
              {explanationT('test_info_title')}
            </Text>
            <TouchableOpacity
              style={[is.closeButton, { backgroundColor: pal.input }]}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            >
              <Ionicons name="close" size={22} color={pal.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            style={is.bodyScroll}
            contentContainerStyle={is.scrollContent}
          >
            {INFO_ITEMS.map(item => (
              <View
                key={item.kind}
                style={[is.infoCard, { backgroundColor: pal.card, borderColor: pal.border }]}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${t(item.labelKey)}. ${t(item.expKey)}`}
              >
                <View style={[is.iconBox, { backgroundColor: item.color + '18' }]}>
                  {item.icon === '◎'
                    ? <Text style={{ fontSize: 19, color: item.color, lineHeight: 20 }}>◎</Text>
                    : <Ionicons name={item.icon as any} size={18} color={item.color} />
                  }
                </View>
                <View style={is.infoCopy}>
                  <Text style={[is.infoLabel, { color: item.color }]}>{t(item.labelKey)}</Text>
                  <Text style={[is.infoDesc, { color: pal.sub }]}>{t(item.expKey)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const is = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#0F2F60',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 18,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: 18, paddingRight: 12, paddingTop: 14, paddingBottom: 10,
  },
  title: { flex: 1, fontSize: 18, lineHeight: 23, fontWeight: '800', marginRight: 10 },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyScroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 14 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    padding: 11,
    marginBottom: 8,
  },
  iconBox: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginRight: 10,
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
  /** Cards eligible for the ordinary Test Mode queue. */
  cards: WordCard[];
  /** Every existing card in the folder, including temporarily hidden cards. */
  resetCards: WordCard[];
  onUpdateCard: (id: string, patch: Partial<WordCard>) => void;
  /** Canonical app deletion path used only for a synced Perfect result. */
  onDeleteCard: (id: string) => void;
  /**
   * Called once, on the very first card graded in this session.
   *
   * Reported at the moment of the answer rather than when the test ends, so
   * force-quitting immediately afterwards still leaves the result-filter state
   * consistent with the grade that was already written to the card.
   */
  onFirstAnswer?: () => void;
  /**
   * One graded card, at the moment it was graded.
   *
   * Called only after a result is chosen — never for opening the mode, turning
   * a card over, or walking out part-way through — and once per card per pass,
   * so the same word answered again in a later pass counts again.
   */
  onAnswerRecorded?: (answeredAt: number) => void;
  /** The durable study record shown by the analytics view. */
  studyLog?: StudyLog;
  /** Whether the parent-owned Test Mode analytics view is covering the card. */
  analyticsOpen: boolean;
  /** Dismisses analytics without changing any part of the current test session. */
  onCloseAnalytics: () => void;
  /** Opens analytics as a view over the current session, without changing it. */
  onOpenAnalytics: () => void;
  pal: Palette;
  themeColor: string;
  /** The plan includes High-Quality AI Voice — Premium only. */
  canUseAIVoice: boolean;
  /** The plan includes Custom Voice for Words — Basic and Premium. */
  canUseCustomVoice?: boolean;
  /** The plan includes Hide Word — Basic only. */
  canHideWord?: boolean;
  /**
   * The app-level "Custom Voice is locked" banner. Test Mode is part of the
   * word-list screen now, so it shares that one banner instead of drawing a
   * second copy of its own.
   */
  onCustomVoiceLocked?: () => void;
  explanationLang: string;
  verticalFlip: boolean;
}

export function TestModeScreen({ cards, resetCards, onUpdateCard, onDeleteCard, onFirstAnswer, onAnswerRecorded, studyLog = {}, analyticsOpen, onCloseAnalytics, onOpenAnalytics, pal, themeColor, canUseAIVoice, canUseCustomVoice = false, canHideWord = false, onCustomVoiceLocked, explanationLang, verticalFlip }: Props) {
  const t      = useLang();

  // The same rule the grey chip counts with, so the number on that chip is the
  // number of cards this queue is built from rather than a second opinion.
  const [queue, setQueue] = useState<WordCard[]>(() => {
    const now = appNow();
    return cards.filter(c => isCardDueForTest(c, now));
  });

  const [idx,         setIdx]         = useState(0);
  // Cards already graded this session. `queue` is a snapshot taken at mount, so
  // Updating or deleting a card never shifts this queue snapshot — advancing stays a simple +1 — but
  // a repeated tap must still be ignored.
  const gradedIdsRef = useRef<Set<string>>(new Set());
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
  const [infoVisible, setInfoVisible] = useState(false);
  // The parent owns durable persistence. This local mirror is advanced in the
  // same answer event so the completion screen cannot render one answer behind
  // while React is still delivering the updated prop back down.
  const [sessionStudyLog, setSessionStudyLog] = useState<StudyLog>(studyLog);

  const flipAnim    = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  // Only the Perfect exit moves these; every other path leaves them at rest.
  const cardScale   = useRef(new Animated.Value(1)).current;
  const cardLift    = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const total  = queue.length;
  const active = idx >= 0 && idx < total;
  const done   = idx >= total;
  const card   = active ? queue[idx] : null;
  /**
   * The session ran and every card in it was answered.
   *
   * The completed queue and an initially empty queue share the same analytics
   * screen. `analyticsOpen` reaches that screen without changing `done`, so a
   * test paused to inspect analytics remains resumable.
   */
  const showAnalytics = done || analyticsOpen;

  // ── Voice playback ────────────────────────────────────────────────────────
  // The same hook the Flip screen uses, so the icon here shares its audio source,
  // loading and playing states, toggle-to-stop behaviour, custom-voice lock and
  // error alerts rather than reimplementing any of them.
  const { voiceState, playWord, playMeaning, stopVoice, wordVoiceSource } = useWordCardVoicePlayback({
    item: card,
    canUseAIVoice,
    canUseCustomVoice,
    onCustomVoiceLocked,
  });

  // ── Auto-play word when a new card (or new session) becomes active ────────
  // There is no presentation animation to wait for any more — the card area is
  // simply this content — so the stored mute preference is the only gate.

  useEffect(() => {
    if (!mutedLoaded) return;
    const current = queue[idx];
    if (!current?.word || muted) return;
    // Same action as tapping the icon, so the icon shows the loading and playing
    // states for automatic playback too. The lock case is handled inside it.
    void playWord();
  }, [idx, sessionKey, mutedLoaded, canUseAIVoice, canUseCustomVoice]); // eslint-disable-line react-hooks/exhaustive-deps

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
    stopVoice();
    flipAnim.setValue(0);
    cardOpacity.setValue(1);
    cardScale.setValue(1);
    cardLift.setValue(0);
    setFlipped(false);
    setBackPlayed(false);
    setQueue(newQueue);
    setIdx(0);
    setSessionKey(k => k + 1);
    onCloseAnalytics();
    // A restart is a fresh pass over the queue, so every card is answerable
    // again. Without this, Shuffle and Reset left the already-answered IDs in
    // place and the next tap on any of those cards was silently swallowed by
    // the double-tap guard: the card animated away but was never graded, so no
    // hiddenUntil was written and it stayed in the word list.
    gradedIdsRef.current = new Set();
  }, [flipAnim, cardOpacity, cardScale, cardLift, onCloseAnalytics]);

  const handleShuffle = () => restart(shuffle([...queue]));

  const handleReset = () => {
    Alert.alert(t('test_reset'), t('test_reset_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('test_reset'),
        style: 'destructive',
        onPress: () => {
          const resetPatch: Partial<WordCard> = {
            testMastered: false,
            testNextReview: 0,
            testLevel: undefined,
            ...CLEAR_HIDE,
          };
          const resetQueue = resetCards.map(c => ({ ...c, ...resetPatch }));
          resetCards.forEach(c => {
            // The hide is a consequence of a grade, so clearing the grade has to
            // clear it too — otherwise a reset card stays invisible in the word
            // list with nothing on screen explaining why.
            onUpdateCard(c.id, resetPatch);
          });
          restart(resetQueue);
        },
      },
    ]);
  };

  const handleMuteToggle = () => {
    // Muting stops whatever is playing, through the hook so its state clears too.
    if (!muted) stopVoice();
    setMuted(m => {
      const next = !m;
      AsyncStorage.setItem(TEST_MUTED_KEY, next ? 'true' : 'false');
      return next;
    });
  };

  // Mute hides the icon, so these only guard the automatic playback paths below.
  const speakWord = useCallback(() => {
    if (muted) return;
    void playWord();
  }, [muted, playWord]);

  const speakMeaning = useCallback(() => {
    if (muted) return;
    void playMeaning();
  }, [muted, playMeaning]);

  const doToggleFlip = useCallback(() => {
    // Start the native-driver animation before touching the audio engine. The
    // unconditional stop below still runs in this tap stack, but cannot gate the
    // first animation frame even if native pause has work to do.
    if (flipped) {
      Animated.timing(flipAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => setFlipped(false));
    } else {
      Animated.timing(flipAnim, { toValue: 1, duration: 300, useNativeDriver: true })
        .start(() => {
          setFlipped(true);
          if (!backPlayed) {
            setBackPlayed(true);
            if (!muted && card?.meaning) void playMeaning();
          }
        });
    }
    // Muting only hides the icon; any clip already playing still stops as soon
    // as either side starts leaving the screen.
    stopVoice();
  }, [flipped, flipAnim, card, backPlayed, muted, playMeaning, stopVoice]);

  const advance = useCallback((kind: AnswerKind) => {
    if (!card) return;
    // A second tap while the card is animating out would grade the same card twice.
    if (gradedIdsRef.current.has(card.id)) return;
    // Before the grade is applied, and only for the first card of the session:
    // the notification is a flag write, and the test carries on regardless.
    if (gradedIdsRef.current.size === 0) onFirstAnswer?.();
    gradedIdsRef.current.add(card.id);
    stopVoice();

    // Grading writes absolute timestamps. The development visibility offset must
    // never be persisted into reviewHistory, testNextReview, hiddenUntil — or
    // the study record, which is why this is the real clock and not appNow().
    const answeredAt = Date.now();
    const outcome = gradeCard(card, kind, {
      now: answeredAt,
      syncTestResults: SYNC_WITH_TEST_RESULTS_ENABLED,
    });
    if (outcome.action === 'delete') onDeleteCard(card.id);
    else onUpdateCard(card.id, outcome.patch);
    // After the result, and after it has been applied: an answer is recorded
    // because one was given, not because the screen was opened.
    setSessionStudyLog(log => recordAnswer(log, answeredAt));
    onAnswerRecorded?.(answeredAt);

    // Perfect removes the card from the test — deleted outright with "Sync with
    // test results" on, mastered and out of the queue with it off — so the card
    // is animated away rather than simply replaced. Reduce Motion falls back to
    // the ordinary fade: the card still goes, it just does not travel.
    const leavesTest = kind === 'perfect' && !reduceMotion;
    const exit = leavesTest
      ? Animated.parallel([
          Animated.timing(cardOpacity, {
            toValue: 0, duration: PERFECT_EXIT_MS,
            easing: Easing.in(Easing.cubic), useNativeDriver: true,
          }),
          Animated.timing(cardScale, {
            toValue: PERFECT_EXIT_SCALE, duration: PERFECT_EXIT_MS,
            easing: Easing.in(Easing.cubic), useNativeDriver: true,
          }),
          Animated.timing(cardLift, {
            toValue: PERFECT_EXIT_LIFT, duration: PERFECT_EXIT_MS,
            easing: Easing.in(Easing.cubic), useNativeDriver: true,
          }),
        ])
      : Animated.timing(cardOpacity, {
          toValue: 0, duration: ADVANCE_FADE_OUT_MS, useNativeDriver: true,
        });

    exit.start(() => {
      flipAnim.setValue(0);
      // Reset before the next card is shown, so it fades in at full size from
      // where the card slot actually is rather than from the departed card's
      // last frame.
      cardScale.setValue(1);
      cardLift.setValue(0);
      setFlipped(false);
      setBackPlayed(false);
      setIdx(i => i + 1);
      Animated.timing(cardOpacity, {
        toValue: 1, duration: CARD_FADE_IN_MS, useNativeDriver: true,
      }).start();
    });
  }, [
    card, onUpdateCard, onDeleteCard, onFirstAnswer, onAnswerRecorded,
    flipAnim, cardOpacity, cardScale, cardLift, reduceMotion,
  ]);

  // ── Layout ────────────────────────────────────────────────────────────────
  // Test Mode is one of the word-list screen's card-area modes, not a sheet, so
  // it draws no header, no chrome of its own and no safe-area padding: the
  // screen above it keeps its own header, colour filter and Test button, and the
  // enclosing SafeAreaView already owns the insets. This content begins at the
  // progress bar.

  const bottomPad = 16;
  return (
    <View style={s.root}>

      {/* Progress bar */}
      {active && (
        <View style={[s.progressTrack, { backgroundColor: pal.border }]}>
          <View style={[s.progressFill, { backgroundColor: themeColor, width: `${(idx / total) * 100}%` }]} />
        </View>
      )}

      {/* Main content */}
      {showAnalytics ? (
        /* The card branch is replaced directly, only after its answer and local
           activity tally were applied. There is no intermediate empty card or
           word-list empty state. A manually opened view leaves `idx`, `queue`,
           `flipped` and every animation value untouched. */
        <ScrollView
          style={s.analyticsScroll}
          contentContainerStyle={s.center}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {done ? (
            <View style={s.completionSection} accessible accessibilityRole="text">
              <View style={[s.completionIcon, { backgroundColor: themeColor + '20' }]}>
                <Ionicons name="checkmark" size={34} color={themeColor} />
              </View>
              <Text style={[s.completionTitle, { color: pal.text }]} accessibilityRole="header">
                {t('study_test_complete_title')}
              </Text>
              <Text style={[s.completionSubtitle, { color: pal.sub }]}>
                {t('study_test_complete_subtitle')}
              </Text>
            </View>
          ) : null}
          <StudyAnalytics log={sessionStudyLog} now={Date.now()} pal={pal} themeColor={themeColor} />
          <View style={[s.analyticsActions, done && s.completionActions]}>
            {!done && (
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: themeColor }]}
                onPress={onCloseAnalytics}
              >
                <Text style={s.primaryBtnText}>{t('study_back_to_test')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={handleReset}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="refresh-outline" size={14} color={pal.sub} />
              <Text style={[s.secondaryBtnText, { color: pal.sub }]}>{t('test_reset')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* ── Card area ─────────────────────────────────────────────────── */
        <View style={s.cardArea}>

          {/* Toolbar: always visible above the card during the test */}
          <View style={s.toolbar}>
            <TouchableOpacity
              style={[s.toolBtn, { backgroundColor: pal.card, borderColor: pal.border }]}
              onPress={onOpenAnalytics}
              accessibilityRole="button"
              accessibilityLabel={t('study_analytics_title')}
            >
              <Ionicons name="stats-chart-outline" size={15} color={pal.text} />
              <Text style={[s.toolBtnText, { color: pal.text }]}>{t('study_analytics_title')}</Text>
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
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('test_mute')}
            >
              <Ionicons
                name="volume-mute-outline"
                size={15}
                color={muted ? themeColor : pal.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setInfoVisible(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('test_info_title')}
              style={[s.toolBtn, s.toolIconBtn, { backgroundColor: pal.card, borderColor: pal.border }]}
            >
              <Ionicons name="information-circle-outline" size={18} color={pal.sub} />
            </TouchableOpacity>
          </View>

          {/* Word card */}
          <View style={s.cardCenter}>
            <Animated.View
              style={[
                s.cardFadeWrap,
                {
                  opacity: cardOpacity,
                  transform: [{ scale: cardScale }, { translateY: cardLift }],
                },
              ]}
            >
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
                    voiceButton={(
                      <WordCardVoiceButton
                        onPress={speakWord}
                        phase={voiceState?.target === 'word' ? voiceState.phase : undefined}
                        source={wordVoiceSource}
                        themeColor={themeColor}
                        inactiveColor={pal.sub}
                      />
                    )}
                    showVoice={!muted}
                    selectableText
                  >
                    {/* With Hide Word on the face shows the eye-off mark and no
                        word, so there is no word to read aloud, select or copy.
                        The card keeps its size from the face's own minHeight.
                        Otherwise
                        `selectable` gives the native long-press selection and Copy
                        menu on both platforms. A quick tap still reaches the
                        Pressable underneath, so tap-to-flip is unchanged; the
                        `selectableText` flag above is what stops the same hold
                        also flipping the card away from the selection. The answer
                        buttons are separate views a selection cannot reach. */}
                    {isWordTextHidden(card, canHideWord)
                      ? <HiddenWordIcon color={pal.text} />
                      : <Text selectable style={[s.wordText, { color: pal.text }]}>{card!.word}</Text>}
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
                    voiceButton={(
                      <WordCardVoiceButton
                        onPress={speakMeaning}
                        phase={voiceState?.target === 'meaning' ? voiceState.phase : undefined}
                        themeColor={themeColor}
                        inactiveColor={pal.sub}
                      />
                    )}
                    showVoice={!muted}
                    selectableText
                  >
                    {/* Every user-authored field on this face is selectable, not
                        just the meaning: the note is often where the example
                        sentence lives. Both are covered by the one flag above —
                        a long press on either keeps the card on this side. */}
                    <Text selectable style={[s.meaningText, { color: pal.text }]}>{card!.meaning}</Text>
                    {card!.note ? (
                      <Text selectable style={[s.noteText, { color: pal.sub }]}>{card!.note}</Text>
                    ) : null}
                  </CardScrollFace>
                </Animated.View>
              </View>
            </Animated.View>
          </View>
        </View>
      )}

      {/* Answer buttons — revealed after first flip */}
      {!done && !analyticsOpen && (
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

      {/* The banner ad and the bottom safe-area spacer belong to the screen
          this content now sits inside, so neither is drawn a second time. */}

      <InfoPopup
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        pal={pal}
        explanationLang={explanationLang}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

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

  // Always-visible toolbar: Analytics, Shuffle, Mute, Info
  toolbar: {
    flexDirection: 'row',
    // Four controls share the row, and the three labels are translated.
    // Wrapping keeps every one of them reachable on a narrow phone in any
    // language, rather than pushing Info off the edge.
    flexWrap: 'wrap',
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
  // The Info control: same pill as the buttons beside it, sized for its icon
  // alone so the row still fits on the narrowest phone in every language.
  toolIconBtn: {
    paddingHorizontal: 10,
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

  // Completion / analytics screen
  analyticsScroll: { flex: 1 },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  completionSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 26,
  },
  completionIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  completionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
  },
  // Manual analytics stacks Back above the compact, left-aligned Reset.
  analyticsActions: {
    width: '100%',
    marginTop: 48,
    minHeight: 44,
    alignItems: 'center',
    gap: 14,
  },
  // Completion has no Back button and retains its existing far-left Reset.
  completionActions: {
    alignItems: 'flex-start',
  },
  // Back is used only for manually opened analytics and spans the available
  // action width above Reset.
  primaryBtn: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    // Reset is intentionally quieter than the primary Back action.
    backgroundColor: 'transparent',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
