import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { isAIVoice, type AIVoice } from './aiVoices';
import { hasReachedAISpeechAudibleEnd, safeAudibleStartSeconds } from './audioTiming';
import {
  getAISpeechTiming,
  isAISpeechTimingDiagnostics,
  requestAISpeech,
  type AISpeechTimingDiagnostics,
} from './openaiGateway';
import { claimAudioFocus, releaseAudioFocus } from './audioFocus';
import { createId } from '../utils/createId';
import type { TTSPlaybackOptions } from './tts';
import type { TTSPlaybackPhase } from './ttsPlaybackState';

export const TEXT_TO_SPEECH_MAX_CHARS = 1000;
export const TEXT_TO_SPEECH_HISTORY_LIMIT = 10;

const HISTORY_KEY = '@wordping/text_to_speech_history';
const HISTORY_DIRECTORY = 'text-to-speech';

export interface SavedPrototypeSpeech {
  id: string;
  filename: string;
  uri: string;
  voice: AIVoice;
  createdAt: number;
  audioTiming?: AISpeechTimingDiagnostics;
}

function audioLib() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-audio') as typeof import('expo-audio');
}

type AudioPlayer = import('expo-audio').AudioPlayer;
type AudioStatus = import('expo-audio').AudioStatus;

let currentPlayer: AudioPlayer | null = null;
let stopActivePlayer: (() => void) | null = null;
let playbackEpoch = 0;
let activePlaybackUri: string | null = null;
let focusToken: symbol | null = null;
const timingByFileUri = new Map<string, AISpeechTimingDiagnostics>();

function dataUriToBytes(uri: string): Uint8Array {
  const separator = uri.indexOf(',');
  if (separator < 0) throw new Error('audio_data_invalid');

  const binary = atob(uri.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeFilename(value: string, fallbackExtension: 'wav' | 'mp3' = 'mp3'): string {
  const trimmed = value.trim();
  const matchedExtension = trimmed.match(/\.(wav|mp3)$/i)?.[1]?.toLowerCase() as 'wav' | 'mp3' | undefined;
  const extension = matchedExtension ?? fallbackExtension;
  const withoutExtension = trimmed.replace(/\.(wav|mp3)$/i, '');
  const safeBase = withoutExtension
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 80);
  return `${safeBase || 'WordCore Speech'}.${extension}`;
}

export function createPrototypeSpeechFilename(timestamp = Date.now(), extension: 'wav' | 'mp3' = 'mp3'): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return normalizeFilename(
    `WordCore Speech ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
    extension,
  );
}

function isSavedSpeech(value: unknown): value is SavedPrototypeSpeech {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.filename === 'string' && item.filename.length > 0 &&
    typeof item.uri === 'string' && item.uri.length > 0 &&
    isAIVoice(item.voice) &&
    typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) &&
    (item.audioTiming === undefined || isAISpeechTimingDiagnostics(item.audioTiming))
  );
}

async function writeHistory(items: SavedPrototypeSpeech[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

export async function loadPrototypeSpeechHistory(): Promise<SavedPrototypeSpeech[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await AsyncStorage.removeItem(HISTORY_KEY);
    return [];
  }

  if (!Array.isArray(parsed)) return [];
  const valid = parsed
    .filter(isSavedSpeech)
    .filter(item => new File(item.uri).exists)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, TEXT_TO_SPEECH_HISTORY_LIMIT);

  valid.forEach(item => {
    if (item.audioTiming) timingByFileUri.set(item.uri, item.audioTiming);
  });

  if (valid.length !== parsed.length) await writeHistory(valid);
  return valid;
}

export async function savePrototypeSpeechToHistory(
  uri: string,
  voice: AIVoice,
): Promise<{ item: SavedPrototypeSpeech; history: SavedPrototypeSpeech[] }> {
  const createdAt = Date.now();
  const id = createId('speech');
  const directory = new Directory(Paths.document, HISTORY_DIRECTORY);
  directory.create({ intermediates: true, idempotent: true });
  const isDataUri = uri.startsWith('data:');
  const format = isDataUri
    ? (uri.startsWith('data:audio/mpeg') ? 'mp3' : 'wav')
    : (uri.toLowerCase().endsWith('.wav') ? 'wav' : 'mp3');
  const file = new File(directory, `${id}.${format}`);

  file.create({ overwrite: true });
  try {
    if (isDataUri) {
      file.write(dataUriToBytes(uri));
    } else {
      new File(uri).copy(file);
    }
    const timing = timingByFileUri.get(uri);
    if (timing) timingByFileUri.set(file.uri, timing);
    const item: SavedPrototypeSpeech = {
      id,
      filename: createPrototypeSpeechFilename(createdAt, format),
      uri: file.uri,
      voice,
      createdAt,
      audioTiming: timing,
    };
    const existing = await loadPrototypeSpeechHistory();
    const next = [item, ...existing].slice(0, TEXT_TO_SPEECH_HISTORY_LIMIT);
    const removed = [item, ...existing].slice(TEXT_TO_SPEECH_HISTORY_LIMIT);
    await writeHistory(next);
    removed.forEach(oldItem => {
      timingByFileUri.delete(oldItem.uri);
      const oldFile = new File(oldItem.uri);
      if (oldFile.exists) {
        try { oldFile.delete(); } catch {}
      }
    });
    return { item, history: next };
  } catch (error) {
    if (file.exists) {
      try { file.delete(); } catch {}
    }
    throw error;
  }
}

export async function renamePrototypeSpeech(
  id: string,
  filename: string,
): Promise<SavedPrototypeSpeech[]> {
  const history = await loadPrototypeSpeechHistory();
  const next = history.map(item => item.id === id
    ? { ...item, filename: normalizeFilename(filename) }
    : item);
  await writeHistory(next);
  return next;
}

export async function deletePrototypeSpeech(id: string): Promise<SavedPrototypeSpeech[]> {
  const history = await loadPrototypeSpeechHistory();
  const removed = history.find(item => item.id === id);
  const next = history.filter(item => item.id !== id);
  await writeHistory(next);
  if (removed) {
    timingByFileUri.delete(removed.uri);
    const file = new File(removed.uri);
    if (file.exists) {
      try { file.delete(); } catch {}
    }
  }
  return next;
}

/** Generate trimmed standalone WAV audio, write it to a temp cache file, and return its URI. */
export async function generatePrototypeSpeech(
  input: string,
  voice: AIVoice,
  signal?: AbortSignal,
): Promise<string> {
  const buttonPressAtMs = performance.now();
  const trimmedInput = input.trim();
  if (!trimmedInput) throw new Error('input_empty');
  if (trimmedInput.length > TEXT_TO_SPEECH_MAX_CHARS) throw new Error('input_too_long');

  if (__DEV__) {
    console.log('[TTS playback stages]', {
      source: 'generated-speech',
      phase: 'generate-button-press',
      buttonPressMs: 0,
      textLength: trimmedInput.length,
      cacheSource: 'network',
      cacheLookupDurationMs: 0,
      loadingIndicatorDisplayed: true,
    });
  }

  const ab = await requestAISpeech(trimmedInput, voice, signal, 'wav', 'speech_custom');
  const downloadCompletedAtMs = performance.now();
  const timing = getAISpeechTiming(ab);
  const dir = new Directory(Paths.cache, 'tts-gen');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${createId('tts')}.wav`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(ab));
  if (timing) timingByFileUri.set(file.uri, timing);
  if (__DEV__) {
    console.log('[TTS playback stages]', {
      source: 'generated-speech',
      phase: 'audio-download-complete',
      sinceButtonPressMs: Math.round(downloadCompletedAtMs - buttonPressAtMs),
      networkGenerationDownloadDurationMs: Math.round(downloadCompletedAtMs - buttonPressAtMs),
      loadingIndicatorDisplayed: true,
      detectedAudibleStartMs: timing?.audibleStartMs,
      detectedAudibleEndMs: timing?.audibleEndMs,
    });
  }
  return file.uri;
}

/** Export generated speech through the device's native save/share sheet. */
export async function exportPrototypeSpeech(uri: string, filename: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');

  const file = new File(Paths.cache, normalizeFilename(filename));
  try {
    if (file.exists) file.delete();
    file.create({ overwrite: true });
    if (uri.startsWith('data:')) {
      file.write(dataUriToBytes(uri));
    } else {
      file.delete();
      new File(uri).copy(file);
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: file.uri.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
      dialogTitle: 'Save or share generated speech',
    });
  } finally {
    if (file.exists) {
      try { file.delete(); } catch {}
    }
  }
}

/** Stop only audio started by the standalone prototype screen. */
export function stopPrototypeSpeech(): void {
  playbackEpoch++;
  activePlaybackUri = null;
  const stop = stopActivePlayer;
  stopActivePlayer = null;
  if (stop) {
    stop();
  } else if (currentPlayer) {
    // remove() releases the JS/native object but does not stop native playback.
    try { currentPlayer.pause(); } catch {}
    try { currentPlayer.remove(); } catch {}
    currentPlayer = null;
  }
  releaseAudioFocus(focusToken);
  focusToken = null;
}

/** Play generated prototype audio with a player isolated from word-card TTS. */
export async function playPrototypeSpeech(
  uri: string,
  options: TTSPlaybackOptions = {},
): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();
  const buttonPressAtMs = options.buttonPressedAtMs ?? performance.now();
  let reportedPhase: TTSPlaybackPhase = 'idle';
  const reportPhase = (phase: TTSPlaybackPhase) => {
    if (reportedPhase === phase) return;
    reportedPhase = phase;
    options.onPhaseChange?.(phase);
  };
  if (activePlaybackUri === uri) {
    stopPrototypeSpeech();
    return;
  }

  stopPrototypeSpeech();
  const requestEpoch = ++playbackEpoch;
  activePlaybackUri = uri;
  focusToken = claimAudioFocus(stopPrototypeSpeech);
  reportPhase('checking-cache');

  if (__DEV__) {
    console.log('[TTS playback stages]', {
      source: 'saved-speech',
      phase: 'button-press',
      buttonPressMs: 0,
    });
  }

  try {
    const cacheLookupStartedAtMs = performance.now();
    const savedFile = new File(uri);
    if (!savedFile.exists) throw new Error('audio_file_missing');
    const cacheLookupDurationMs = Math.round(performance.now() - cacheLookupStartedAtMs);
    reportPhase('ready');
    if (__DEV__) console.log('[TTS playback stages]', {
      source: 'saved-speech',
      phase: 'cache-lookup-complete',
      cacheSource: 'saved-file',
      cacheLookupDurationMs,
      networkGenerationDownloadDurationMs: 0,
      loadingIndicatorDisplayed: false,
    });
    try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}
    if (requestEpoch !== playbackEpoch) throw new Error('cancelled');

    // The server has already removed the silent tail. A short status interval
    // now only minimizes native completion-event delivery latency.
    const player = createAudioPlayer({ uri }, { updateInterval: 50 });
    currentPlayer = player;
    const audioTiming = timingByFileUri.get(uri);
    const safeStartSeconds = safeAudibleStartSeconds(audioTiming);

    return await new Promise<void>((resolve, reject) => {
      let settled = false;
      let lastStatus: AudioStatus | null = null;
      let loggedStart = false;
      let loggedAudibleStart = false;
      let loggedFirstProgress = false;
      let reportedPlaying = false;
      let startInFlight = false;
      let playbackCommandAtMs: number | null = null;

      const finish = (
        error?: Error,
        stopNativePlayback = false,
        completionReason: 'audible-end' | 'native-end' | 'stopped' = 'native-end',
      ) => {
        if (settled) return;
        settled = true;
        subscription.remove();
        if (stopNativePlayback) {
          try { player.pause(); } catch {}
        }
        try { player.remove(); } catch {}
        if (currentPlayer === player) currentPlayer = null;
        if (stopActivePlayer === stop) stopActivePlayer = null;
        releaseAudioFocus(focusToken);
        focusToken = null;
        reportPhase('idle');
        if (__DEV__ && !error && lastStatus) {
          console.log('[TTS playback timing]', {
            source: 'saved-speech',
            phase: 'complete',
            completionReason,
            detectedAudibleStartMs: audioTiming?.audibleStartMs,
            playbackPositionMs: Math.round(lastStatus.currentTime * 1000),
            reportedDurationMs: Math.round(lastStatus.duration * 1000),
            detectedAudibleEndMs: audioTiming?.audibleEndMs ?? Math.round(lastStatus.duration * 1000),
            beforeTrim: audioTiming ? {
              durationMs: audioTiming.originalDurationMs,
              detectedAudibleStartMs: audioTiming.originalAudibleStartMs,
              detectedAudibleEndMs: audioTiming.originalAudibleEndMs,
            } : undefined,
            afterTrim: audioTiming ? {
              durationMs: audioTiming.durationMs,
              detectedAudibleStartMs: audioTiming.audibleStartMs,
              detectedAudibleEndMs: audioTiming.audibleEndMs,
            } : undefined,
          });
        }
        error ? reject(error) : resolve();
      };

      const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        lastStatus = status;
        if (status.isLoaded && playbackCommandAtMs == null) void startPlayer();
        if (status.playing && !reportedPlaying) {
          reportedPlaying = true;
          reportPhase('playing');
        }
        if (__DEV__ && !loggedFirstProgress && playbackCommandAtMs != null && status.currentTime > 0) {
          loggedFirstProgress = true;
          console.log('[TTS playback stages]', {
            source: 'saved-speech', phase: 'first-playback-progress', cacheSource: 'saved-file',
            sinceButtonPressMs: Math.round(performance.now() - buttonPressAtMs),
            sincePlayCommandMs: Math.round(performance.now() - playbackCommandAtMs),
            playbackPositionMs: Math.round(status.currentTime * 1000),
            expectedAudibleStartMs: audioTiming?.audibleStartMs,
          });
        }
        if (__DEV__ && !loggedStart && status.duration > 0) {
          loggedStart = true;
          console.log('[TTS playback timing]', {
            source: 'saved-speech',
            phase: 'start',
            detectedAudibleStartMs: audioTiming?.audibleStartMs,
            safePlaybackStartMs: Math.round(safeStartSeconds * 1000),
            playbackPositionMs: Math.round(status.currentTime * 1000),
            reportedDurationMs: Math.round(status.duration * 1000),
            detectedAudibleEndMs: audioTiming?.audibleEndMs ?? Math.round(status.duration * 1000),
            beforeTrim: audioTiming ? {
              durationMs: audioTiming.originalDurationMs,
              detectedAudibleStartMs: audioTiming.originalAudibleStartMs,
              detectedAudibleEndMs: audioTiming.originalAudibleEndMs,
            } : undefined,
            afterTrim: audioTiming ? {
              durationMs: audioTiming.durationMs,
              detectedAudibleStartMs: audioTiming.audibleStartMs,
              detectedAudibleEndMs: audioTiming.audibleEndMs,
            } : undefined,
          });
        }
        if (
          __DEV__ &&
          !loggedAudibleStart &&
          playbackCommandAtMs != null &&
          audioTiming?.audibleStartMs != null &&
          status.currentTime * 1000 >= audioTiming.audibleStartMs
        ) {
          loggedAudibleStart = true;
          const now = performance.now();
          console.log('[TTS playback stages]', {
            source: 'saved-speech',
            phase: 'audible-start-observed',
            actualAudibleStartSinceButtonMs: Math.round(now - buttonPressAtMs),
            actualAudibleStartSincePlayCommandMs: Math.round(now - playbackCommandAtMs),
            playbackPositionMs: Math.round(status.currentTime * 1000),
            detectedAudibleStartMs: audioTiming.audibleStartMs,
          });
        }
        if (hasReachedAISpeechAudibleEnd(status.currentTime, audioTiming)) {
          // Resolve from the clip's waveform-derived audible end rather than
          // waiting through its silent encoded tail.
          finish(undefined, true, 'audible-end');
        } else if (status.didJustFinish) {
          finish(undefined, false, 'native-end');
        }
      });
      const stop = () => finish(new Error('cancelled'), true, 'stopped');
      stopActivePlayer = stop;

      const startPlayer = async () => {
        if (settled || startInFlight || playbackCommandAtMs != null) return;
        startInFlight = true;
        const playerReadyAtMs = performance.now();
        try {
          const seekStartedAtMs = performance.now();
          if (safeStartSeconds > 0) {
            await player.seekTo(safeStartSeconds, 0, 0);
          }
          const seekCompletedAtMs = performance.now();
          if (settled || requestEpoch !== playbackEpoch) return;
          playbackCommandAtMs = performance.now();
          player.play();
          if (__DEV__) {
            console.log('[TTS playback stages]', {
              source: 'saved-speech',
              phase: 'playback-command',
              cacheSource: 'saved-file',
              playerReadySinceButtonMs: Math.round(playerReadyAtMs - buttonPressAtMs),
              playerCreationAndLoadMs: Math.round(playerReadyAtMs - buttonPressAtMs),
              seekDurationMs: Math.round(seekCompletedAtMs - seekStartedAtMs),
              seekCompletedSinceButtonMs: Math.round(seekCompletedAtMs - buttonPressAtMs),
              playbackCommandSinceButtonMs: Math.round(playbackCommandAtMs - buttonPressAtMs),
              detectedAudibleStartMs: audioTiming?.audibleStartMs,
              safePlaybackStartMs: Math.round(safeStartSeconds * 1000),
              detectedAudibleEndMs: audioTiming?.audibleEndMs,
            });
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        } finally {
          startInFlight = false;
        }
      };

      if (player.currentStatus.isLoaded) void startPlayer();
    });
  } catch (error) {
    reportPhase('failed');
    if (__DEV__) console.warn('[TTS playback diagnostic]', {
      source: 'saved-speech',
      phase: error instanceof Error && error.message === 'cancelled' ? 'cancelled' : 'failed',
      cacheSource: 'saved-file',
      loadingIndicatorDisplayed: false,
      networkGenerationDownloadDurationMs: 0,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  } finally {
    reportPhase('idle');
    if (requestEpoch === playbackEpoch && activePlaybackUri === uri) activePlaybackUri = null;
  }
}
