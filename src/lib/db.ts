import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appearance, Folder, WordCard } from '../types';
import {
  APPEARANCE_KEY, CARDS_KEY,
  DEFAULT_LANGUAGE, DEFAULT_THEME, DEVICE_ID_KEY,
  FOLDERS_KEY, LANGUAGE_KEY, SKIN_KEY, THEME_KEY,
} from '../constants';
import { supabase } from './supabase';
import { reportSideEffectFailure } from '../utils/reportSideEffectFailure';

const SEEDED_KEY = 'wordping_seeded';

export const DEFAULT_FOLDER_ID  = 'default';  // kept for migration of existing users
export const WELCOME_FOLDER_ID  = 'wp-welcome';

// Shown on a genuine first install. Supabase data replaces these in the background.
const DEFAULT_FOLDERS: Folder[] = [
  { id: WELCOME_FOLDER_ID, name: 'Welcome to WordPing', createdAt: 1 },
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

// A WordCard is valid only when its four required string fields are present.
// Optional fields (notifOff, folderId, testLevel, …) are passed through as-is.
function isValidCard(x: unknown): x is WordCard {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  return (
    typeof c.id       === 'string' && c.id.length > 0 &&
    typeof c.word     === 'string' &&
    typeof c.meaning  === 'string' &&
    typeof c.note     === 'string'
  );
}

// Accepts any value and returns only the records that pass isValidCard.
// Invalid records are dropped; the valid remainder is returned unchanged.
function parseCardArray(raw: unknown): WordCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidCard) as WordCard[];
}

function isValidFolder(x: unknown): x is Folder {
  if (!x || typeof x !== 'object') return false;
  const f = x as Record<string, unknown>;
  return (
    typeof f.id        === 'string' && f.id.length > 0 &&
    typeof f.name      === 'string' &&
    typeof f.createdAt === 'number'
  );
}

function parseFolderArray(raw: unknown): Folder[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidFolder) as Folder[];
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
  };
}

// ── Identity ─────────────────────────────────────────────────────────────────

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Returns the authenticated anonymous user's UUID, signing in if needed.
 * Falls back to a locally generated UUID when offline so the app still
 * works without a network connection (Supabase sync will be skipped).
 *
 * The resolved ID is cached for the lifetime of the process. This ensures
 * every call within one app session uses the same identity regardless of
 * whether a background signInAnonymously() completes later and stores a
 * Supabase session to AsyncStorage.
 */
const TIMEOUT = Symbol('timeout');
let _cachedDeviceId: string | null = null;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([Promise.resolve(promise), new Promise<typeof TIMEOUT>(resolve => setTimeout(() => resolve(TIMEOUT), ms))]);
}

async function getDeviceId(): Promise<string> {
  if (_cachedDeviceId) return _cachedDeviceId;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      _cachedDeviceId = session.user.id;
      return _cachedDeviceId;
    }

    // 5-second timeout prevents an unreachable Supabase server from blocking
    // the entire startup chain indefinitely (fetch has no built-in timeout).
    const result = await withTimeout(supabase.auth.signInAnonymously(), 5000);
    if (result !== TIMEOUT && !result.error && result.data.user?.id) {
      _cachedDeviceId = result.data.user.id;
      return _cachedDeviceId;
    }
  } catch {
    // getSession or signInAnonymously threw — fall through to local ID.
  }

  // Offline fallback — Supabase calls will be rejected by RLS until the
  // user comes back online and a real anonymous session is established.
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  _cachedDeviceId = id;
  return _cachedDeviceId;
}

// ── Local storage ─────────────────────────────────────────────────────────────

async function readLocal(): Promise<AppData> {
  const [rawCards, rawTheme, rawAppearance, rawSkinId, rawLanguage] =
    await Promise.all([
      AsyncStorage.getItem(CARDS_KEY),
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(APPEARANCE_KEY),
      AsyncStorage.getItem(SKIN_KEY),
      AsyncStorage.getItem(LANGUAGE_KEY),
    ]);

  return {
    cards: rawCards ? parseCardArray(safeParseJSON(rawCards)) : [],
    settings: {
      themeColor: rawTheme ?? DEFAULT_THEME,
      appearance: (rawAppearance as Appearance | null) ?? 'system',
      skinId: rawSkinId || null,
      language: rawLanguage ?? DEFAULT_LANGUAGE,
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
  ]);
}

// ── Remote sync ───────────────────────────────────────────────────────────────

async function upsertRemote(data: AppData): Promise<void> {
  const deviceId = await getDeviceId();
  const result = await withTimeout(
    supabase.from('device_data').upsert({
      device_id: deviceId,
      cards: data.cards,
      settings: data.settings,
      synced_at: new Date().toISOString(),
    }),
    8000,
  );
  if (__DEV__) {
    if (result === TIMEOUT) {
      console.warn('[db] upsertRemote timed out after 8 s');
    } else if (result.error) {
      // Log the error code only — never log message, card content, or tokens.
      console.warn('[db] upsertRemote error:', result.error.code);
    }
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

export interface BootstrapResult extends AppData {
  isFirstLaunch: boolean;
}

/**
 * Call once on app start. Returns local data immediately (fast path).
 * On a genuine first install the default folder and four sample words are
 * written to storage before returning, so a subsequent readFolders() call
 * sees the seeded data. Supabase is also checked in the background — if
 * prior data exists it replaces whatever is showing.
 */
export async function bootstrapData(onRemoteData: (data: AppData) => void): Promise<BootstrapResult> {
  const [local, deviceId, seeded] = await Promise.all([
    readLocal(), getDeviceId(), AsyncStorage.getItem(SEEDED_KEY),
  ]);

  const isFirstLaunch = !seeded;

  if (isFirstLaunch) {
    void AsyncStorage.setItem(SEEDED_KEY, '1');
  }

  if (local.cards.length === 0) {
    if (isFirstLaunch) {
      local.cards = DEFAULT_CARDS;
      // Write both default folders synchronously so readFolders() sees them.
      await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(DEFAULT_FOLDERS));
    }

    // Try to restore the user's real data from Supabase in the background.
    supabase
      .from('device_data')
      .select('cards, settings')
      .eq('device_id', deviceId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return;
        const remote: AppData = {
          cards: parseCardArray(data.cards),
          settings: normalizeSettings(data.settings),
        };
        writeLocal(remote);
        onRemoteData(remote);
      });
  }

  return { ...local, isFirstLaunch };
}

/**
 * Persist a full snapshot of app data. Writes to AsyncStorage immediately
 * (fire-and-forget), then syncs to Supabase in the background.
 */
export function persist(data: AppData): void {
  writeLocal(data).catch(e => reportSideEffectFailure('persist:local', e));
  upsertRemote(data).catch(e => reportSideEffectFailure('persist:remote', e));
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
