import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appearance, Folder, WordCard } from '../types';
import {
  APPEARANCE_KEY, CARDS_KEY,
  DEFAULT_LANGUAGE, DEFAULT_THEME, DEVICE_ID_KEY,
  FOLDERS_KEY, LANGUAGE_KEY, SKIN_KEY, THEME_KEY,
} from '../constants';
import { supabase } from './supabase';

const SEEDED_KEY = 'wordping_seeded';

export const DEFAULT_FOLDER_ID = 'default';

const DEFAULT_FOLDER: Folder = {
  id: DEFAULT_FOLDER_ID,
  name: 'My Words',
  createdAt: 0,
};

// Shown on a genuine first install. Supabase data replaces these in the background.
const DEFAULT_CARDS: WordCard[] = [
  { id: 'default-1', word: 'hesitate',   meaning: 'to pause before doing something because you feel unsure or nervous', note: "Example: Don't hesitate to ask questions.", folderId: DEFAULT_FOLDER_ID },
  { id: 'default-2', word: 'reliable',   meaning: 'someone or something you can trust or depend on',                   note: 'Example: He is very reliable.',             folderId: DEFAULT_FOLDER_ID },
  { id: 'default-3', word: 'roughly',    meaning: 'approximately or about, not exactly',                               note: '',                                           folderId: DEFAULT_FOLDER_ID },
  { id: 'default-4', word: 'figure out', meaning: 'to understand something or find a solution',                        note: '',                                           folderId: DEFAULT_FOLDER_ID },
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
 */
async function getDeviceId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (!error && data.user?.id) return data.user.id;

  // Offline fallback — Supabase calls will be rejected by RLS until the
  // user comes back online and a real anonymous session is established.
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

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
    cards: rawCards ? (JSON.parse(rawCards) as WordCard[]) : [],
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

async function upsertRemote(data: AppData): Promise<void> {
  const deviceId = await getDeviceId();
  await supabase.from('device_data').upsert({
    device_id: deviceId,
    cards: data.cards,
    settings: data.settings,
    synced_at: new Date().toISOString(),
  });
}

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
      // Write the default folder synchronously so readFolders() sees it.
      await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify([DEFAULT_FOLDER]));
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
          cards: data.cards as WordCard[],
          settings: data.settings as Settings,
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
  writeLocal(data);
  upsertRemote(data);
}

// ── Folder storage (local-only, not synced to Supabase) ──────────────────────

export async function readFolders(): Promise<Folder[]> {
  const raw = await AsyncStorage.getItem(FOLDERS_KEY);
  return raw ? (JSON.parse(raw) as Folder[]) : [];
}

export function persistFolders(folders: Folder[]): void {
  AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}
