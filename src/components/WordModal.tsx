import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  LayoutAnimation,
  Modal,
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
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system';
import { Audio } from 'expo-av';

import type { Palette, WordCard } from '../types';
import { useLang } from '../i18n';
import { generateBreakdown, generateExample, generateMeaning, translateText } from '../lib/generateMeaning';
import { appStyles as s } from '../styles';
import { AD_BANNER_HEIGHT, ADS_ENABLED } from './AdBannerPlaceholder';

const SCREEN_H = Dimensions.get('window').height;

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const VOLUME_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5];

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

// Languages for meaning generation (no "Auto" — a target language is always required)
const GEN_LANGUAGES = TTS_LANGUAGES.filter(l => l.code !== undefined) as { code: string; flag: string; label: string }[];

function genChipLabel(code: string): string {
  const entry = GEN_LANGUAGES.find(l => l.code === code) ?? GEN_LANGUAGES[0];
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
}

export function WordModal({
  visible, onClose, editingCard,
  word, onChangeWord, meaning, onChangeMeaning, note, onChangeNote,
  onSave, pal, themeColor,
  isSubscribed, wordLang, onChangeWordLang, meaningLang, onChangeMeaningLang,
  audioUri, onChangeAudioUri,
  audioSpeed, onChangeAudioSpeed,
  audioVolume, onChangeAudioVolume,
}: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();

  // which field's picker is open
  const [pickerFor, setPickerFor] = useState<'word' | 'meaning' | 'genLang' | 'exampleLang' | 'breakdownLang' | 'meaningTransLang' | 'noteTransLang' | null>(null);

  // meaning generation
  const [genLang, setGenLang]         = useState('ja-JP');
  const [isGenerating, setIsGenerating] = useState(false);

  // example sentence generation
  const [exampleLang, setExampleLang]         = useState('en-US');
  const [isGeneratingExample, setIsGeneratingExample] = useState(false);

  // word breakdown
  const [breakdownLang, setBreakdownLang]   = useState('ja-JP');
  const [isBreakingDown, setIsBreakingDown] = useState(false);

  // translation
  const [meaningTransLang, setMeaningTransLang]         = useState('ja-JP');
  const [meaningTranslation, setMeaningTranslation]     = useState('');
  const [meaningTransCollapsed, setMeaningTransCollapsed] = useState(false);
  const [isTranslatingMeaning, setIsTranslatingMeaning] = useState(false);
  const [noteTransLang, setNoteTransLang]               = useState('ja-JP');
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

  // ── Audio ────────────────────────────────────────────────────────────────────
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
        Alert.alert('Error', 'Could not import the audio file.');
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
      Alert.alert('Playback error', 'Could not play the audio file.');
      setIsPlayingAudio(false);
    }
  };

  const handleClearAudio = () => {
    Alert.alert('Remove audio', 'Remove the audio from this card?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          soundRef.current?.unloadAsync().catch(() => {});
          soundRef.current = null;
          setIsPlayingAudio(false);
          onChangeAudioUri(undefined);
        },
      },
    ]);
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

  useEffect(() => {
    if (visible) {
      slideY.setValue(SCREEN_H);
      backdropOpacity.setValue(0);
      setMeaningTranslation('');
      setMeaningTransCollapsed(false);
      setNoteTranslation('');
      setNoteTransCollapsed(false);
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

  const selectedLang = pickerFor === 'word' ? wordLang
    : pickerFor === 'meaning' ? meaningLang
    : pickerFor === 'exampleLang' ? exampleLang
    : pickerFor === 'breakdownLang' ? breakdownLang
    : pickerFor === 'meaningTransLang' ? meaningTransLang
    : pickerFor === 'noteTransLang' ? noteTransLang
    : genLang;
  const onPickLang = (code: string | undefined) => {
    if (pickerFor === 'word') onChangeWordLang(code);
    else if (pickerFor === 'meaning') onChangeMeaningLang(code);
    else if (pickerFor === 'genLang') setGenLang(code ?? 'en-US');
    else if (pickerFor === 'exampleLang') setExampleLang(code ?? 'en-US');
    else if (pickerFor === 'breakdownLang') setBreakdownLang(code ?? 'ja-JP');
    else if (pickerFor === 'meaningTransLang') { setMeaningTransLang(code ?? 'ja-JP'); setMeaningTranslation(''); }
    else if (pickerFor === 'noteTransLang') { setNoteTransLang(code ?? 'ja-JP'); setNoteTranslation(''); }
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
        ? 'Quota exceeded. Please try again later.'
        : 'Could not generate meaning. Please check your connection.';
      Alert.alert('Generation failed', msg);
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
        ? 'Quota exceeded. Please try again later.'
        : 'Could not generate example. Please check your connection.';
      Alert.alert('Generation failed', msg);
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
        ? 'Quota exceeded. Please try again later.'
        : 'Could not generate breakdown. Please check your connection.';
      Alert.alert('Generation failed', msg);
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
        ? 'Quota exceeded. Please try again later.'
        : 'Could not translate. Please check your connection.';
      Alert.alert('Translation failed', msg);
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
        ? 'Quota exceeded. Please try again later.'
        : 'Could not translate. Please check your connection.';
      Alert.alert('Translation failed', msg);
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
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
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
                {/* Drag handle */}
                <View style={styles.handleArea}>
                  <View style={[styles.handle, { backgroundColor: pal.border }]} />
                </View>

                {/* Header */}
                <View style={styles.headerRow}>
                  <Text style={[styles.headerTitle, { color: pal.text }]}>
                    {editingCard ? t('edit_word') : t('add_word')}
                  </Text>
                  <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
                  {isSubscribed && (
                    <TouchableOpacity
                      onPress={handleAudioButton}
                      onLongPress={audioUri ? handleClearAudio : undefined}
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
                  )}
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

                {/* Audio playback settings — visible only when an audio file is attached */}
                {isSubscribed && audioUri ? (
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
                    style={[styles.swapBtn, { borderColor: pal.border, backgroundColor: pal.chip }]}
                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  >
                    <Ionicons name="swap-vertical" size={14} color={pal.sub} />
                    <Text style={[styles.swapBtnText, { color: pal.sub }]}>{t('swap_fields')}</Text>
                  </TouchableOpacity>
                </View>

                {/* Meaning field */}
                <View style={[styles.fieldLabelRow, { marginTop: 8 }]}>
                  <Text style={[s.inputLabel, { color: pal.sub, marginBottom: 0 }]}>{t('meaning_label')}</Text>
                  {isSubscribed && (
                    <View style={[styles.aiGroup, { borderColor: themeColor + '40', opacity: word.trim() ? 1 : 0.35 }]}>
                      <TouchableOpacity
                        onPress={handleGenerate}
                        disabled={!word.trim() || isGenerating}
                        activeOpacity={0.5}
                        style={[styles.aiSegment, { backgroundColor: themeColor + '18' }]}
                      >
                        {isGenerating
                          ? <ActivityIndicator size="small" color={themeColor} />
                          : <Text style={[styles.aiSegmentText, { color: themeColor }]}>AI Meaning</Text>
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
                <View>
                  <TextInput
                    style={[s.input, s.inputMultiline, { borderColor: pal.border, backgroundColor: pal.input, color: pal.text, minHeight: 96, marginBottom: isSubscribed && meaning.trim() ? 4 : 18 }]}
                    value={meaning}
                    onChangeText={onChangeMeaning}
                    multiline
                    scrollEnabled={false}
                  />
                </View>
                {isSubscribed && meaning.trim() ? (
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
                  {isSubscribed && (
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
                            : <Text style={[styles.aiSegmentText, { color: themeColor }]}>AI Example</Text>
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
                    style={[s.input, s.inputMultiline, { borderColor: pal.border, backgroundColor: pal.input, color: pal.text, minHeight: 96, marginBottom: isSubscribed && note.trim() ? 4 : 18 }]}
                    value={note}
                    onChangeText={onChangeNote}
                    multiline
                    scrollEnabled={false}
                  />
                </View>
                {isSubscribed && note.trim() ? (
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

      {/* Language picker sheet */}
      {pickerFor !== null && (
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
              {(pickerFor === 'genLang' || pickerFor === 'exampleLang' || pickerFor === 'breakdownLang' || pickerFor === 'meaningTransLang' || pickerFor === 'noteTransLang' ? GEN_LANGUAGES : TTS_LANGUAGES).map(lang => {
                const selected = lang.code === selectedLang;
                return (
                  <TouchableOpacity
                    key={lang.code ?? '__auto__'}
                    style={[styles.pickerRow, selected && { backgroundColor: themeColor + '18' }]}
                    onPress={() => onPickLang(lang.code)}
                  >
                    <Text style={styles.pickerFlag}>{lang.flag}</Text>
                    <Text style={[styles.pickerLabel, { color: pal.text }]}>{lang.label}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={themeColor} />}
                  </TouchableOpacity>
                );
              })}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
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

  // ── Language picker ──────────────────────────────────────────────────────────
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
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
});
