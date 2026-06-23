import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appearance, WordCard } from '../types';
import {
  APPEARANCE_KEY, CARDS_KEY, DEFAULT_DISPLAY_ONLY_WORD, DEFAULT_INTERVAL,
  DEFAULT_THEME, DEVICE_ID_KEY, DISPLAY_ONLY_WORD_KEY, INTERVAL_KEY, THEME_KEY,
} from '../constants';
import { supabase } from './supabase';

export interface Settings {
  intervalSeconds: number;
  themeColor: string;
  appearance: Appearance;
  displayOnlyWord: boolean;
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
  const [rawCards, rawInterval, rawTheme, rawAppearance, rawDisplayOnlyWord] =
    await Promise.all([
      AsyncStorage.getItem(CARDS_KEY),
      AsyncStorage.getItem(INTERVAL_KEY),
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(APPEARANCE_KEY),
      AsyncStorage.getItem(DISPLAY_ONLY_WORD_KEY),
    ]);

  return {
    cards: rawCards ? (JSON.parse(rawCards) as WordCard[]) : [],
    settings: {
      intervalSeconds: rawInterval ? Number(rawInterval) : DEFAULT_INTERVAL,
      themeColor: rawTheme ?? DEFAULT_THEME,
      appearance: (rawAppearance as Appearance | null) ?? 'system',
      displayOnlyWord:
        rawDisplayOnlyWord !== null ? rawDisplayOnlyWord === 'true' : DEFAULT_DISPLAY_ONLY_WORD,
    },
  };
}

async function writeLocal(data: AppData): Promise<void> {
  const { cards, settings } = data;
  await Promise.all([
    AsyncStorage.setItem(CARDS_KEY, JSON.stringify(cards)),
    AsyncStorage.setItem(INTERVAL_KEY, String(settings.intervalSeconds)),
    AsyncStorage.setItem(THEME_KEY, settings.themeColor),
    AsyncStorage.setItem(APPEARANCE_KEY, settings.appearance),
    AsyncStorage.setItem(DISPLAY_ONLY_WORD_KEY, String(settings.displayOnlyWord)),
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

/**
 * Call once on app start. Returns local data immediately (fast path).
 * If local cards are empty (fresh install / reset), fetches from Supabase
 * in the background and calls onRemoteData if data is found.
 */
export async function bootstrapData(onRemoteData: (data: AppData) => void): Promise<AppData> {
  const [local, deviceId] = await Promise.all([readLocal(), getDeviceId()]);

  if (local.cards.length === 0) {
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

  return local;
}

/**
 * Persist a full snapshot of app data. Writes to AsyncStorage immediately
 * (fire-and-forget), then syncs to Supabase in the background.
 */
export function persist(data: AppData): void {
  writeLocal(data);
  upsertRemote(data);
}
