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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '../types';
import {
  getAIVoiceLabel,
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
  onHistoryAvailabilityChange(hasHistory: boolean): void;
}

export function TextToSpeechScreen({
  visible, onClose, pal, themeColor, voice, isPremium, onHistoryAvailabilityChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [history, setHistory] = useState<SavedPrototypeSpeech[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
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
    setPlayingId(null);
  }, []);

  const close = useCallback(() => {
    requestController.current?.abort();
    requestController.current = null;
    setGenerating(false);
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
        if (!cancelled) Alert.alert('History unavailable', 'Saved audio history could not be loaded.');
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [onHistoryAvailabilityChange, visible]);

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
          'History unavailable',
          'Speech was generated, but it could not be added to saved audio history.',
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error instanceof Error ? error.message : '';
      const message = code === 'quota_exceeded'
        ? 'The API quota has been exceeded. Please try again later.'
        : code === 'api_key_missing'
          ? 'The OpenAI API key is not configured for this prototype.'
          : 'Speech could not be generated. Please check your connection and try again.';
      Alert.alert('Text-to-Speech unavailable', message);
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setGenerating(false);
      }
    }
  }, [generating, isPremium, onHistoryAvailabilityChange, stopAudio, text, voice]);

  const togglePlayback = useCallback(async (uri: string, id: string) => {
    if (playingId === id) {
      stopAudio();
      return;
    }

    const sequence = ++playbackSequence.current;
    setPlayingId(id);
    try {
      await playPrototypeSpeech(uri);
    } catch (error) {
      if (!(error instanceof Error && error.message === 'cancelled')) {
        Alert.alert('Playback unavailable', 'The generated audio could not be played.');
      }
    } finally {
      if (playbackSequence.current === sequence) setPlayingId(null);
    }
  }, [playingId, stopAudio]);

  const showInfo = useCallback(() => {
    Alert.alert(
      'Create natural speech',
      'Enter text, then generate and play natural AI audio. Text-to-Speech uses the Natural AI Voice selected in Settings.',
    );
  }, []);

  const openFilenameDialog = useCallback((action: FilenameAction) => {
    const filename = action.kind === 'export' ? action.filename : action.item.filename;
    setFilenameInput(filename);
    setFilenameSelection(action.kind === 'rename'
      ? { start: 0, end: filename.toLowerCase().endsWith('.wav') ? filename.length - 4 : filename.length }
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
        action.kind === 'export' ? 'Download unavailable' : 'Rename unavailable',
        action.kind === 'export'
          ? unavailable
            ? 'Audio export is not available on this device.'
            : 'The generated audio could not be exported. Please try again.'
          : 'The saved audio file could not be renamed. Please try again.',
      );
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, filenameAction, filenameInput, stopAudio]);

  const deleteHistoryItem = useCallback((item: SavedPrototypeSpeech) => {
    Alert.alert('Delete saved audio?', `Delete “${item.filename}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const key = `delete:${item.id}`;
          setBusyAction(key);
          if (playingId === `history:${item.id}`) stopAudio();
          void deletePrototypeSpeech(item.id)
            .then(next => {
              setHistory(next);
              onHistoryAvailabilityChange(next.length > 0);
            })
            .catch(() => Alert.alert('Delete unavailable', 'The saved audio file could not be deleted.'))
            .finally(() => setBusyAction(null));
        },
      },
    ]);
  }, [onHistoryAvailabilityChange, playingId, stopAudio]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <View
        style={[
          styles.screen,
          {
            backgroundColor: pal.bg,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: pal.border }]}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={close}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Close Text-to-Speech"
          >
            <Ionicons name="chevron-back" size={24} color={pal.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: pal.text }]}>Text-to-Speech</Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={showInfo}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="About Text-to-Speech"
          >
            <Ionicons name="information-circle-outline" size={23} color={pal.sub} />
          </TouchableOpacity>
        </View>

        {!isPremium && (
          <View style={[styles.premiumError, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <Ionicons name="alert-circle" size={19} color="#DC2626" />
            <Text style={styles.premiumErrorText}>
              Premium is required to generate new speech. You can still use your saved audio below.
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
              <Text style={[styles.sectionTitle, { color: pal.text }]}>Text</Text>
              <TextInput
                value={text}
                onChangeText={setText}
                editable={isPremium && !generating}
                multiline
                maxLength={TEXT_TO_SPEECH_MAX_CHARS}
                textAlignVertical="top"
                placeholder="Enter text to turn into speech"
                placeholderTextColor={pal.sub}
                style={[
                  styles.input,
                  { backgroundColor: pal.input, borderColor: pal.border, color: pal.text },
                  !isPremium && styles.lockedInput,
                ]}
              />
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
                {generating ? 'Generating…' : 'Generate Speech'}
              </Text>
            </TouchableOpacity>

            <View style={styles.historySection}>
              <View style={styles.historyHeadingRow}>
                <Text style={[styles.sectionTitle, styles.historyHeading, { color: pal.text }]}>Saved Audio</Text>
                <Text style={[styles.historyCount, { color: pal.sub }]}>
                  {history.length} / {TEXT_TO_SPEECH_HISTORY_LIMIT}
                </Text>
              </View>

              {historyLoading ? (
                <ActivityIndicator size="small" color={themeColor} style={styles.historyLoading} />
              ) : history.length === 0 ? (
                <View style={[styles.emptyHistory, { borderColor: pal.border }]}>
                  <Ionicons name="musical-notes-outline" size={22} color={pal.sub} />
                  <Text style={[styles.emptyHistoryText, { color: pal.sub }]}>Generated audio will be saved here.</Text>
                </View>
              ) : (
                <View style={styles.historyList}>
                  {history.map(item => {
                    const itemPlaying = playingId === `history:${item.id}`;
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
                            {getAIVoiceLabel(item.voice)} · {new Date(item.createdAt).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.historyActions}>
                          <TouchableOpacity
                            style={[styles.historyPlayButton, { backgroundColor: themeColor }]}
                            onPress={() => togglePlayback(item.uri, `history:${item.id}`)}
                            accessibilityLabel={itemPlaying ? `Stop ${item.filename}` : `Play ${item.filename}`}
                          >
                            <Ionicons name={itemPlaying ? 'stop' : 'play'} size={16} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.historyActionButton, { backgroundColor: pal.chip }]}
                            onPress={() => openFilenameDialog({ kind: 'rename', item })}
                            disabled={itemBusy}
                            accessibilityLabel={`Rename ${item.filename}`}
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
                            accessibilityLabel={`Download or share ${item.filename}`}
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
                            accessibilityLabel={`Delete ${item.filename}`}
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
                {filenameAction?.kind === 'rename' ? 'Rename Audio' : 'Download Audio'}
              </Text>
              <Text style={[styles.filenameDescription, { color: pal.sub }]}>Filename</Text>
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
              <View style={styles.filenameButtons}>
                <TouchableOpacity
                  style={[styles.filenameButton, { backgroundColor: pal.chip }]}
                  onPress={() => setFilenameAction(null)}
                  disabled={!!busyAction}
                >
                  <Text style={[styles.filenameButtonText, { color: pal.text }]}>Cancel</Text>
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
                    {filenameAction?.kind === 'rename' ? 'Save' : 'Download'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
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
