import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from 'react-native';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system';
import { Audio } from 'expo-av';

import type { Palette, ReviewEntry, TestLevel, WordCard } from '../types';
import { SUPPORTED_LANGUAGES, useLang, type TranslationKey } from '../i18n';
import { LanguageModal } from './LanguageModal';
import { generateBreakdown, generateExample, generateMeaning, translateText } from '../lib/generateMeaning';
import { appStyles as s } from '../styles';
import { AD_BANNER_HEIGHT, ADS_ENABLED } from './AdBannerPlaceholder';

const SCREEN_H = Dimensions.get('window').height;

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const VOLUME_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5];

// Maps stable rating IDs to i18n label keys.
const RATING_LABEL_KEYS: Record<TestLevel, TranslationKey> = {
  perfect:  'test_know_perfectly',
  good:     'test_know_good',
  slightly: 'test_know_slightly',
  unknown:  'test_dont_know',
};
const RATING_COLORS: Record<TestLevel, string> = {
  perfect:  '#22c55e',
  good:     '#3B82F6',
  slightly: '#f59e0b',
  unknown:  '#ef4444',
};

// ── TTS language options (BCP-47 codes supported by device TTS) ───────────────

const TTS_LANGUAGES: { code: string | undefined; flag: string; label: string }[] = [
  { code: undefined, flag: '🌐', label: 'Auto' },
  { code: 'en-US',  flag: '🇺🇸', label: 'English (US)' },
  { code: 'ja-JP',  flag: '🇯🇵', label: '日本語' },
  { code: 'ko-KR',  flag: '🇰🇷', label: '한국어' },
  { code: 'zh-CN',  flag: '🇨🇳', label: '中文 (简体)' },
  { code: 'zh-TW',  flag: '🇹🇼', label: '中文 (繁體)' },
  { code: 'es-ES',  flag: '🇪🇸', label: 'Español' },
  { code: 'fr-FR',  flag: '🇫🇷', label: 'Français' },
  { code: 'de-DE',  flag: '🇩🇪', label: 'Deutsch' },
  { code: 'it-IT',  flag: '🇮🇹', label: 'Italiano' },
  { code: 'pt-BR',  flag: '🇧🇷', label: 'Português' },
];

function chipLabel(code: string | undefined): string {
  const entry = TTS_LANGUAGES.find(l => l.code === code) ?? TTS_LANGUAGES[0];
  return code ? `${entry.flag} ${code.split('-')[0].toUpperCase()}` : `${entry.flag} Auto`;
}

function genChipLabel(code: string): string {
  const entry = SUPPORTED_LANGUAGES.find(l => l.code === code) ?? SUPPORTED_LANGUAGES[0];
  return entry.flag;
}


// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  editingCard: WordCard | null;
  word: string;
  onChangeWord: (v: string) => void;
  meaning: string;
  onChangeMeaning: (v: string) => void;
  note: string;
  onChangeNote: (v: string) => void;
  onSave: () => void;
  pal: Palette;
  themeColor: string;
  isSubscribed: boolean;
  /** Premium plan — gates the AI text tools (meaning, example, breakdown, translate). */
  isPremium?: boolean;
  wordLang: string | undefined;
  onChangeWordLang: (lang: string | undefined) => void;
  meaningLang: string | undefined;
  onChangeMeaningLang: (lang: string | undefined) => void;
  audioUri?: string;
  onChangeAudioUri: (uri: string | undefined) => void;
  audioSpeed: number;
  onChangeAudioSpeed: (v: number) => void;
  audioVolume: number;
  onChangeAudioVolume: (v: number) => void;
  hideAiTools?: boolean;
  reviewHistory: ReviewEntry[];
  testClearPending: boolean;
  onResetAll(): void;
  /** Basic plan: true when the card doesn't already have a custom voice and 10 others do. */
  basicVoiceLimitReached?: boolean;
  /** Called when a non-Premium user taps the locked audio button. */
  onUpgrade?: () => void;
}

export function WordModal({
  visible, onClose, editingCard,
  word, onChangeWord, meaning, onChangeMeaning, note, onChangeNote,
  onSave, pal, themeColor,
  isSubscribed, isPremium = false, wordLang, onChangeWordLang, meaningLang, onChangeMeaningLang,
  audioUri, onChangeAudioUri,
  audioSpeed, onChangeAudioSpeed,
  audioVolume, onChangeAudioVolume,
  hideAiTools = false,
  reviewHistory,
  testClearPending,
  onResetAll,
  basicVoiceLimitReached = false,
  onUpgrade,
}: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();

  // which field's picker is open
  const [pickerFor, setPickerFor] = useState<'word' | 'meaning' | 'genLang' | 'exampleLang' | 'breakdownLang' | 'meaningTransLang' | 'noteTransLang' | null>(null);

  // meaning generation
  const [genLang, setGenLang]         = useState('ja');
  const [isGenerating, setIsGenerating] = useState(false);

  // example sentence generation
  const [exampleLang, setExampleLang]         = useState('en-US');
  const [isGeneratingExample, setIsGeneratingExample] = useState(false);

  // word breakdown
  const [breakdownLang, setBreakdownLang]   = useState('ja');
  const [isBreakingDown, setIsBreakingDown] = useState(false);

  // translation
  const [meaningTransLang, setMeaningTransLang]         = useState('ja');
  const [meaningTranslation, setMeaningTranslation]     = useState('');
  const [meaningTransCollapsed, setMeaningTransCollapsed] = useState(false);
  const [isTranslatingMeaning, setIsTranslatingMeaning] = useState(false);
  const [noteTransLang, setNoteTransLang]               = useState('ja');
  const [noteTranslation, setNoteTranslation]           = useState('');
  const [noteTransCollapsed, setNoteTransCollapsed]     = useState(false);
  const [isTranslatingNote, setIsTranslatingNote]       = useState(false);

  const scrollRef           = useRef<ScrollView>(null);
  const scrollGuardTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks live scroll offset so we can restore it after iOS auto-scrolls to the focused input.
  const scrollYRef          = useRef(0);
  const savedScrollYBeforeKb = useRef(0);
  // Ref (not state) so scroll status is readable synchronously in event handlers.
  const isScrollingRef      = useRef(false);

  const handleScrollBeginDrag = () => {
    if (scrollGuardTimer.current) clearTimeout(scrollGuardTimer.current);
    isScrollingRef.current = true;
  };
  const handleScrollEnded = () => {
    scrollGuardTimer.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 150);
  };

  // Dismiss keyboard when the user taps a non-interactive area outside the inputs.
  // TouchableWithoutFeedback.onPress only fires on genuine taps, not during scroll,
  // so the isScrollingRef guard is a safety net for very short drags.
  const handleDismissKeyboard = () => {
    if (!isScrollingRef.current) Keyboard.dismiss();
  };

  // ── Top error / hint banner ──────────────────────────────────────────────────
  // Shared banner: shows either the Basic voice limit or the locked-custom-voice error.
  const [hintShowing, setHintShowing] = useState(false);
  const [hintKey, setHintKey]   = useState<TranslationKey>('basic_voice_limit');
  const [hintIcon, setHintIcon] = useState<ComponentProps<typeof Ionicons>['name']>('mic-outline');
  const hintAnim  = useRef(new Animated.Value(0)).current;
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissHint = useCallback(() => {
    if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = null; }
    Animated.timing(hintAnim, { toValue: 0, duration: 220, useNativeDriver: false })
      .start(({ finished }) => { if (finished) setHintShowing(false); });
  }, [hintAnim]);

  const showHint = useCallback((key: TranslationKey, icon: ComponentProps<typeof Ionicons>['name']) => {
    setHintKey(key);
    setHintIcon(icon);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHintShowing(true);
    Animated.spring(hintAnim, { toValue: 1, tension: 90, friction: 9, useNativeDriver: false }).start();
    hintTimer.current = setTimeout(dismissHint, 2500);
  }, [hintAnim, dismissHint]);

  // Non-Premium user tapped play on a custom voice saved while Premium.
  const handleLockedVoicePlay = useCallback(() => {
    Keyboard.dismiss();
    showHint('custom_voice_locked_msg', 'warning');
  }, [showHint]);

  const hintPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy < -6,
    onPanResponderMove: (_, g) => {
      if (g.dy < 0) hintAnim.setValue(Math.max(0, 1 - (-g.dy) / 80));
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy < -28) {
        dismissHint();
      } else {
        Animated.spring(hintAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: false }).start();
        if (hintTimer.current) clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(dismissHint, 2500);
      }
    },
  })).current;

  const handleVoiceLangBtn = useCallback((field: 'word' | 'meaning') => {
    if (basicVoiceLimitReached) { showHint('basic_voice_limit', 'mic-outline'); return; }
    Keyboard.dismiss();
    setPickerFor(field);
  }, [basicVoiceLimitReached, showHint]);

  // ── Audio ────────────────────────────────────────────────────────────────────
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioSettingsExpanded, setAudioSettingsExpanded] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const toggleAudioSettings = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAudioSettingsExpanded(e => !e);
  };

  // Stop and unload sound whenever the modal closes
  useEffect(() => {
    if (!visible) {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      setIsPlayingAudio(false);
    }
  }, [visible]);

  // Always clean up on unmount
  useEffect(() => () => { soundRef.current?.unloadAsync().catch(() => {}); }, []);

  const handleAudioButton = async () => {
    if (!audioUri) {
      // Pick an audio file and copy it to persistent storage
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: false });
        if (result.canceled) return;
        const asset = result.assets[0];
        const audioDir = new Directory(Paths.document, 'audio');
        audioDir.create({ intermediates: true, idempotent: true });
        const ext = asset.name.split('.').pop() ?? 'mp3';
        const destFile = new File(audioDir, `audio_${Date.now()}.${ext}`);
        new File(asset.uri).copy(destFile);
        onChangeAudioUri(destFile.uri);
      } catch {
        Alert.alert(t('err_title_error'), t('err_audio_import'));
      }
      return;
    }

    // Toggle playback
    if (isPlayingAudio) {
      await soundRef.current?.stopAsync().catch(() => {});
      await soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      setIsPlayingAudio(false);
      return;
    }

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
      await sound.setRateAsync(audioSpeed, true);
      await sound.setVolumeAsync(Math.min(audioVolume, 1.0));
      soundRef.current = sound;
      setIsPlayingAudio(true);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
          setIsPlayingAudio(false);
        }
      });
    } catch {
      Alert.alert(t('err_title_playback'), t('err_audio_play'));
      setIsPlayingAudio(false);
    }
  };

  const handleClearAudio = () => {
    const doRemove = () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      setIsPlayingAudio(false);
      setAudioSettingsExpanded(false);
      onChangeAudioUri(undefined);
      onChangeAudioSpeed(1.0);
      onChangeAudioVolume(1.0);
    };
    // Only ask for confirmation when editing an existing saved word.
    if (editingCard) {
      Alert.alert(t('remove_audio'), t('remove_audio_confirm'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: doRemove },
      ]);
    } else {
      doRemove();
    }
  };

  // keyboard height for floating Save toolbar
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    // On iOS, save the current scroll offset just before the keyboard appears.
    // iOS UIKit automatically scrolls the ScrollView to reveal the focused input
    // (scroll-to-first-responder). We undo that after the keyboard is fully shown.
    const willShow = Keyboard.addListener(showEvt, e => {
      savedScrollYBeforeKb.current = scrollYRef.current;
      setKbHeight(e.endCoordinates.height);
    });
    // keyboardDidShow fires after the keyboard animation + auto-scroll complete.
    // Snap back to where the user was — they control scrolling manually.
    const didShow = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardDidShow', () => {
          scrollRef.current?.scrollTo({ y: savedScrollYBeforeKb.current, animated: false });
        })
      : null;
    const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));

    return () => { willShow.remove(); didShow?.remove(); hide.remove(); };
  }, []);

  // Sheet fills from the safe-area top boundary downward, covering the folder header
  const totalH = SCREEN_H - insets.top;
  const cardH  = totalH - (isSubscribed ? 0 : AD_BANNER_HEIGHT) - insets.bottom;

  const slideY          = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const isAIPicker = pickerFor !== null && pickerFor !== 'word' && pickerFor !== 'meaning';

  // Selected language for the AI language picker
  const selectedAILang: string =
    pickerFor === 'exampleLang'     ? exampleLang
    : pickerFor === 'breakdownLang'   ? breakdownLang
    : pickerFor === 'meaningTransLang' ? meaningTransLang
    : pickerFor === 'noteTransLang'   ? noteTransLang
    : genLang;

  const pickAILang = (code: string) => {
    if (pickerFor === 'genLang')          setGenLang(code);
    else if (pickerFor === 'exampleLang') setExampleLang(code);
    else if (pickerFor === 'breakdownLang') setBreakdownLang(code);
    else if (pickerFor === 'meaningTransLang') { setMeaningTransLang(code); setMeaningTranslation(''); }
    else if (pickerFor === 'noteTransLang')    { setNoteTransLang(code);    setNoteTranslation(''); }
  };

  useEffect(() => {
    if (visible) {
      slideY.setValue(SCREEN_H);
      backdropOpacity.setValue(0);
      setMeaningTranslation('');
      setMeaningTransCollapsed(false);
      setNoteTranslation('');
      setNoteTransCollapsed(false);
      setHistoryExpanded(false);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: false }),
        Animated.timing(slideY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    setPickerFor(null);
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(slideY, { toValue: SCREEN_H, duration: 220, useNativeDriver: false }),
    ]).start(() => onClose());
  };

  // Tapping the Close button (or the backdrop) auto-saves the current changes.
  // With nothing entered there is nothing to save, so we just close.
  const handleCloseSave = () => {
    Keyboard.dismiss();
    setPickerFor(null);
    if (!word.trim()) { handleClose(); return; }
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(slideY, { toValue: SCREEN_H, duration: 220, useNativeDriver: false }),
    ]).start(() => onSave());
  };

  const selectedTTSLang = pickerFor === 'word' ? wordLang : meaningLang;
  const onPickTTSLang = (code: string | undefined) => {
    if (pickerFor === 'word') onChangeWordLang(code);
    else if (pickerFor === 'meaning') onChangeMeaningLang(code);
    setPickerFor(null);
  };

  const handleGenerate = async () => {
    const trimmed = word.trim();
    if (!trimmed || isGenerating) return;
    Keyboard.dismiss();
    setIsGenerating(true);
    try {
      const result = await generateMeaning(trimmed, genLang);
      onChangeMeaning(result);
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message === 'quota_exceeded'
        ? t('quota_exceeded_msg')
        : e instanceof Error && e.message === 'input_too_long'
        ? t('err_input_too_long')
        : t('err_ai_meaning');
      Alert.alert(t('err_ai_title'), msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateExample = async () => {
    const trimmed = word.trim();
    if (!trimmed || isGeneratingExample) return;
    Keyboard.dismiss();
    setIsGeneratingExample(true);
    try {
      const result = await generateExample(trimmed, exampleLang);
      onChangeNote(result);
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message === 'quota_exceeded'
        ? t('quota_exceeded_msg')
        : e instanceof Error && e.message === 'input_too_long'
        ? t('err_input_too_long')
        : t('err_ai_example');
      Alert.alert(t('err_ai_title'), msg);
    } finally {
      setIsGeneratingExample(false);
    }
  };

  const handleBreakdown = async () => {
    const trimmed = word.trim();
    if (!trimmed || isBreakingDown) return;
    Keyboard.dismiss();
    setIsBreakingDown(true);
    try {
      onChangeNote(await generateBreakdown(trimmed, breakdownLang));
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message === 'quota_exceeded'
        ? t('quota_exceeded_msg')
        : e instanceof Error && e.message === 'input_too_long'
        ? t('err_input_too_long')
        : t('err_ai_breakdown');
      Alert.alert(t('err_ai_title'), msg);
    } finally {
      setIsBreakingDown(false);
    }
  };

  const handleTranslateMeaning = async () => {
    const trimmed = meaning.trim();
    if (!trimmed || isTranslatingMeaning) return;
    Keyboard.dismiss();
    setIsTranslatingMeaning(true);
    try {
      setMeaningTranslation(await translateText(trimmed, meaningTransLang));
      setMeaningTransCollapsed(false);
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message === 'quota_exceeded'
        ? t('quota_exceeded_msg')
        : e instanceof Error && e.message === 'input_too_long'
        ? t('err_input_too_long')
        : t('err_translate_body');
      Alert.alert(t('err_translate_title'), msg);
    } finally {
      setIsTranslatingMeaning(false);
    }
  };

  const handleTranslateNote = async () => {
    const trimmed = note.trim();
    if (!trimmed || isTranslatingNote) return;
    Keyboard.dismiss();
    setIsTranslatingNote(true);
    try {
      setNoteTranslation(await translateText(trimmed, noteTransLang));
      setNoteTransCollapsed(false);
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message === 'quota_exceeded'
        ? t('quota_exceeded_msg')
        : e instanceof Error && e.message === 'input_too_long'
        ? t('err_input_too_long')
        : t('err_translate_body');
      Alert.alert(t('err_translate_title'), msg);
    } finally {
      setIsTranslatingNote(false);
    }
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropOpacity }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleCloseSave} />
      </Animated.View>

      {/* Sheet — stays fixed at bottom of screen */}
      <View style={styles.sheetOuter} pointerEvents="box-none">
        <View style={styles.sheetFill} pointerEvents="box-none">
          <Animated.View
            style={{ transform: [{ translateY: slideY }] }}
            pointerEvents="box-none"
          >
            {/* Sheet card */}
            <View style={[styles.sheetCard, { backgroundColor: pal.dialog, height: cardH }]}>
              <View style={{ flex: 1 }}>
                {/* Header */}
                <View style={styles.headerRow}>
                  <Text style={[styles.headerTitle, { color: pal.text }]}>
                    {editingCard ? t('edit_word') : t('add_word')}
                  </Text>
                  <TouchableOpacity onPress={handleCloseSave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={22} color={pal.sub} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1 }}
                  bounces={true}
                  keyboardShouldPersistTaps="always"
                  keyboardDismissMode="none"
                  showsVerticalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                  onScrollBeginDrag={handleScrollBeginDrag}
                  onScrollEndDrag={handleScrollEnded}
                  onMomentumScrollEnd={handleScrollEnded}
                >
                <TouchableWithoutFeedback onPress={handleDismissKeyboard}>
                <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: Math.max(kbHeight, 520) }}>
                {/* Word field */}
                <View style={styles.fieldLabelRow}>
                  <Text style={[s.inputLabel, { color: pal.sub, marginBottom: 0 }]}>
                    {t('word_label')}<Text style={{ color: pal.sub }}> *</Text>
                  </Text>
                  {isPremium ? (
                    <View style={styles.audioBtnGroup}>
                      {audioUri && (
                        <TouchableOpacity
                          onPress={handleClearAudio}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={t('remove_audio')}
                          style={styles.audioRemoveBtn}
                        >
                          <Ionicons name="close-circle" size={18} color={pal.sub} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={handleAudioButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[
                          styles.audioBtn,
                          audioUri
                            ? { borderColor: themeColor + '60', backgroundColor: themeColor + '18' }
                            : { borderColor: pal.border },
                        ]}
                      >
                        <Ionicons
                          name={isPlayingAudio ? 'pause-circle' : audioUri ? 'play-circle' : 'musical-notes-outline'}
                          size={16}
                          color={audioUri ? themeColor : pal.sub}
                        />
                      </TouchableOpacity>
                    </View>
                  ) : audioUri ? (
                    // Downgraded from Premium: keep the play + remove buttons only for a word
                    // that already had a custom voice saved. Play shows the locked-voice message.
                    <View style={styles.audioBtnGroup}>
                      <TouchableOpacity
                        onPress={handleClearAudio}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={t('remove_audio')}
                        style={styles.audioRemoveBtn}
                      >
                        <Ionicons name="close-circle" size={18} color={pal.sub} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleLockedVoicePlay}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[styles.audioBtn, { borderColor: themeColor + '60', backgroundColor: themeColor + '18' }]}
                      >
                        <Ionicons name="play-circle" size={16} color={themeColor} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
                <View>
                  <TextInput
                    style={[s.input, s.inputMultiline, { borderColor: pal.border, backgroundColor: pal.input, color: pal.text, minHeight: 96 }]}
                    value={word}
                    onChangeText={onChangeWord}
                    multiline
                    scrollEnabled={false}
                  />
                </View>

                {/* Audio playback settings — visible only when an audio file is attached and user is Premium */}
                {isPremium && audioUri ? (
                  <View style={[styles.audioSettings, { borderColor: pal.border, backgroundColor: pal.input }]}>
                    {/* Collapsible header */}
                    <TouchableOpacity
                      onPress={toggleAudioSettings}
                      activeOpacity={0.6}
                      style={styles.audioSettingsHeader}
                    >
                      <Text style={[styles.audioSettingsTitle, { color: pal.sub }]}>Playback</Text>
                      <Ionicons
                        name={audioSettingsExpanded ? 'chevron-up' : 'chevron-down'}
                        size={13}
                        color={pal.sub}
                      />
                    </TouchableOpacity>

                    {audioSettingsExpanded && (
                      <View style={styles.audioSettingsBody}>
                        {/* Speed row */}
                        <View style={styles.audioSettingRow}>
                          <Text style={[styles.audioSettingLabel, { color: pal.sub }]}>Speed</Text>
                          <View style={styles.audioChipRow}>
                            {SPEED_OPTIONS.map(rate => {
                              const active = audioSpeed === rate;
                              return (
                                <TouchableOpacity
                                  key={rate}
                                  onPress={() => onChangeAudioSpeed(rate)}
                                  style={[
                                    styles.audioChip,
                                    { borderColor: active ? themeColor : pal.border },
                                    active && { backgroundColor: themeColor + '18' },
                                  ]}
                                >
                                  <Text style={[styles.audioChipText, { color: active ? themeColor : pal.sub }]}>
                                    {rate === 1.0 ? '1×' : `${rate}×`}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                        {/* Volume row */}
                        <View style={[styles.audioSettingRow, { marginTop: 8 }]}>
                          <Text style={[styles.audioSettingLabel, { color: pal.sub }]}>Volume</Text>
                          <View style={styles.audioChipRow}>
                            {VOLUME_OPTIONS.map(v => {
                              const active = audioVolume === v;
                              return (
                                <TouchableOpacity
                                  key={v}
                                  onPress={() => onChangeAudioVolume(v)}
                                  style={[
                                    styles.audioChip,
                                    { borderColor: active ? themeColor : pal.border },
                                    active && { backgroundColor: themeColor + '18' },
                                  ]}
                                >
                                  <Text style={[styles.audioChipText, { color: active ? themeColor : pal.sub }]}>
                                    {Math.round(v * 100)}%
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                ) : null}

                {/* Swap Word ↔ Meaning */}
                <View style={styles.swapRow}>
                  <TouchableOpacity
                    onPress={() => { const w = word; onChangeWord(meaning); onChangeMeaning(w); }}
                    disabled={!word.trim() && !meaning.trim()}
                    style={[styles.swapBtn, { borderColor: pal.border, backgroundColor: pal.chip, opacity: word.trim() || meaning.trim() ? 1 : 0.35 }]}
                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  >
                    <Ionicons name="swap-vertical" size={14} color={pal.sub} />
                    <Text style={[styles.swapBtnText, { color: pal.sub }]}>{t('swap_fields')}</Text>
                  </TouchableOpacity>
                </View>

                {/* Meaning field */}
                <View style={[styles.fieldLabelRow, { marginTop: 8 }]}>
                  <Text style={[s.inputLabel, { color: pal.sub, marginBottom: 0 }]}>{t('meaning_label')}</Text>
                  <View style={styles.audioBtnGroup}>
                    {isPremium && !hideAiTools && (
                    <View style={[styles.aiGroup, { borderColor: themeColor + '40', opacity: word.trim() ? 1 : 0.35 }]}>
                      <TouchableOpacity
                        onPress={handleGenerate}
                        disabled={!word.trim() || isGenerating}
                        activeOpacity={0.5}
                        style={[styles.aiSegment, { backgroundColor: themeColor + '18' }]}
                      >
                        {isGenerating
                          ? <ActivityIndicator size="small" color={themeColor} />
                          : <Text style={[styles.aiSegmentText, { color: themeColor }]}>{t('btn_meaning')}</Text>
                        }
                      </TouchableOpacity>
                      <View style={[styles.aiDivider, { backgroundColor: themeColor + '40' }]} />
                      <TouchableOpacity
                        onPress={() => { Keyboard.dismiss(); setPickerFor('genLang'); }}
                        disabled={!word.trim()}
                        style={[styles.aiSegment, { backgroundColor: pal.chip }]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[styles.aiSegmentText, { color: pal.sub }]}>{genChipLabel(genLang)}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  </View>
                </View>
                <View>
                  <TextInput
                    style={[s.input, s.inputMultiline, { borderColor: pal.border, backgroundColor: pal.input, color: pal.text, minHeight: 96, marginBottom: isPremium && !hideAiTools && meaning.trim() ? 4 : 18 }]}
                    value={meaning}
                    onChangeText={onChangeMeaning}
                    multiline
                    scrollEnabled={false}
                  />
                </View>
                {isPremium && !hideAiTools && meaning.trim() ? (
                  <View style={styles.transSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      {meaningTranslation ? (
                        <TouchableOpacity
                          onPress={() => setMeaningTransCollapsed(c => !c)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name={meaningTransCollapsed ? 'chevron-up' : 'chevron-down'} size={14} color={pal.sub} />
                        </TouchableOpacity>
                      ) : null}
                      <View style={[styles.aiGroup, { borderColor: themeColor + '40' }]}>
                        <TouchableOpacity
                          onPress={handleTranslateMeaning}
                          disabled={isTranslatingMeaning}
                          activeOpacity={0.5}
                          style={[styles.aiSegment, { backgroundColor: themeColor + '18' }]}
                        >
                          {isTranslatingMeaning
                            ? <ActivityIndicator size="small" color={themeColor} />
                            : <Text style={[styles.aiSegmentText, { color: themeColor }]}>Translate</Text>
                          }
                        </TouchableOpacity>
                        <View style={[styles.aiDivider, { backgroundColor: themeColor + '40' }]} />
                        <TouchableOpacity
                          onPress={() => { Keyboard.dismiss(); setPickerFor('meaningTransLang'); }}
                          style={[styles.aiSegment, { backgroundColor: pal.chip }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.aiSegmentText, { color: pal.sub }]}>{genChipLabel(meaningTransLang)}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {meaningTranslation && !meaningTransCollapsed ? (
                      <View style={[styles.transResult, { backgroundColor: pal.chip }]}>
                        <Text style={[styles.transText, { color: pal.sub }]}>{meaningTranslation}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Note field */}
                <View style={[styles.fieldLabelRow, { marginTop: 24 }]}>
                  <Text style={[s.inputLabel, { color: pal.sub, marginBottom: 0 }]}>{t('note_label')}</Text>
                  {/* Breakdown + AI Example — Basic Plan only */}
                  {isPremium && !hideAiTools && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {/* Breakdown with lang selector */}
                      <View style={[styles.aiGroup, { borderColor: themeColor + '40', opacity: word.trim() ? 1 : 0.35 }]}>
                        <TouchableOpacity
                          onPress={handleBreakdown}
                          disabled={!word.trim() || isBreakingDown}
                          activeOpacity={0.5}
                          style={[styles.aiSegment, { backgroundColor: themeColor + '18' }]}
                        >
                          {isBreakingDown
                            ? <ActivityIndicator size="small" color={themeColor} />
                            : <Text style={[styles.aiSegmentText, { color: themeColor }]}>Breakdown</Text>
                          }
                        </TouchableOpacity>
                        <View style={[styles.aiDivider, { backgroundColor: themeColor + '40' }]} />
                        <TouchableOpacity
                          onPress={() => { Keyboard.dismiss(); setPickerFor('breakdownLang'); }}
                          disabled={!word.trim()}
                          style={[styles.aiSegment, { backgroundColor: pal.chip }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.aiSegmentText, { color: pal.sub }]}>{genChipLabel(breakdownLang)}</Text>
                        </TouchableOpacity>
                      </View>
                      {/* AI Example + lang */}
                      <View style={[styles.aiGroup, { borderColor: themeColor + '40', opacity: word.trim() ? 1 : 0.35 }]}>
                        <TouchableOpacity
                          onPress={handleGenerateExample}
                          disabled={!word.trim() || isGeneratingExample}
                          activeOpacity={0.5}
                          style={[styles.aiSegment, { backgroundColor: themeColor + '18' }]}
                        >
                          {isGeneratingExample
                            ? <ActivityIndicator size="small" color={themeColor} />
                            : <Text style={[styles.aiSegmentText, { color: themeColor }]}>{t('btn_example')}</Text>
                          }
                        </TouchableOpacity>
                        <View style={[styles.aiDivider, { backgroundColor: themeColor + '40' }]} />
                        <TouchableOpacity
                          onPress={() => { Keyboard.dismiss(); setPickerFor('exampleLang'); }}
                          disabled={!word.trim()}
                          style={[styles.aiSegment, { backgroundColor: pal.chip }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.aiSegmentText, { color: pal.sub }]}>{genChipLabel(exampleLang)}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
                <View>
                  <TextInput
                    style={[s.input, s.inputMultiline, { borderColor: pal.border, backgroundColor: pal.input, color: pal.text, minHeight: 96, marginBottom: isPremium && !hideAiTools && note.trim() ? 4 : 18 }]}
                    value={note}
                    onChangeText={onChangeNote}
                    multiline
                    scrollEnabled={false}
                  />
                </View>
                {isPremium && !hideAiTools && note.trim() ? (
                  <View style={styles.transSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      {noteTranslation ? (
                        <TouchableOpacity
                          onPress={() => setNoteTransCollapsed(c => !c)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name={noteTransCollapsed ? 'chevron-up' : 'chevron-down'} size={14} color={pal.sub} />
                        </TouchableOpacity>
                      ) : null}
                      <View style={[styles.aiGroup, { borderColor: themeColor + '40' }]}>
                        <TouchableOpacity
                          onPress={handleTranslateNote}
                          disabled={isTranslatingNote}
                          activeOpacity={0.5}
                          style={[styles.aiSegment, { backgroundColor: themeColor + '18' }]}
                        >
                          {isTranslatingNote
                            ? <ActivityIndicator size="small" color={themeColor} />
                            : <Text style={[styles.aiSegmentText, { color: themeColor }]}>Translate</Text>
                          }
                        </TouchableOpacity>
                        <View style={[styles.aiDivider, { backgroundColor: themeColor + '40' }]} />
                        <TouchableOpacity
                          onPress={() => { Keyboard.dismiss(); setPickerFor('noteTransLang'); }}
                          style={[styles.aiSegment, { backgroundColor: pal.chip }]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.aiSegmentText, { color: pal.sub }]}>{genChipLabel(noteTransLang)}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {noteTranslation && !noteTransCollapsed ? (
                      <View style={[styles.transResult, { backgroundColor: pal.chip }]}>
                        <Text style={[styles.transText, { color: pal.sub }]}>{noteTranslation}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {/* Review History — only shown when editing an existing word */}
                {editingCard && (
                  <View style={[styles.historySection, { borderTopColor: pal.border }]}>
                    <TouchableOpacity
                      style={styles.historyHeader}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setHistoryExpanded(e => !e);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyTitle, { color: pal.text }]}>{t('review_history')}</Text>
                        <Text style={[styles.historyCount, { color: pal.sub }]}>
                          {reviewHistory.length === 1
                            ? t('review_history_count_one')
                            : t('review_history_count_other').replace('{n}', String(reviewHistory.length))}
                        </Text>
                      </View>
                      <Ionicons
                        name={historyExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={pal.sub}
                      />
                    </TouchableOpacity>

                    {historyExpanded && (
                      <View style={styles.historyList}>
                        {reviewHistory.length === 0 ? (
                          <Text style={[styles.historyEmpty, { color: pal.sub }]}>
                            {t('review_history_empty')}
                          </Text>
                        ) : (
                          [...reviewHistory].reverse().map((entry, i) => (
                            <View
                              key={i}
                              style={[styles.historyEntry, { borderBottomColor: pal.border }]}
                            >
                              <Text style={[styles.historyDate, { color: pal.sub }]}>
                                {new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' }).format(new Date(entry.ts))}
                              </Text>
                              <Text style={[styles.historyRating, { color: RATING_COLORS[entry.rating] }]}>
                                {t(RATING_LABEL_KEYS[entry.rating])}
                              </Text>
                            </View>
                          ))
                        )}

                        {!testClearPending && (reviewHistory.length > 0 || editingCard?.testLevel != null) && (
                          <TouchableOpacity
                            style={[styles.historyResetBtn, { borderColor: pal.border }]}
                            onPress={() => {
                              Alert.alert(
                                t('review_history_reset_title'),
                                t('review_history_reset_body'),
                                [
                                  { text: t('cancel'), style: 'cancel' },
                                  {
                                    text: t('review_history_reset'),
                                    style: 'destructive',
                                    onPress: onResetAll,
                                  },
                                ]
                              );
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="refresh-outline" size={13} color={pal.sub} />
                            <Text style={[styles.historyResetText, { color: pal.sub }]}>
                              {t('review_history_reset')}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                )}
                </View>
                </TouchableWithoutFeedback>
                </ScrollView>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: pal.chip }]}
                    onPress={handleClose}
                  >
                    <Text style={[styles.btnText, { color: pal.sub }]}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: themeColor }]}
                    onPress={onSave}
                  >
                    <Text style={[styles.btnText, { color: '#fff' }]}>{t('save')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Banner — hidden for Pro subscribers; also suppressed when ADS_ENABLED = false */}
            {ADS_ENABLED && !isSubscribed && (
              <View
                style={[
                  styles.banner,
                  {
                    backgroundColor: pal.chip,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: pal.border,
                  },
                ]}
              >
                <Text style={[styles.bannerLabel, { color: pal.sub }]}>Advertisement</Text>
              </View>
            )}

            {/* Safe-area spacer */}
            {insets.bottom > 0 && (
              <View style={{ height: insets.bottom, backgroundColor: pal.dialog }} />
            )}
          </Animated.View>
        </View>
      </View>

      {/* Floating keyboard buttons — no background bar, standalone elevated */}
      {kbHeight > 0 && (
        <View style={[styles.kbToolbar, { bottom: kbHeight }]}>
          <TouchableOpacity
            onPress={onSave}
            style={[styles.kbBtn, { backgroundColor: themeColor }]}
          >
            <Text style={[styles.kbBtnText, { color: '#fff' }]}>{t('save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={Keyboard.dismiss}
            style={[styles.kbBtn, { backgroundColor: pal.chip }]}
          >
            <Ionicons name="chevron-down" size={16} color={pal.sub} />
          </TouchableOpacity>
        </View>
      )}

      {/* Top error / hint banner — tap or swipe up to dismiss */}
      {hintShowing && (
        <Animated.View
          style={[
            styles.hintBanner,
            {
              top: insets.top + 8,
              backgroundColor: pal.dialog,
              borderColor: pal.border,
              opacity: hintAnim,
              transform: [{ translateY: hintAnim.interpolate({ inputRange: [0, 1], outputRange: [-56, 0] }) }],
            },
          ]}
          {...hintPan.panHandlers}
        >
          <TouchableOpacity activeOpacity={0.85} onPress={dismissHint} style={styles.hintTouch}>
            <Ionicons
              name={hintIcon}
              size={16}
              color={hintIcon === 'warning' ? '#f59e0b' : pal.sub}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.hintText, { color: pal.text }]}>{t(hintKey)}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* TTS language picker (word / meaning fields only) */}
      {(pickerFor === 'word' || pickerFor === 'meaning') && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setPickerFor(null)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.pickerSheet, { backgroundColor: pal.dialog, paddingBottom: insets.bottom + 8 }]}
            >
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                {TTS_LANGUAGES.map(lang => {
                  const selected = lang.code === selectedTTSLang;
                  return (
                    <TouchableOpacity
                      key={lang.code ?? '__auto__'}
                      style={[styles.pickerRow, selected && { backgroundColor: themeColor + '18' }]}
                      onPress={() => onPickTTSLang(lang.code)}
                    >
                      <Text style={styles.pickerFlag}>{lang.flag}</Text>
                      <Text style={[styles.pickerLabel, { color: pal.text }]}>{lang.label}</Text>
                      {selected && <Ionicons name="checkmark" size={18} color={themeColor} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* AI language picker — rendered inside this Modal so it stacks above it on iOS */}
      <LanguageModal
        visible={isAIPicker}
        onClose={() => setPickerFor(null)}
        language={selectedAILang}
        onPickLanguage={pickAILang}
        pal={pal}
        themeColor={themeColor}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:   { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetOuter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetFill:  { flex: 1, justifyContent: 'flex-end' },
  sheetCard: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 6,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  buttonRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20 },
  btn:        { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnText:    { fontSize: 16, fontWeight: '700' },
  banner: {
    width: '100%',
    height: AD_BANNER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLabel: { fontSize: 11, letterSpacing: 0.5 },

  // ── Swap button ──────────────────────────────────────────────────────────────
  swapRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  swapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swapBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Field label row ──────────────────────────────────────────────────────────
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  audioBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  langChip: {
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langChipText: { fontSize: 11, fontWeight: '600' },
  audioRemoveBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Audio playback settings ──────────────────────────────────────────────────
  audioSettings: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    marginTop: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  audioSettingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  audioSettingsTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  audioSettingsBody: {
    marginTop: 10,
  },
  audioSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  audioSettingLabel: {
    fontSize: 11,
    fontWeight: '600',
    width: 44,
    letterSpacing: 0.2,
  },
  audioChipRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  audioChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  aiGroup: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  aiSegment: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSegmentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  aiDivider: {
    width: StyleSheet.hairlineWidth,
  },

  // ── Review History ───────────────────────────────────────────────────────────
  historySection: {
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  historyCount: { fontSize: 13 },
  historyList:  { marginTop: 10 },
  historyEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyDate:   { fontSize: 14 },
  historyRating: { fontSize: 14, fontWeight: '600' },
  historyEmpty:  { fontSize: 14, paddingVertical: 12, textAlign: 'center' },
  historyResetBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  historyResetText: { fontSize: 13, fontWeight: '500' },

  // ── Translation ──────────────────────────────────────────────────────────────
  transSection: {
    marginBottom: 14,
    gap: 6,
  },
  transResult: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  transText: {
    fontSize: 13,
    lineHeight: 19,
  },

  // ── TTS language picker (word / meaning) ────────────────────────────────────
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxHeight: Math.round(SCREEN_H * 0.65),
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  pickerFlag:  { fontSize: 22 },
  pickerLabel: { flex: 1, fontSize: 16 },

  // ── Keyboard toolbar ─────────────────────────────────────────────────────────
  kbToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  kbBtn: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    height: 36,
    shadowColor: '#000',
    shadowOpacity: 0.20,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  kbBtnText: { fontSize: 15, fontWeight: '700' },

  // Basic voice limit banner — same appearance as SettingsModal's hintBanner
  hintBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  hintTouch: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  hintText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
