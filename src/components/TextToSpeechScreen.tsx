import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PostHogMaskView } from 'posthog-react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Palette } from '../types';
import { useLang } from '../i18n';
import {
  getAIVoiceNameKey,
  type AIVoice,
} from '../lib/aiVoices';
import {
  deletePrototypeSpeech,
  exportPrototypeSpeech,
  generatePrototypeSpeech,
  loadPrototypeSpeechHistory,
  playPrototypeSpeech,
  renamePrototypeSpeech,
  savePrototypeSpeechToHistory,
  stopPrototypeSpeech,
  TEXT_TO_SPEECH_HISTORY_LIMIT,
  TEXT_TO_SPEECH_MAX_CHARS,
  type SavedPrototypeSpeech,
} from '../lib/prototypeTextToSpeech';
import { isTTSNetworkLoading } from '../lib/ttsPlaybackState';
import { ensureAIConsentForUserAction } from '../lib/aiConsentPrompt';
import { AIConsentDialog } from './AIConsentDialog';
import {
  FULL_SCREEN_SHEET_HEADER,
  FULL_SCREEN_SHEET_HEADER_ACTION,
  FullScreenSheet,
} from './FullScreenSheet';

type FilenameAction =
  | { kind: 'export'; uri: string; filename: string; busyKey: string }
  | { kind: 'rename'; item: SavedPrototypeSpeech };

interface Props {
  visible: boolean;
  onClose(): void;
  pal: Palette;
  themeColor: string;
  voice: AIVoice;
  isPremium: boolean;
  onUpgrade(): void;
  onHistoryAvailabilityChange(hasHistory: boolean): void;
}

export function TextToSpeechScreen({
  visible, onClose, pal, themeColor, voice, isPremium, onUpgrade, onHistoryAvailabilityChange,
}: Props) {
  const t = useLang();
  const [text, setText] = useState('');
  const [history, setHistory] = useState<SavedPrototypeSpeech[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activePlaybackId, setActivePlaybackId] = useState<string | null>(null);
  const [loadingPlaybackId, setLoadingPlaybackId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [filenameAction, setFilenameAction] = useState<FilenameAction | null>(null);
  const [filenameInput, setFilenameInput] = useState('');
  const [filenameSelection, setFilenameSelection] = useState<{ start: number; end: number }>();
  const requestController = useRef<AbortController | null>(null);
  const playbackSequence = useRef(0);

  const stopAudio = useCallback(() => {
    playbackSequence.current++;
    stopPrototypeSpeech();
    setActivePlaybackId(null);
    setLoadingPlaybackId(null);
    setPlayingId(null);
  }, []);

  const close = useCallback(() => {
    requestController.current?.abort();
    requestController.current = null;
    setGenerating(false);
    setActivePlaybackId(null);
    setBusyAction(null);
    setFilenameAction(null);
    stopAudio();
    onClose();
  }, [onClose, stopAudio]);

  useEffect(() => {
    if (visible) return;
    requestController.current?.abort();
    requestController.current = null;
    stopPrototypeSpeech();
    setGenerating(false);
    setLoadingPlaybackId(null);
    setPlayingId(null);
    setBusyAction(null);
    setFilenameAction(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setHistoryLoading(true);
    loadPrototypeSpeechHistory()
      .then(items => {
        if (!cancelled) {
          setHistory(items);
          onHistoryAvailabilityChange(items.length > 0);
        }
      })
      .catch(() => {
        if (!cancelled) Alert.alert(t('tts_history_unavailable_title'), t('tts_history_load_failed'));
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [onHistoryAvailabilityChange, t, visible]);

  useEffect(() => {
    if (isPremium) return;
    requestController.current?.abort();
    requestController.current = null;
    setGenerating(false);
  }, [isPremium]);

  useEffect(() => () => {
    requestController.current?.abort();
    stopPrototypeSpeech();
  }, []);

  const generate = useCallback(async () => {
    const input = text.trim();
    if (!isPremium || !input || generating) return;
    // The text typed here is submitted to OpenAI for generation, so it needs
    // the same permission as every other AI feature.
    if (!await ensureAIConsentForUserAction()) return;

    requestController.current?.abort();
    stopAudio();
    setGenerating(true);
    const controller = new AbortController();
    requestController.current = controller;

    try {
      const uri = await generatePrototypeSpeech(input, voice, controller.signal);
      if (controller.signal.aborted) return;
      setText('');

      try {
        const saved = await savePrototypeSpeechToHistory(uri, voice);
        if (controller.signal.aborted) return;
        setHistory(saved.history);
        onHistoryAvailabilityChange(saved.history.length > 0);
      } catch {
        if (controller.signal.aborted) return;
        Alert.alert(
          t('tts_history_unavailable_title'),
          t('tts_history_save_failed'),
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error instanceof Error ? error.message : '';
      if (code === 'premium_required' || code === 'plan_required') {
        Alert.alert(
          t('tts_premium_title'),
          t('tts_premium_body'),
          [
            { text: t('cancel'), style: 'cancel' },
            { text: t('tts_view_plans'), onPress: onUpgrade },
          ],
        );
        return;
      }
      const message = code === 'rate_limit_exceeded'
        ? t('tts_err_rate_limit')
        : code === 'usage_limit_exceeded'
        ? t('tts_err_usage_limit')
        : code === 'input_too_long'
        ? t('tts_err_input_too_long').replace('{n}', TEXT_TO_SPEECH_MAX_CHARS.toLocaleString())
        : code === 'quota_exceeded'
        ? t('tts_err_quota')
        : code === 'service_unavailable' || code === 'authentication_failed'
          ? t('tts_err_unavailable')
          : t('tts_err_generic');
      Alert.alert(t('tts_error_title'), message);
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setGenerating(false);
      }
    }
  }, [generating, isPremium, onHistoryAvailabilityChange, onUpgrade, stopAudio, t, text, voice]);

  const togglePlayback = useCallback(async (uri: string, id: string) => {
    if (activePlaybackId === id) {
      stopAudio();
      return;
    }

    const sequence = ++playbackSequence.current;
    setActivePlaybackId(id);
    try {
      await playPrototypeSpeech(uri, {
        onPhaseChange: phase => {
          if (playbackSequence.current !== sequence) return;
          setActivePlaybackId(phase === 'idle' || phase === 'failed' ? null : id);
          setLoadingPlaybackId(isTTSNetworkLoading(phase) ? id : null);
          setPlayingId(phase === 'playing' ? id : null);
        },
      });
    } catch (error) {
      if (!(error instanceof Error && error.message === 'cancelled')) {
        Alert.alert(t('tts_playback_error_title'), t('tts_playback_error_body'));
      }
    } finally {
      if (playbackSequence.current === sequence) {
        setActivePlaybackId(null);
        setLoadingPlaybackId(null);
        setPlayingId(null);
      }
    }
  }, [activePlaybackId, stopAudio, t]);

  const showInfo = useCallback(() => {
    Alert.alert(
      t('tts_info_title'),
      t('tts_info_body'),
    );
  }, [t]);

  const openFilenameDialog = useCallback((action: FilenameAction) => {
    const filename = action.kind === 'export' ? action.filename : action.item.filename;
    setFilenameInput(filename);
    setFilenameSelection(action.kind === 'rename'
      ? { start: 0, end: /\.(wav|mp3)$/i.test(filename) ? filename.length - 4 : filename.length }
      : undefined);
    setFilenameAction(action);
  }, []);

  const confirmFilename = useCallback(async () => {
    if (!filenameAction || !filenameInput.trim() || busyAction) return;
    const action = filenameAction;
    const key = action.kind === 'export' ? action.busyKey : `rename:${action.item.id}`;
    stopAudio();
    setBusyAction(key);
    try {
      if (action.kind === 'export') {
        await exportPrototypeSpeech(action.uri, filenameInput);
      } else {
        const next = await renamePrototypeSpeech(action.item.id, filenameInput);
        setHistory(next);
      }
      setFilenameAction(null);
    } catch (error) {
      const unavailable = error instanceof Error && error.message === 'sharing_unavailable';
      Alert.alert(
        action.kind === 'export' ? t('tts_download_error_title') : t('tts_rename_error_title'),
        action.kind === 'export'
          ? unavailable
            ? t('tts_export_unsupported')
            : t('tts_export_failed')
          : t('tts_rename_failed'),
      );
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, filenameAction, filenameInput, stopAudio, t]);

  const deleteHistoryItem = useCallback((item: SavedPrototypeSpeech) => {
    // The filename is the user's, and a native alert is an OS view Session
    // Replay captures but no React wrapper can mask — so it is not interpolated
    // here. The row the user tapped is still on screen behind the alert, so
    // which recording this is about stays obvious.
    Alert.alert(t('tts_delete_title'), t('tts_delete_body'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          const key = `delete:${item.id}`;
          setBusyAction(key);
          if (
            activePlaybackId === `history:${item.id}`
          ) stopAudio();
          void deletePrototypeSpeech(item.id)
            .then(next => {
              setHistory(next);
              onHistoryAvailabilityChange(next.length > 0);
            })
            .catch(() => Alert.alert(t('tts_delete_error_title'), t('tts_delete_error_body')))
            .finally(() => setBusyAction(null));
        },
      },
    ]);
  }, [activePlaybackId, onHistoryAvailabilityChange, stopAudio, t]);

  return (
    <FullScreenSheet
      visible={visible}
      pal={pal}
      onRequestClose={close}
    >
      <View style={styles.screen}>
        <View style={[styles.header, { borderBottomColor: pal.border }]}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={close}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('tts_close')}
          >
            <Ionicons name="chevron-back" size={24} color={pal.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: pal.text }]}>{t('tts_title')}</Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={showInfo}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('tts_about')}
          >
            <Ionicons name="information-circle-outline" size={23} color={pal.sub} />
          </TouchableOpacity>
        </View>

        {!isPremium && (
          <View style={[styles.premiumError, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <Ionicons name="alert-circle" size={19} color="#DC2626" />
            <Text style={styles.premiumErrorText}>
              {t('tts_premium_required_banner')}
            </Text>
          </View>
        )}

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View>
              <Text style={[styles.sectionTitle, { color: pal.text }]}>{t('tts_text_section')}</Text>
              {/* Arbitrary text the user types to be spoken. */}
              <PostHogMaskView>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  editable={isPremium && !generating}
                  multiline
                  maxLength={TEXT_TO_SPEECH_MAX_CHARS}
                  textAlignVertical="top"
                  placeholder={t('tts_input_placeholder')}
                  placeholderTextColor={pal.sub}
                  style={[
                    styles.input,
                    { backgroundColor: pal.input, borderColor: pal.border, color: pal.text },
                    !isPremium && styles.lockedInput,
                  ]}
                />
              </PostHogMaskView>
              <Text style={[styles.characterCount, { color: pal.sub }]}>
                {text.length.toLocaleString()} / {TEXT_TO_SPEECH_MAX_CHARS.toLocaleString()}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.generateButton,
                { backgroundColor: themeColor },
                (!isPremium || !text.trim() || generating) && styles.disabled,
              ]}
              onPress={generate}
              disabled={!isPremium || !text.trim() || generating}
              activeOpacity={0.82}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="waveform" size={20} color="#fff" />
              )}
              <Text style={styles.generateButtonText}>
                {generating ? t('tts_generating') : t('tts_generate')}
              </Text>
            </TouchableOpacity>

            <View style={styles.historySection}>
              <View style={styles.historyHeadingRow}>
                <Text style={[styles.sectionTitle, styles.historyHeading, { color: pal.text }]}>{t('tts_saved_audio')}</Text>
                <Text style={[styles.historyCount, { color: pal.sub }]}>
                  {history.length} / {TEXT_TO_SPEECH_HISTORY_LIMIT}
                </Text>
              </View>

              {historyLoading ? (
                <ActivityIndicator size="small" color={themeColor} style={styles.historyLoading} />
              ) : history.length === 0 ? (
                <View style={[styles.emptyHistory, { borderColor: pal.border }]}>
                  <Ionicons name="musical-notes-outline" size={22} color={pal.sub} />
                  <Text style={[styles.emptyHistoryText, { color: pal.sub }]}>{t('tts_history_empty')}</Text>
                </View>
              ) : (
                <View style={styles.historyList}>
                  {history.map(item => {
                    const itemPlaybackId = `history:${item.id}`;
                    const itemLoading = loadingPlaybackId === itemPlaybackId;
                    const itemPlaying = playingId === itemPlaybackId;
                    const itemBusy = busyAction?.endsWith(`:${item.id}`) ?? false;
                    return (
                      <View
                        key={item.id}
                        style={[styles.historyCard, { backgroundColor: pal.card, borderColor: pal.border }]}
                      >
                        <View style={styles.historyInfo}>
                          <Text style={[styles.historyFilename, { color: pal.text }]} numberOfLines={1}>
                            {item.filename}
                          </Text>
                          <Text style={[styles.historyMeta, { color: pal.sub }]}>
                            {t(getAIVoiceNameKey(item.voice))} · {new Date(item.createdAt).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.historyActions}>
                          <TouchableOpacity
                            style={[styles.historyPlayButton, { backgroundColor: themeColor }]}
                            onPress={() => togglePlayback(item.uri, `history:${item.id}`)}
                            accessibilityLabel={itemLoading
                              ? t('audio_loading')
                              : t(itemPlaying ? 'tts_a11y_stop' : 'tts_a11y_play')
                                  .replace('{name}', item.filename)}
                            accessibilityState={{ busy: itemLoading }}
                          >
                            {itemLoading
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <Ionicons name={itemPlaying ? 'stop' : 'play'} size={16} color="#fff" />}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.historyActionButton, { backgroundColor: pal.chip }]}
                            onPress={() => openFilenameDialog({ kind: 'rename', item })}
                            disabled={itemBusy}
                            accessibilityLabel={t('tts_a11y_rename').replace('{name}', item.filename)}
                          >
                            <Ionicons name="create-outline" size={17} color={pal.sub} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.historyActionButton, { backgroundColor: pal.chip }]}
                            onPress={() => openFilenameDialog({
                              kind: 'export',
                              uri: item.uri,
                              filename: item.filename,
                              busyKey: `export:${item.id}`,
                            })}
                            disabled={itemBusy}
                            accessibilityLabel={t('tts_a11y_share').replace('{name}', item.filename)}
                          >
                            {busyAction === `export:${item.id}`
                              ? <ActivityIndicator size="small" color={pal.sub} />
                              : <Ionicons name="share-outline" size={17} color={pal.sub} />
                            }
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.historyActionButton, { backgroundColor: pal.chip }]}
                            onPress={() => deleteHistoryItem(item)}
                            disabled={itemBusy}
                            accessibilityLabel={t('tts_a11y_delete').replace('{name}', item.filename)}
                          >
                            {busyAction === `delete:${item.id}`
                              ? <ActivityIndicator size="small" color="#E05C5C" />
                              : <Ionicons name="trash-outline" size={17} color="#E05C5C" />
                            }
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <Modal
          visible={filenameAction !== null}
          transparent
          animationType="fade"
          onRequestClose={() => { if (!busyAction) setFilenameAction(null); }}
        >
          <KeyboardAvoidingView
            style={styles.filenameOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.filenameDialog, { backgroundColor: pal.dialog }]}>
              <Text style={[styles.filenameTitle, { color: pal.text }]}>
                {filenameAction?.kind === 'rename' ? t('tts_rename_title') : t('tts_download_title')}
              </Text>
              <Text style={[styles.filenameDescription, { color: pal.sub }]}>{t('tts_filename_label')}</Text>
              {/* A filename the user chose. */}
              <PostHogMaskView>
                <TextInput
                  value={filenameInput}
                  onChangeText={setFilenameInput}
                  autoFocus
                  selectTextOnFocus={filenameAction?.kind === 'export'}
                  selection={filenameAction?.kind === 'rename' ? filenameSelection : undefined}
                  onSelectionChange={event => {
                    if (filenameAction?.kind === 'rename') {
                      setFilenameSelection(event.nativeEvent.selection);
                    }
                  }}
                  editable={!busyAction}
                  returnKeyType="done"
                  onSubmitEditing={() => { void confirmFilename(); }}
                  style={[
                    styles.filenameInput,
                    { backgroundColor: pal.input, borderColor: pal.border, color: pal.text },
                  ]}
                />
              </PostHogMaskView>
              <View style={styles.filenameButtons}>
                <TouchableOpacity
                  style={[styles.filenameButton, { backgroundColor: pal.chip }]}
                  onPress={() => setFilenameAction(null)}
                  disabled={!!busyAction}
                >
                  <Text style={[styles.filenameButtonText, { color: pal.text }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.filenameButton,
                    { backgroundColor: themeColor },
                    (!filenameInput.trim() || !!busyAction) && styles.disabled,
                  ]}
                  onPress={() => { void confirmFilename(); }}
                  disabled={!filenameInput.trim() || !!busyAction}
                >
                  {busyAction && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={[styles.filenameButtonText, { color: '#fff' }]}>
                    {filenameAction?.kind === 'rename' ? t('save') : t('tts_download')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* This screen is presented as its own modal, so it mounts its own
            consent host while it is on top. */}
        <AIConsentDialog active={visible} pal={pal} themeColor={themeColor} />
      </View>
    </FullScreenSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    ...FULL_SCREEN_SHEET_HEADER,
  },
  headerButton: { ...FULL_SCREEN_SHEET_HEADER_ACTION },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  premiumError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 12,
  },
  premiumErrorText: { flex: 1, color: '#B91C1C', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 24 },
  sectionTitle: { marginBottom: 10, fontSize: 15, fontWeight: '700' },
  input: {
    minHeight: 150,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderRadius: 14,
    fontSize: 16,
    lineHeight: 23,
  },
  lockedInput: { opacity: 0.5 },
  characterCount: { marginTop: 7, textAlign: 'right', fontSize: 12 },
  generateButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 14,
  },
  generateButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  historySection: { gap: 10 },
  historyHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyHeading: { marginBottom: 0 },
  historyCount: { fontSize: 12, fontWeight: '600' },
  historyLoading: { marginVertical: 24 },
  emptyHistory: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  emptyHistoryText: { fontSize: 13 },
  historyList: { gap: 10 },
  historyCard: {
    padding: 13,
    borderWidth: 1,
    borderRadius: 14,
    gap: 11,
  },
  historyInfo: { gap: 3 },
  historyFilename: { fontSize: 15, fontWeight: '700' },
  historyMeta: { fontSize: 12 },
  historyActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  historyPlayButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyActionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filenameOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  filenameDialog: { borderRadius: 20, padding: 20 },
  filenameTitle: { fontSize: 19, fontWeight: '700' },
  filenameDescription: { marginTop: 18, marginBottom: 7, fontSize: 13, fontWeight: '600' },
  filenameInput: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 15,
  },
  filenameButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  filenameButton: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
  },
  filenameButtonText: { fontSize: 15, fontWeight: '700' },
});
