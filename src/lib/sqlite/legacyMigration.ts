import { dedupeById, parseCardArray, parseFolderArray, safeParseJSON } from '../parsing';
import { writeSnapshot } from './repositories';
import type { KeyValueStore, SqlDatabase } from './types';

/**
 * One-time import of the pre-SQLite AsyncStorage layout.
 *
 * Two properties matter more than anything else here:
 *
 *  1. It never runs twice. A marker row is written inside the same transaction
 *     as the data, so a crash between the two is impossible and a second run
 *     finds the marker and stops.
 *  2. It never destroys the source. The AsyncStorage keys are left exactly as
 *     they were, so a failed or half-understood migration can be retried, and a
 *     user who downgrades still has their words.
 */

/** Marker row in app_settings. Its presence means "do not import again". */
export const MIGRATION_MARKER_KEY = 'migration:asyncstorage:v1';

export interface LegacyStorageKeys {
  cards: string;
  folders: string;
  themeColor: string;
  appearance: string;
  skinId: string;
  language: string;
  aiVoice: string;
}

export type MigrationOutcome =
  | { status: 'already-migrated' }
  | { status: 'nothing-to-migrate' }
  | { status: 'migrated'; words: number; folders: number; settings: number };

/** Settings keys mirrored into app_settings, using their legacy names as ids. */
const SETTING_FIELDS: readonly (keyof Omit<LegacyStorageKeys, 'cards' | 'folders'>)[] = [
  'themeColor', 'appearance', 'skinId', 'language', 'aiVoice',
];

export async function hasMigratedLegacyStorage(db: SqlDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [MIGRATION_MARKER_KEY],
  );
  return row !== null;
}

/**
 * Copies legacy AsyncStorage content into SQLite exactly once.
 *
 * Ids, createdAt timestamps, folder relationships, review state and array order
 * all carry over unchanged — order becomes the `position` column, which is what
 * the JSON array's index used to mean implicitly.
 */
export async function migrateLegacyStorage(
  db: SqlDatabase,
  store: KeyValueStore,
  keys: LegacyStorageKeys,
): Promise<MigrationOutcome> {
  if (await hasMigratedLegacyStorage(db)) return { status: 'already-migrated' };

  const [rawCards, rawFolders, ...rawSettings] = await Promise.all([
    store.getItem(keys.cards),
    store.getItem(keys.folders),
    ...SETTING_FIELDS.map(field => store.getItem(keys[field])),
  ]);

  // Duplicate ids were possible in the JSON array but are not in SQLite. The
  // first occurrence wins, matching how the old list rendering resolved them.
  const cards = dedupeById(parseCardArray(rawCards === null ? null : safeParseJSON(rawCards)));
  const folders = dedupeById(parseFolderArray(rawFolders === null ? null : safeParseJSON(rawFolders)));

  const settings = new Map<string, string>();
  for (const [index, field] of SETTING_FIELDS.entries()) {
    const value = rawSettings[index];
    if (typeof value === 'string' && value !== '') settings.set(keys[field], value);
  }

  const nothingStored = rawCards === null && rawFolders === null && settings.size === 0;
  if (nothingStored) {
    // A genuine first install. Mark it so the next launch skips the lookup
    // entirely, and let the normal seeding path create the welcome content.
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        MIGRATION_MARKER_KEY,
        String(Date.now()),
      ]);
    });
    return { status: 'nothing-to-migrate' };
  }

  settings.set(MIGRATION_MARKER_KEY, String(Date.now()));

  // Folders, words and settings all land in one transaction: either the whole
  // legacy state is present afterwards or none of it is.
  await writeSnapshot(db, { folders, cards, settings });

  return {
    status: 'migrated',
    words: cards.length,
    folders: folders.length,
    // The marker is bookkeeping, not a user setting.
    settings: settings.size - 1,
  };
}
