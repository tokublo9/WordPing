import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { isAIVoice, type AIVoice } from './aiVoices';

export const TEXT_TO_SPEECH_MAX_CHARS = 4096;
export const TEXT_TO_SPEECH_HISTORY_LIMIT = 10;

const HISTORY_KEY = '@wordping/text_to_speech_history';
const HISTORY_DIRECTORY = 'text-to-speech';

export interface SavedPrototypeSpeech {
  id: string;
  filename: string;
  uri: string;
  voice: AIVoice;
  createdAt: number;
}

function audioLib() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-audio') as typeof import('expo-audio');
}

type AudioPlayer = import('expo-audio').AudioPlayer;

let currentPlayer: AudioPlayer | null = null;
let pendingPlaybackReject: ((error: Error) => void) | null = null;
let playbackEpoch = 0;
let activePlaybackUri: string | null = null;

async function toBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index++) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

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

function normalizeFilename(value: string): string {
  const withoutExtension = value.trim().replace(/\.wav$/i, '');
  const safeBase = withoutExtension
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 80);
  return `${safeBase || 'WordPing Speech'}.wav`;
}

export function createPrototypeSpeechFilename(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return normalizeFilename(
    `WordPing Speech ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
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
    typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
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

  if (valid.length !== parsed.length) await writeHistory(valid);
  return valid;
}

export async function savePrototypeSpeechToHistory(
  uri: string,
  voice: AIVoice,
): Promise<{ item: SavedPrototypeSpeech; history: SavedPrototypeSpeech[] }> {
  const createdAt = Date.now();
  const id = `${createdAt}-${Math.random().toString(36).slice(2, 9)}`;
  const directory = new Directory(Paths.document, HISTORY_DIRECTORY);
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${id}.wav`);

  file.create({ overwrite: true });
  try {
    file.write(dataUriToBytes(uri));
    const item: SavedPrototypeSpeech = {
      id,
      filename: createPrototypeSpeechFilename(createdAt),
      uri: file.uri,
      voice,
      createdAt,
    };
    const existing = await loadPrototypeSpeechHistory();
    const next = [item, ...existing].slice(0, TEXT_TO_SPEECH_HISTORY_LIMIT);
    const removed = [item, ...existing].slice(TEXT_TO_SPEECH_HISTORY_LIMIT);
    await writeHistory(next);
    removed.forEach(oldItem => {
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
    const file = new File(removed.uri);
    if (file.exists) {
      try { file.delete(); } catch {}
    }
  }
  return next;
}

/** Generate a standalone WAV data URI without touching the word-card TTS cache. */
export async function generatePrototypeSpeech(
  input: string,
  voice: AIVoice,
  signal?: AbortSignal,
): Promise<string> {
  const trimmedInput = input.trim();
  if (!trimmedInput) throw new Error('input_empty');
  if (trimmedInput.length > TEXT_TO_SPEECH_MAX_CHARS) throw new Error('input_too_long');

  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) throw new Error('api_key_missing');

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: trimmedInput,
      voice,
      response_format: 'wav',
    }),
    signal,
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('quota_exceeded');
    throw new Error(`speech_generation_failed:${response.status}`);
  }

  const base64 = await toBase64(await response.arrayBuffer());
  return `data:audio/wav;base64,${base64}`;
}

/** Export a generated WAV through the device's native save/share sheet. */
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
      mimeType: 'audio/wav',
      UTI: 'com.microsoft.waveform-audio',
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
  if (pendingPlaybackReject) {
    pendingPlaybackReject(new Error('cancelled'));
    pendingPlaybackReject = null;
  }
  if (currentPlayer) {
    // remove() releases the JS/native object but does not stop native playback.
    try { currentPlayer.pause(); } catch {}
    try { currentPlayer.remove(); } catch {}
    currentPlayer = null;
  }
}

/** Play generated prototype audio with a player isolated from word-card TTS. */
export async function playPrototypeSpeech(uri: string): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();
  if (activePlaybackUri === uri) {
    stopPrototypeSpeech();
    return;
  }

  stopPrototypeSpeech();
  const requestEpoch = ++playbackEpoch;
  activePlaybackUri = uri;

  try {
    try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}
    if (requestEpoch !== playbackEpoch) throw new Error('cancelled');

    const player = createAudioPlayer({ uri });
    currentPlayer = player;

    return await new Promise<void>((resolve, reject) => {
      pendingPlaybackReject = reject;

      const finish = (error?: Error) => {
        subscription.remove();
        try { player.remove(); } catch {}
        if (currentPlayer === player) currentPlayer = null;
        if (pendingPlaybackReject === reject) pendingPlaybackReject = null;
        error ? reject(error) : resolve();
      };

      const subscription = player.addListener('playbackStatusUpdate', (status: any) => {
        if (status.didJustFinish) finish();
        else if (status.error) finish(new Error(`playback_failed:${status.error}`));
      });

      try {
        player.play();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  } finally {
    if (requestEpoch === playbackEpoch && activePlaybackUri === uri) activePlaybackUri = null;
  }
}
