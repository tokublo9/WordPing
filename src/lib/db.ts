import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appearance, Folder, WordCard } from '../types';
import {
  APPEARANCE_KEY, CARDS_KEY,
  DEFAULT_LANGUAGE, DEFAULT_THEME, DEVICE_ID_KEY,
  FOLDERS_KEY, LANGUAGE_KEY, SKIN_KEY, THEME_KEY,
} from '../constants';
import { supabase } from './supabase';

const SEEDED_KEY = 'wordping_seeded';

export const DEFAULT_FOLDER_ID  = 'default';  // kept for migration of existing users
export const WELCOME_FOLDER_ID  = 'wp-welcome';
const        WORDS_FOLDER_ID    = 'wp-words';
const        SENTENCES_FOLDER_ID = 'wp-sentences';

// Shown on a genuine first install. Supabase data replaces these in the background.
const DEFAULT_FOLDERS: Folder[] = [
  { id: WELCOME_FOLDER_ID,   name: 'Welcome to WordPing', createdAt: 1 },
  { id: WORDS_FOLDER_ID,     name: 'Words',               createdAt: 2 },
  { id: SENTENCES_FOLDER_ID, name: 'Sentences',           createdAt: 3 },
];

const DEFAULT_CARDS: WordCard[] = [
  // ── Welcome to WordPing (4 tutorial cards) ───────────────────────────────────
  {
    id: 'wp-w1',
    word: 'Tap the speaker icon to hear pronunciation',
    meaning: 'Tap the speaker icon to hear the word spoken aloud.',
    note: 'Native audio helps you learn the correct sound.',
    folderId: WELCOME_FOLDER_ID,
  },
  {
    id: 'wp-w2',
    word: 'Swipe left to edit or delete',
    meaning: 'Swipe a card to the left to see edit and delete options.',
    note: 'Manage your cards quickly with gestures.',
    folderId: WELCOME_FOLDER_ID,
  },
  {
    id: 'wp-w3',
    word: 'Tap a card to flip it',
    meaning: 'Tap any card to reveal the meaning on the back.',
    note: 'Flashcard review helps words stick in your memory.',
    folderId: WELCOME_FOLDER_ID,
  },
  {
    id: 'wp-w4',
    word: 'Turn on notifications to keep learning',
    meaning: 'Enable push notifications to get daily word reminders.',
    note: 'Short daily reviews lead to lasting progress.',
    folderId: WELCOME_FOLDER_ID,
  },
  // ── Words (4 single-word examples) ──────────────────────────────────────────
  {
    id: 'wp-v1',
    word: 'giddy',
    meaning: 'Excited, nervous, and happy.',
    note: 'I felt giddy with excitement before the trip.',
    folderId: WORDS_FOLDER_ID,
  },
  {
    id: 'wp-v2',
    word: 'resilient',
    meaning: 'Able to recover quickly from difficulties.',
    note: 'She is incredibly resilient under pressure.',
    folderId: WORDS_FOLDER_ID,
  },
  {
    id: 'wp-v3',
    word: 'eloquent',
    meaning: 'Expressing ideas fluently and persuasively.',
    note: 'His eloquent speech moved the entire audience.',
    folderId: WORDS_FOLDER_ID,
  },
  {
    id: 'wp-v4',
    word: 'tantamount',
    meaning: 'Equivalent to; essentially the same as.',
    note: 'Silence on this issue is tantamount to approval.',
    folderId: WORDS_FOLDER_ID,
  },
  // ── Sentences (3 phrase examples) ───────────────────────────────────────────
  {
    id: 'wp-s1',
    word: 'It really hits home.',
    meaning: 'It feels deeply personal or emotionally impactful.',
    note: 'His words really hit home for me.',
    folderId: SENTENCES_FOLDER_ID,
  },
  {
    id: 'wp-s2',
    word: 'I can imagine that.',
    meaning: 'Used to show understanding or empathy toward someone.',
    note: 'Common in natural everyday conversation.',
    folderId: SENTENCES_FOLDER_ID,
  },
  {
    id: 'wp-s3',
    word: 'That makes a lot of sense.',
    meaning: 'Used to say you understand and agree with an explanation.',
    note: 'A polite and natural way to respond in discussions.',
    folderId: SENTENCES_FOLDER_ID,
  },
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
