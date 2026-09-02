import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appearance, Folder, WordCard } from '../types';
import {
  APPEARANCE_KEY, CARDS_KEY,
  AI_VOICE_KEY,
  DEFAULT_LANGUAGE, DEFAULT_THEME,
  FOLDERS_KEY, LANGUAGE_KEY, SKIN_KEY, THEME_KEY,
} from '../constants';
import { DEFAULT_AI_VOICE, isAIVoice, type AIVoice } from './aiVoices';
import { asyncStorageAdapter, getDatabase } from './sqlite/database';
import { migrateLegacyStorage, type LegacyStorageKeys } from './sqlite/legacyMigration';
import {
  readFolders as readFoldersFromDb,
  readSettingValues,
  readWords,
  writeSnapshot,
} from './sqlite/repositories';
import type { SqlDatabase } from './sqlite/types';
import { reportSideEffectFailure } from '../utils/reportSideEffectFailure';

/**
 * Local data access for the app.
 *
 * Everything here is on-device and synchronous with respect to the network:
 * there is no remote store, no session to acquire, and nothing that can fail
 * because the user is offline. The public shape of this module is unchanged
 * from the AsyncStorage era so that App.tsx and the feature hooks did not have
 * to be rewritten; only the storage engine underneath is different.
 */

const SEEDED_KEY = 'wordping_seeded';

export const DEFAULT_FOLDER_ID  = 'default';  // kept for migration of existing users
export const WELCOME_FOLDER_ID  = 'wp-welcome';

/** Legacy AsyncStorage key names, reused as the ids in the app_settings table. */
const LEGACY_KEYS: LegacyStorageKeys = {
  cards: CARDS_KEY,
  folders: FOLDERS_KEY,
  themeColor: THEME_KEY,
  appearance: APPEARANCE_KEY,
  skinId: SKIN_KEY,
  language: LANGUAGE_KEY,
  aiVoice: AI_VOICE_KEY,
};

// Shown on a genuine first install.
const DEFAULT_FOLDERS: Folder[] = [
  { id: WELCOME_FOLDER_ID, name: 'Welcome', createdAt: 1 },
];

/**
 * The gestures card, seeded last.
 *
 * Deliberately fixed English on the front and Japanese on the back rather than
 * localized like the four cards above: it is a sample card as much as an
 * instruction, so it also demonstrates what a two-language entry looks like.
 *
 * It is not in `WELCOME_CARD_IDS`, which is the list onboarding rebuilds — so
 * completing onboarding leaves it untouched, and deleting it is permanent.
 */
export const GESTURES_CARD_ID = 'wp-w5';

// English placeholders — replaced with localized content when onboarding completes.
const DEFAULT_CARDS: WordCard[] = [
  { id: 'wp-w1', createdAt: 1, word: 'Tap the card to reveal its meaning.',                               meaning: 'Tap the card to reveal its meaning.',                               note: '', wordLang: 'en-US', folderId: WELCOME_FOLDER_ID },
  { id: 'wp-w2', createdAt: 2, word: 'Switch between List Mode and Flip Mode in Settings.', meaning: 'Switch between List Mode and Flip Mode in Settings.', note: '', wordLang: 'en-US', folderId: WELCOME_FOLDER_ID },
  { id: 'wp-w3', createdAt: 3, word: 'Tap the graduation cap icon to test yourself.',                      meaning: 'Tap the graduation cap icon to test yourself.',                      note: '', wordLang: 'en-US', folderId: WELCOME_FOLDER_ID },
  { id: 'wp-w4', createdAt: 4, word: 'Set up notifications to review your words automatically.',           meaning: 'Set up notifications to review your words automatically.',           note: '', wordLang: 'en-US', folderId: WELCOME_FOLDER_ID },
  { id: GESTURES_CARD_ID, createdAt: 5, word: 'You can swipe or long-press words and folders.', meaning: '単語やフォルダは、スワイプまたは長押しで操作できます。', note: '', wordLang: 'en-US', meaningLang: 'ja-JP', folderId: WELCOME_FOLDER_ID },
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

export function settingsFromValues(values: ReadonlyMap<string, string>): Settings {
  const appearance = values.get(APPEARANCE_KEY);
  const skinId = values.get(SKIN_KEY);
  const aiVoice = values.get(AI_VOICE_KEY);
  return {
    themeColor: values.get(THEME_KEY) ?? DEFAULT_THEME,
    appearance: appearance === 'light' || appearance === 'dark' || appearance === 'system'
      ? appearance
      : 'system',
    skinId: skinId ? skinId : null,
    language: values.get(LANGUAGE_KEY) ?? DEFAULT_LANGUAGE,
    aiVoice: isAIVoice(aiVoice) ? aiVoice : DEFAULT_AI_VOICE,
  };
}

export function settingsToValues(settings: Settings): Map<string, string> {
  return new Map([
    [THEME_KEY, settings.themeColor],
    [APPEARANCE_KEY, settings.appearance],
    [SKIN_KEY, settings.skinId ?? ''],
    [LANGUAGE_KEY, settings.language],
    [AI_VOICE_KEY, settings.aiVoice],
  ]);
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

export interface BootstrapResult extends AppData {
  isFirstLaunch: boolean;
}

/**
 * Was this install seeded before?
 *
 * The flag lives in SQLite now, but an upgrading user only has the old
 * AsyncStorage key, so that is consulted once as a fallback. Getting this wrong
 * would re-seed tutorial cards over somebody's real vocabulary.
 */
async function resolveFirstLaunch(db: SqlDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [SEEDED_KEY],
  );
  if (row !== null) return false;

  const legacy = await AsyncStorage.getItem(SEEDED_KEY).catch(() => null);
  return legacy === null;
}

/**
 * Call once on app start. Opens the database, runs any pending schema and
 * legacy-data migrations, and returns the local data.
 *
 * Nothing in this path touches the network, so it completes at the same speed
 * offline as online.
 */
export async function bootstrapData(): Promise<BootstrapResult> {
  const db = await getDatabase();

  const outcome = await migrateLegacyStorage(db, asyncStorageAdapter, LEGACY_KEYS);
  if (__DEV__ && outcome.status === 'migrated') {
    console.log('[db] migrated legacy storage into SQLite', {
      words: outcome.words, folders: outcome.folders, settings: outcome.settings,
    });
  }

  const isFirstLaunch = await resolveFirstLaunch(db);
  const [cards, settingValues] = await Promise.all([readWords(db), readSettingValues(db)]);

  if (isFirstLaunch && cards.length === 0) {
    // Seed the welcome content and the flag together, so a crash mid-seed
    // cannot leave the flag set with no cards behind it.
    const settings = new Map(settingValues);
    settings.set(SEEDED_KEY, String(Date.now()));
    // Only supply folders when there are genuinely none: passing a folder list
    // to writeSnapshot is a replace, which would delete any that already exist.
    const existingFolders = await readFoldersFromDb(db);
    await writeSnapshot(db, {
      ...(existingFolders.length === 0 ? { folders: DEFAULT_FOLDERS } : {}),
      cards: DEFAULT_CARDS,
      settings,
    });
    return {
      cards: DEFAULT_CARDS,
      settings: settingsFromValues(settingValues),
      isFirstLaunch: true,
    };
  }

  if (isFirstLaunch) {
    await writeSnapshot(db, { settings: new Map([[SEEDED_KEY, String(Date.now())]]) });
  }

  return { cards, settings: settingsFromValues(settingValues), isFirstLaunch };
}

// ── Persistence ──────────────────────────────────────────────────────────────

/**
 * Writes are coalesced into a single transaction per flush.
 *
 * `persist` and `persistFolders` are called from separate effects in the same
 * render commit. Buffering both and writing folders first is what lets a word
 * created alongside a brand-new folder satisfy its foreign key.
 */
let pendingCards: WordCard[] | null = null;
let pendingFolders: Folder[] | null = null;
let pendingSettings: Map<string, string> | null = null;
let flushScheduled = false;
let flushActive = false;
/**
 * Set while an exclusive database task (a backup import) is running.
 *
 * Two things would otherwise go wrong. A snapshot queued before the import
 * describes the pre-import data, so flushing it afterwards would silently undo
 * what the user just restored. And expo-sqlite runs one connection: a `persist`
 * transaction overlapping an import transaction is a nested-transaction error.
 */
let exclusiveTask: Promise<unknown> | null = null;

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  // A macrotask, not a microtask: it lets every effect in the current commit
  // enqueue its data before anything is written.
  setTimeout(() => {
    flushScheduled = false;
    void flush();
  }, 0);
}

async function flush(): Promise<void> {
  if (flushActive) return;
  // An import is in progress and owns the database. Queued snapshots stay
  // queued; runExclusive drops the stale ones before releasing the gate.
  if (exclusiveTask !== null) return;
  flushActive = true;
  try {
    while (pendingCards !== null || pendingFolders !== null || pendingSettings !== null) {
      const cards = pendingCards;
      const folders = pendingFolders;
      const settings = pendingSettings;
      pendingCards = null;
      pendingFolders = null;
      pendingSettings = null;

      const db = await getDatabase();
      const result = await writeSnapshot(db, {
        ...(folders !== null ? { folders } : {}),
        ...(cards !== null ? { cards } : {}),
        ...(settings !== null ? { settings } : {}),
      });
      if (__DEV__ && result.orphanedCardIds.length > 0) {
        console.warn('[db] cards detached from a missing folder:', result.orphanedCardIds.length);
      }
    }
  } catch (error) {
    reportSideEffectFailure('persist:sqlite', error);
  } finally {
    flushActive = false;
    if (pendingCards !== null || pendingFolders !== null || pendingSettings !== null) {
      scheduleFlush();
    }
  }
}

/**
 * Runs `task` with sole ownership of the database.
 *
 * Used by backup import. Any snapshot already queued describes the data as it
 * was *before* the import, so it is discarded once the task succeeds rather
 * than being written on top of the restored rows. Callers re-read the database
 * afterwards, which re-queues the correct state.
 */
export async function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  // Let an in-flight flush finish; it owns a transaction right now. Bounded so
  // a wedged write cannot leave an import spinning forever with no way out —
  // after the deadline the import proceeds and SQLite serialises the two.
  const deadline = Date.now() + 5_000;
  while (flushActive && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  const run = (async () => {
    try {
      return await task();
    } finally {
      exclusiveTask = null;
    }
  })();
  exclusiveTask = run;

  try {
    const result = await run;
    // Succeeded: everything queued before this point is pre-import state.
    pendingCards = null;
    pendingFolders = null;
    pendingSettings = null;
    return result;
  } catch (error) {
    // Failed and rolled back, so the queued snapshots still describe the
    // database accurately. Let them flush.
    scheduleFlush();
    throw error;
  }
}

/** Persist a full snapshot of cards and settings. */
export function persist(data: AppData): void {
  pendingCards = data.cards;
  pendingSettings = settingsToValues(data.settings);
  scheduleFlush();
}

export async function readFolders(): Promise<Folder[]> {
  const db = await getDatabase();
  return readFoldersFromDb(db);
}

export interface LocalDataSnapshot {
  cards: WordCard[];
  folders: Folder[];
  settings: Settings;
}

/**
 * Re-reads everything from the database.
 *
 * Needed after a backup import replaces the rows underneath React state — at
 * that point what is on screen no longer describes what is stored.
 */
export async function reloadLocalData(): Promise<LocalDataSnapshot> {
  const db = await getDatabase();
  const [cards, folders, values] = await Promise.all([
    readWords(db),
    readFoldersFromDb(db),
    readSettingValues(db),
  ]);
  return { cards, folders, settings: settingsFromValues(values) };
}

export function persistFolders(folders: Folder[]): void {
  pendingFolders = folders;
  scheduleFlush();
}

/** Test hook: waits for any queued write to reach the database. */
export async function flushPendingWrites(): Promise<void> {
  while (flushScheduled || flushActive || pendingCards !== null || pendingFolders !== null || pendingSettings !== null) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
