/**
 * The on-disk backup format.
 *
 * Because there is no account and no cloud copy, this file is the only way a
 * user moves their vocabulary to a new phone. That makes two things
 * non-negotiable: it must be self-describing enough to import into a future
 * version of the app, and it must never contain anything that identifies the
 * device or grants access to a paid service.
 */

export const BACKUP_FILE_KIND = 'wordping-backup';

/** Bumped only for a breaking change to the shape below. */
export const BACKUP_FORMAT_VERSION = 1;

/** Format versions this build can read. */
export const SUPPORTED_FORMAT_VERSIONS: readonly number[] = [1];

/**
 * Settings safe to carry to another device.
 *
 * An allowlist, not a denylist: a setting added later is excluded until someone
 * deliberately decides it is transferable. The install id, the RevenueCat app
 * user id, the first-launch flag and the migration markers are all absent by
 * construction, and none of them is stored in `app_settings` in a form this
 * list would pick up.
 */
export const EXPORTABLE_SETTING_KEYS: readonly string[] = [
  'theme_color',
  'appearance',
  'theme_skin',
  'app_language',
  'ai_voice',
];

export interface BackupFolder {
  id: string;
  name: string;
  createdAt: number;
  position: number;
  icon?: string;
  color?: string;
  notifIntervalSeconds?: number;
  notifDisplayOnlyWord?: boolean;
  /**
   * "Notify All Words" for this folder. Optional and additive: a backup written
   * before the field existed omits it and imports as off — the candidate list
   * applies — so the format version does not move.
   */
  notifNotifyAllWords?: boolean;
}

export interface BackupLabel {
  id: string;
  name: string;
  kind: string;
  position: number;
  color?: string;
}

export interface BackupWord {
  id: string;
  word: string;
  meaning: string;
  position: number;
  folderId?: string;
  createdAt?: number;
  /**
   * The word is on its folder's notification list.
   *
   * Replaces `notifOff`, which meant the opposite. A backup written before the
   * change carries `notifOff` instead, and the importer converts it with the
   * same rule the schema migration used — a word that was not muted becomes a
   * candidate — so a restored file reproduces the reminders it was taken with.
   * Both fields are accepted on the way in; only this one is written out.
   */
  notifCandidate?: boolean;
  /** @deprecated Read for backwards compatibility only. Never written. */
  notifOff?: boolean;
  wordLang?: string;
  meaningLang?: string;
  /**
   * Playback preferences for a user-attached audio file. The file itself is
   * device-local and is not part of the backup, so `audioUri` is deliberately
   * absent — a path from another phone would never resolve.
   */
  audioSpeed?: number;
  audioVolume?: number;
  /**
   * The per-word "Hide Word" preference.
   *
   * Unlike `audioUri` this is not device-local — it is a choice about the word
   * itself — so it travels. Optional and additive: a backup written before this
   * field existed simply omits it and imports as visible, which is why the
   * format version does not move.
   */
  hideWord?: boolean;
}

export interface BackupNote {
  wordId: string;
  body: string;
}

export interface BackupWordLabel {
  wordId: string;
  labelId: string;
}

export interface BackupLearningProgress {
  wordId: string;
  levelId?: string;
  nextReviewAt?: number;
  mastered: boolean;
  /**
   * Unix ms UTC. A temporarily hidden card is still the user's data, so the
   * hide survives an export/import round trip rather than silently resetting.
   */
  hiddenUntil?: number;
}

export interface BackupReviewEntry {
  wordId: string;
  ratedAt: number;
  rating: string;
}

export interface BackupData {
  folders: BackupFolder[];
  labels: BackupLabel[];
  words: BackupWord[];
  notes: BackupNote[];
  wordLabels: BackupWordLabel[];
  learningProgress: BackupLearningProgress[];
  reviewHistory: BackupReviewEntry[];
  settings: Record<string, string>;
}

export interface BackupFile {
  kind: typeof BACKUP_FILE_KIND;
  formatVersion: number;
  /** The app's SQLite schema version at export time, for diagnostics. */
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: BackupData;
}

export type ImportMode = 'replace' | 'merge';

export interface ImportSummary {
  mode: ImportMode;
  folders: number;
  words: number;
  notes: number;
  labels: number;
  wordLabels: number;
  learningProgress: number;
  reviewHistory: number;
  settings: number;
  /** Records skipped in merge mode because that id already existed. */
  skippedExisting: number;
}
