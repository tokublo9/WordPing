import { CURRENT_SCHEMA_VERSION } from '../sqlite/schema';
import type { SqlDatabase } from '../sqlite/types';
import {
  BACKUP_FILE_KIND,
  BACKUP_FORMAT_VERSION,
  EXPORTABLE_SETTING_KEYS,
  type BackupFile,
  type BackupFolder,
  type BackupLabel,
  type BackupLearningProgress,
  type BackupNote,
  type BackupReviewEntry,
  type BackupWord,
  type BackupWordLabel,
} from './format';

/**
 * Reads the database into a portable backup document.
 *
 * Queries are written column-by-column rather than `SELECT *` so that adding a
 * column to the schema never silently starts exporting it — anything new has to
 * be added here deliberately, which is the check that keeps device-local and
 * credential-like values out of a file the user will email to themselves.
 */

interface FolderRow {
  id: string; name: string; created_at: number; position: number;
  icon: string | null; color: string | null;
  notif_interval_seconds: number | null; notif_display_only_word: number | null;
}

interface LabelRow {
  id: string; name: string; kind: string; position: number; color: string | null;
}

interface WordRow {
  id: string; word: string; meaning: string; position: number;
  folder_id: string | null; created_at: number | null; notif_off: number;
  word_lang: string | null; meaning_lang: string | null;
  audio_speed: number | null; audio_volume: number | null;
  hide_word: number;
}

interface NoteRow { word_id: string; body: string }
interface WordLabelRow { word_id: string; label_id: string }
interface ProgressRow {
  word_id: string; level_id: string | null; next_review_at: number | null;
  mastered: number; hidden_until: number | null;
}
interface ReviewRow { word_id: string; rated_at: number; rating: string }
interface SettingRow { key: string; value: string }

function toFolder(row: FolderRow): BackupFolder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    position: row.position,
    ...(row.icon !== null ? { icon: row.icon } : {}),
    ...(row.color !== null ? { color: row.color } : {}),
    ...(row.notif_interval_seconds !== null ? { notifIntervalSeconds: row.notif_interval_seconds } : {}),
    ...(row.notif_display_only_word !== null
      ? { notifDisplayOnlyWord: row.notif_display_only_word === 1 }
      : {}),
  };
}

function toWord(row: WordRow): BackupWord {
  return {
    id: row.id,
    word: row.word,
    meaning: row.meaning,
    position: row.position,
    ...(row.folder_id !== null ? { folderId: row.folder_id } : {}),
    ...(row.created_at !== null ? { createdAt: row.created_at } : {}),
    ...(row.notif_off === 1 ? { notifOff: true } : {}),
    ...(row.word_lang !== null ? { wordLang: row.word_lang } : {}),
    ...(row.meaning_lang !== null ? { meaningLang: row.meaning_lang } : {}),
    ...(row.audio_speed !== null ? { audioSpeed: row.audio_speed } : {}),
    ...(row.audio_volume !== null ? { audioVolume: row.audio_volume } : {}),
    ...(row.hide_word === 1 ? { hideWord: true } : {}),
  };
}

export interface ExportOptions {
  appVersion: string;
  /** Injectable for deterministic tests. */
  now?: () => Date;
}

export async function exportBackup(db: SqlDatabase, options: ExportOptions): Promise<BackupFile> {
  const [folders, labels, words, notes, wordLabels, progress, reviews, settingRows] = await Promise.all([
    db.getAllAsync<FolderRow>(
      `SELECT id, name, created_at, position, icon, color,
              notif_interval_seconds, notif_display_only_word
         FROM folders ORDER BY position ASC`,
    ),
    db.getAllAsync<LabelRow>('SELECT id, name, kind, position, color FROM labels ORDER BY position ASC'),
    db.getAllAsync<WordRow>(
      `SELECT id, word, meaning, position, folder_id, created_at, notif_off,
              word_lang, meaning_lang, audio_speed, audio_volume, hide_word
         FROM words ORDER BY position ASC`,
    ),
    db.getAllAsync<NoteRow>('SELECT word_id, body FROM notes ORDER BY word_id ASC'),
    db.getAllAsync<WordLabelRow>('SELECT word_id, label_id FROM word_labels ORDER BY word_id ASC, label_id ASC'),
    db.getAllAsync<ProgressRow>(
      'SELECT word_id, level_id, next_review_at, mastered, hidden_until FROM learning_progress ORDER BY word_id ASC',
    ),
    db.getAllAsync<ReviewRow>(
      'SELECT word_id, rated_at, rating FROM review_history ORDER BY word_id ASC, rated_at ASC, id ASC',
    ),
    db.getAllAsync<SettingRow>('SELECT key, value FROM app_settings'),
  ]);

  const exportableSettings: Record<string, string> = {};
  for (const row of settingRows) {
    // Allowlist. Markers, the first-launch flag and anything added later stay behind.
    if (EXPORTABLE_SETTING_KEYS.includes(row.key)) exportableSettings[row.key] = row.value;
  }

  const backupLabels: BackupLabel[] = labels.map(row => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    position: row.position,
    ...(row.color !== null ? { color: row.color } : {}),
  }));

  const backupNotes: BackupNote[] = notes.map(row => ({ wordId: row.word_id, body: row.body }));
  const backupWordLabels: BackupWordLabel[] = wordLabels.map(row => ({
    wordId: row.word_id, labelId: row.label_id,
  }));
  const backupProgress: BackupLearningProgress[] = progress.map(row => ({
    wordId: row.word_id,
    ...(row.level_id !== null ? { levelId: row.level_id } : {}),
    ...(row.next_review_at !== null ? { nextReviewAt: row.next_review_at } : {}),
    ...(row.hidden_until !== null ? { hiddenUntil: row.hidden_until } : {}),
    mastered: row.mastered === 1,
  }));
  const backupReviews: BackupReviewEntry[] = reviews.map(row => ({
    wordId: row.word_id, ratedAt: row.rated_at, rating: row.rating,
  }));

  return {
    kind: BACKUP_FILE_KIND,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: options.appVersion,
    exportedAt: (options.now?.() ?? new Date()).toISOString(),
    data: {
      folders: folders.map(toFolder),
      labels: backupLabels,
      words: words.map(toWord),
      notes: backupNotes,
      wordLabels: backupWordLabels,
      learningProgress: backupProgress,
      reviewHistory: backupReviews,
      settings: exportableSettings,
    },
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}
