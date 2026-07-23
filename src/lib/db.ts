import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appearance, Folder, WordCard } from '../types';
import {
  APPEARANCE_KEY, CARDS_KEY,
  AI_VOICE_KEY,
  DEFAULT_LANGUAGE, DEFAULT_THEME,
  FOLDERS_KEY, LANGUAGE_KEY, SKIN_KEY, THEME_KEY,
} from '../constants';
import { DEFAULT_AI_VOICE, isAIVoice, type AIVoice } from './aiVoices';
import { requireSupabaseSession, supabase } from './supabase';
import { reportSideEffectFailure } from '../utils/reportSideEffectFailure';

const SEEDED_KEY = 'wordping_seeded';

export const DEFAULT_FOLDER_ID  = 'default';  // kept for migration of existing users
export const WELCOME_FOLDER_ID  = 'wp-welcome';

// Shown on a genuine first install. Supabase data replaces these in the background.
const DEFAULT_FOLDERS: Folder[] = [
  { id: WELCOME_FOLDER_ID, name: 'Welcome', createdAt: 1 },
];

// English placeholders — replaced with localized content when onboarding completes.
const DEFAULT_CARDS: WordCard[] = [
  { id: 'wp-w1', word: 'Tap the card to reveal its meaning.',                               meaning: 'Tap the card to reveal its meaning.',                               note: '', wordLang: 'en-US', folderId: WELCOME_FOLDER_ID },
  { id: 'wp-w2', word: 'Switch between List Mode and Flip Mode using the top-right button.', meaning: 'Switch between List Mode and Flip Mode using the top-right button.', note: '', wordLang: 'en-US', folderId: WELCOME_FOLDER_ID },
  { id: 'wp-w3', word: 'Tap the graduation cap icon to test yourself.',                      meaning: 'Tap the graduation cap icon to test yourself.',                      note: '', wordLang: 'en-US', folderId: WELCOME_FOLDER_ID },
  { id: 'wp-w4', word: 'Set up notifications to review your words automatically.',           meaning: 'Set up notifications to review your words automatically.',           note: '', wordLang: 'en-US', folderId: WELCOME_FOLDER_ID },
];

export interface Settings {
  themeColor: string;
  appearance: Appearance;
  skinId: string | null;
  language: string;
  aiVoice: AIVoice;
}

export interface AppData {
  cards: WordCard[];
  settings: Settings;
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

// Wraps JSON.parse so a syntax error never throws past this boundary.
// Returns null on failure; the caller decides the fallback.
function safeParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (e) {
    if (__DEV__) console.warn('[db] JSON parse failed:', (e as Error).message);
    return null;
  }
}

function parseCard(x: unknown): WordCard | null {
  if (!x || typeof x !== 'object') return null;
  const c = x as Record<string, unknown>;
  if (typeof c.id !== 'string' || !c.id || typeof c.word !== 'string' || typeof c.meaning !== 'string') {
    return null;
  }

  const card: WordCard = {
    id: c.id,
    word: c.word,
    meaning: c.meaning,
    note: typeof c.note === 'string' ? c.note : '',
  };
  if (typeof c.notifOff === 'boolean') card.notifOff = c.notifOff;
  if (typeof c.folderId === 'string') card.folderId = c.folderId;
  if (typeof c.testMastered === 'boolean') card.testMastered = c.testMastered;
  if (typeof c.testNextReview === 'number' && Number.isFinite(c.testNextReview)) card.testNextReview = c.testNextReview;
  if (c.testLevel === 'perfect' || c.testLevel === 'good' || c.testLevel === 'slightly' || c.testLevel === 'unknown') {
    card.testLevel = c.testLevel;
  }
  if (Array.isArray(c.reviewHistory)) {
    card.reviewHistory = c.reviewHistory.flatMap(entry => {
      if (!entry || typeof entry !== 'object') return [];
      const review = entry as Record<string, unknown>;
      const rating = review.rating;
      if (typeof review.ts !== 'number' || !Number.isFinite(review.ts)) return [];
      if (rating !== 'perfect' && rating !== 'good' && rating !== 'slightly' && rating !== 'unknown') return [];
      return [{ ts: review.ts, rating }];
    });
  }
  if (typeof c.wordLang === 'string') card.wordLang = c.wordLang;
  if (typeof c.meaningLang === 'string') card.meaningLang = c.meaningLang;
  if (typeof c.audioUri === 'string') card.audioUri = c.audioUri;
  if (typeof c.audioSpeed === 'number' && Number.isFinite(c.audioSpeed)) card.audioSpeed = c.audioSpeed;
  if (typeof c.audioVolume === 'number' && Number.isFinite(c.audioVolume)) card.audioVolume = c.audioVolume;
  return card;
}

function parseCardArray(raw: unknown): WordCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(value => {
    const card = parseCard(value);
    return card ? [card] : [];
  });
}

function parseFolder(x: unknown): Folder | null {
  if (!x || typeof x !== 'object') return null;
  const f = x as Record<string, unknown>;
  if (typeof f.id !== 'string' || !f.id || typeof f.name !== 'string' ||
      typeof f.createdAt !== 'number' || !Number.isFinite(f.createdAt)) return null;
  const folder: Folder = { id: f.id, name: f.name, createdAt: f.createdAt };
  if (typeof f.icon === 'string') folder.icon = f.icon;
  if (typeof f.color === 'string') folder.color = f.color;
  if (f.notifSettings && typeof f.notifSettings === 'object') {
    const settings = f.notifSettings as Record<string, unknown>;
    if (typeof settings.intervalSeconds === 'number' && Number.isFinite(settings.intervalSeconds) &&
        typeof settings.displayOnlyWord === 'boolean') {
      folder.notifSettings = {
        intervalSeconds: Math.max(0, settings.intervalSeconds),
        displayOnlyWord: settings.displayOnlyWord,
      };
    }
  }
  return folder;
}

function parseFolderArray(raw: unknown): Folder[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(value => {
    const folder = parseFolder(value);
    return folder ? [folder] : [];
  });
}

// Normalizes a settings blob that arrives as a single object (Supabase restore).
// Individual AsyncStorage values are already typed strings — use them directly.
// Unknown or missing fields fall back to their default values.
function normalizeSettings(raw: unknown): Settings {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    themeColor: typeof s.themeColor === 'string' ? s.themeColor : DEFAULT_THEME,
    appearance: (s.appearance === 'light' || s.appearance === 'dark' || s.appearance === 'system')
      ? (s.appearance as Appearance)
      : 'system',
    skinId:     typeof s.skinId   === 'string' ? s.skinId   : null,
    language:   typeof s.language === 'string' ? s.language : DEFAULT_LANGUAGE,
    aiVoice:    isAIVoice(s.aiVoice) ? s.aiVoice : DEFAULT_AI_VOICE,
  };
}

// ── Identity ─────────────────────────────────────────────────────────────────

const TIMEOUT = Symbol('timeout');

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([Promise.resolve(promise), new Promise<typeof TIMEOUT>(resolve => setTimeout(() => resolve(TIMEOUT), ms))]);
}

async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const result = await withTimeout(requireSupabaseSession(), 5000);
    return result === TIMEOUT ? null : result.user.id;
  } catch {
    return null;
  }
}

// ── Local storage ─────────────────────────────────────────────────────────────

async function readLocal(): Promise<AppData> {
  const [rawCards, rawTheme, rawAppearance, rawSkinId, rawLanguage, rawAIVoice] =
    await Promise.all([
      AsyncStorage.getItem(CARDS_KEY),
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(APPEARANCE_KEY),
      AsyncStorage.getItem(SKIN_KEY),
      AsyncStorage.getItem(LANGUAGE_KEY),
      AsyncStorage.getItem(AI_VOICE_KEY),
    ]);

  return {
    cards: rawCards ? parseCardArray(safeParseJSON(rawCards)) : [],
    settings: {
      themeColor: rawTheme ?? DEFAULT_THEME,
      appearance: rawAppearance === 'light' || rawAppearance === 'dark' || rawAppearance === 'system'
        ? rawAppearance
        : 'system',
      skinId: rawSkinId || null,
      language: rawLanguage ?? DEFAULT_LANGUAGE,
      aiVoice: isAIVoice(rawAIVoice) ? rawAIVoice : DEFAULT_AI_VOICE,
    },
  };
}

async function writeLocal(data: AppData): Promise<void> {
  const { cards, settings } = data;
  await Promise.all([
    AsyncStorage.setItem(CARDS_KEY, JSON.stringify(cards)),
    AsyncStorage.setItem(THEME_KEY, settings.themeColor),
    AsyncStorage.setItem(APPEARANCE_KEY, settings.appearance),
    AsyncStorage.setItem(SKIN_KEY, settings.skinId ?? ''),
    AsyncStorage.setItem(LANGUAGE_KEY, settings.language),
    AsyncStorage.setItem(AI_VOICE_KEY, settings.aiVoice),
  ]);
}

// ── Remote sync ───────────────────────────────────────────────────────────────

async function upsertRemote(data: AppData): Promise<boolean> {
  if (!supabase) return true;
  const deviceId = await getAuthenticatedUserId();
  if (!deviceId) return false;
  // Local file URIs are device-specific and may reveal local filesystem paths;
  // they are intentionally excluded from cloud snapshots.
  const remoteCards = data.cards.map(card => ({ ...card, audioUri: undefined }));
  let result: { error: { code: string } | null } | typeof TIMEOUT;
  try {
    result = await withTimeout(
      supabase.from('device_data').upsert({
        device_id: deviceId,
        cards: remoteCards,
        settings: data.settings,
        synced_at: new Date().toISOString(),
      }),
      8000,
    );
  } catch (error) {
    reportSideEffectFailure('persist:remote-request', error);
    return false;
  }
  if (__DEV__) {
    if (result === TIMEOUT) {
      console.warn('[db] upsertRemote timed out after 8 s');
    } else if (result.error) {
      // Log the error code only — never log message, card content, or tokens.
      console.warn('[db] upsertRemote error:', result.error.code);
    }
  }
  return result !== TIMEOUT && !result.error;
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

export interface BootstrapResult extends AppData {
  isFirstLaunch: boolean;
}

/**
 * Call once on app start. Returns local data immediately (fast path).
 * On a genuine first install the default folder and four sample words are
 * written to storage before returning, so a subsequent readFolders() call
 * sees the seeded data. When local cards are absent, Supabase restore is
 * resolved before tutorial data is seeded to avoid overwriting remote data.
 */
export async function bootstrapData(): Promise<BootstrapResult> {
  const [local, deviceId, seeded] = await Promise.all([
    readLocal(), getAuthenticatedUserId(), AsyncStorage.getItem(SEEDED_KEY),
  ]);

  const isFirstLaunch = !seeded;

  if (isFirstLaunch) {
    void AsyncStorage.setItem(SEEDED_KEY, '1')
      .catch(error => reportSideEffectFailure('markSeeded', error));
  }

  if (local.cards.length === 0 && supabase && deviceId) {
    // Resolve restore before seeding. The previous background restore could race
    // the initial persistence effect and overwrite a real remote snapshot with
    // tutorial cards.
    let remoteResult: {
      data: { cards: unknown; settings: unknown } | null;
      error: unknown;
    } | typeof TIMEOUT = TIMEOUT;
    try {
      remoteResult = await withTimeout(
        supabase
          .from('device_data')
          .select('cards, settings')
          .eq('device_id', deviceId)
          .maybeSingle(),
        5000,
      );
    } catch (error) {
      // Remote sync is optional. An offline or unavailable backend must never
      // prevent local data and onboarding from loading.
      reportSideEffectFailure('bootstrap:remote', error);
    }
    if (remoteResult !== TIMEOUT && !remoteResult.error && remoteResult.data) {
      const remote: AppData = {
        cards: parseCardArray(remoteResult.data.cards),
        settings: normalizeSettings(remoteResult.data.settings),
      };
      await writeLocal(remote);
      return { ...remote, isFirstLaunch };
    }
  }

  if (local.cards.length === 0 && isFirstLaunch) {
    local.cards = DEFAULT_CARDS;
    await Promise.all([
      writeLocal(local),
      AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(DEFAULT_FOLDERS)),
    ]);
  }

  return { ...local, isFirstLaunch };
}

/**
 * Persist a full snapshot of app data. Writes to AsyncStorage immediately
 * (fire-and-forget), then syncs to Supabase in the background.
 */
let pendingLocal: AppData | null = null;
let localWriteActive = false;
let pendingRemote: AppData | null = null;
let remoteWriteActive = false;
let remoteTimer: ReturnType<typeof setTimeout> | null = null;
let remoteRetryTimer: ReturnType<typeof setTimeout> | null = null;
let remoteRetryAttempts = 0;
const MAX_REMOTE_RETRIES = 5;

async function flushLocal(): Promise<void> {
  if (localWriteActive) return;
  localWriteActive = true;
  try {
    while (pendingLocal) {
      const snapshot = pendingLocal;
      pendingLocal = null;
      await writeLocal(snapshot);
    }
  } catch (error) {
    reportSideEffectFailure('persist:local', error);
  } finally {
    localWriteActive = false;
    if (pendingLocal) void flushLocal();
  }
}

async function flushRemote(): Promise<void> {
  if (remoteWriteActive) return;
  remoteWriteActive = true;
  let retryNeeded = false;
  try {
    while (pendingRemote) {
      const snapshot = pendingRemote;
      pendingRemote = null;
      if (!(await upsertRemote(snapshot))) {
        // Preserve a newer snapshot if one arrived during the request; otherwise
        // retain the failed snapshot for bounded offline retry.
        pendingRemote ??= snapshot;
        retryNeeded = true;
        break;
      }
      remoteRetryAttempts = 0;
    }
  } catch (error) {
    reportSideEffectFailure('persist:remote', error);
    retryNeeded = true;
  } finally {
    remoteWriteActive = false;
    if (retryNeeded && pendingRemote && !remoteRetryTimer && remoteRetryAttempts < MAX_REMOTE_RETRIES) {
      const delay = Math.min(30000, 2000 * (2 ** remoteRetryAttempts));
      remoteRetryAttempts++;
      remoteRetryTimer = setTimeout(() => {
        remoteRetryTimer = null;
        void flushRemote();
      }, delay);
    } else if (!retryNeeded && pendingRemote) {
      void flushRemote();
    }
  }
}

export function persist(data: AppData): void {
  pendingLocal = data;
  void flushLocal();

  pendingRemote = data;
  if (remoteTimer) clearTimeout(remoteTimer);
  if (remoteRetryTimer) {
    clearTimeout(remoteRetryTimer);
    remoteRetryTimer = null;
  }
  remoteRetryAttempts = 0;
  remoteTimer = setTimeout(() => {
    remoteTimer = null;
    void flushRemote();
  }, 750);
}

// ── Folder storage (local-only, not synced to Supabase) ──────────────────────

export async function readFolders(): Promise<Folder[]> {
  const raw = await AsyncStorage.getItem(FOLDERS_KEY);
  return raw ? parseFolderArray(safeParseJSON(raw)) : [];
}

export function persistFolders(folders: Folder[]): void {
  AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
    .catch(e => reportSideEffectFailure('persistFolders', e));
}
