import {
  EXPORTABLE_SETTING_KEYS,
  type BackupFile, type BackupWord, type ImportMode, type ImportSummary,
} from './format';
import { validateBackup, type ValidationResult } from './validate';
import type { SqlDatabase } from '../sqlite/types';

/**
 * Applies a backup to the database.
 *
 * The whole import happens inside one transaction. If any statement fails —
 * a constraint violation, a disk error, anything — the transaction rolls back
 * and the user's existing vocabulary is exactly as it was. There is no partial
 * import state to recover from.
 */

export class BackupImportError extends Error {
  constructor(readonly errors: string[]) {
    super('backup_invalid');
    this.name = 'BackupImportError';
  }
}

/**
 * Whether a backed-up word belongs on its folder's notification list.
 *
 * Two eras of file reach this. A current one carries `notifCandidate` and is
 * taken at its word. An older one carries only `notifOff`, the mute this
 * replaced, and is converted with the same rule schema migration 4 applied on
 * the device: a word that was not muted was notifying, so it becomes a
 * candidate. Restoring an old backup therefore reproduces the reminders it was
 * taken with rather than silently arriving with an empty list.
 *
 * A file from before either field existed has neither, and its words start off
 * the list — the same default a newly registered word gets.
 */
function backupWordIsNotifCandidate(word: BackupWord): boolean {
  if (word.notifCandidate !== undefined) return word.notifCandidate === true;
  if (word.notifOff !== undefined) return word.notifOff !== true;
  return false;
}

/** Tables cleared by a `replace` import, in foreign-key-safe order. */
const REPLACEABLE_TABLES = [
  'review_history',
  'learning_progress',
  'word_labels',
  'notes',
  'words',
  'folders',
] as const;

async function existingIds(db: SqlDatabase, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table}`);
  return new Set(rows.map(row => row.id));
}

async function maxPosition(db: SqlDatabase, table: string): Promise<number> {
  const row = await db.getFirstAsync<{ value: number | null }>(
    `SELECT MAX(position) AS value FROM ${table}`,
  );
  return row?.value ?? -1;
}

export interface ImportOptions {
  mode: ImportMode;
  /**
   * When false, settings in the backup are ignored and only vocabulary is
   * imported. Useful for merging someone else's word list without inheriting
   * their theme and language.
   */
  importSettings?: boolean;
}

/**
 * Validates and applies a backup.
 *
 * Validation runs to completion first and throws before the transaction opens,
 * so a malformed file never begins a write at all.
 */
export async function importBackup(
  db: SqlDatabase,
  raw: unknown,
  options: ImportOptions,
): Promise<ImportSummary> {
  const validation: ValidationResult = validateBackup(raw);
  if (!validation.ok) throw new BackupImportError(validation.errors);

  return applyBackup(db, validation.backup, options);
}

async function applyBackup(
  db: SqlDatabase,
  backup: BackupFile,
  options: ImportOptions,
): Promise<ImportSummary> {
  const { mode } = options;
  const importSettings = options.importSettings ?? true;
  const summary: ImportSummary = {
    mode,
    folders: 0, words: 0, notes: 0, labels: 0, wordLabels: 0,
    learningProgress: 0, reviewHistory: 0, settings: 0, skippedExisting: 0,
  };

  await db.withTransactionAsync(async () => {
    if (mode === 'replace') {
      for (const table of REPLACEABLE_TABLES) await db.runAsync(`DELETE FROM ${table}`);
    }

    // In merge mode an id already present belongs to the user's current data and
    // wins; the backup's version is skipped rather than silently overwriting an
    // edit they made after taking the backup.
    const keptFolderIds = mode === 'merge' ? await existingIds(db, 'folders') : new Set<string>();
    const keptWordIds = mode === 'merge' ? await existingIds(db, 'words') : new Set<string>();
    const folderOffset = mode === 'merge' ? (await maxPosition(db, 'folders')) + 1 : 0;
    const wordOffset = mode === 'merge' ? (await maxPosition(db, 'words')) + 1 : 0;

    // Labels first: words and progress reference them.
    for (const label of backup.data.labels) {
      // The four built-in level labels are seeded by the schema migration, so
      // this is an upsert of names/colours rather than a fresh insert.
      await db.runAsync(
        `INSERT INTO labels (id, name, kind, color, position) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, kind = excluded.kind,
           color = excluded.color, position = excluded.position`,
        [label.id, label.name, label.kind, label.color ?? null, label.position],
      );
      summary.labels += 1;
    }

    for (const folder of backup.data.folders) {
      if (keptFolderIds.has(folder.id)) {
        summary.skippedExisting += 1;
        continue;
      }
      await db.runAsync(
        `INSERT INTO folders (id, name, created_at, icon, color,
                              notif_interval_seconds, notif_display_only_word,
                              notif_notify_all_words, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          folder.id, folder.name, folder.createdAt,
          folder.icon ?? null, folder.color ?? null,
          folder.notifIntervalSeconds ?? null,
          folder.notifDisplayOnlyWord === undefined ? null : folder.notifDisplayOnlyWord ? 1 : 0,
          // Absent in a backup written before the field existed: off, so the
          // folder's candidate list applies.
          folder.notifNotifyAllWords === true ? 1 : 0,
          folder.position + folderOffset,
        ],
      );
      summary.folders += 1;
    }

    // A word whose folder was skipped as already-existing still belongs in that
    // folder: the id is the same on both sides, so the reference stays valid.
    const availableFolderIds = await existingIds(db, 'folders');
    const importedWordIds = new Set<string>();

    for (const word of backup.data.words) {
      if (keptWordIds.has(word.id)) {
        summary.skippedExisting += 1;
        continue;
      }
      const folderId = word.folderId !== undefined && availableFolderIds.has(word.folderId)
        ? word.folderId
        : null;
      await db.runAsync(
        `INSERT INTO words (id, folder_id, word, meaning, created_at, position, notif_candidate,
                            word_lang, meaning_lang, audio_uri, audio_speed, audio_volume,
                            hide_word)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          word.id, folderId, word.word, word.meaning, word.createdAt ?? null,
          word.position + wordOffset, backupWordIsNotifCandidate(word) ? 1 : 0,
          word.wordLang ?? null, word.meaningLang ?? null,
          word.audioSpeed ?? null, word.audioVolume ?? null,
          // Absent in a backup written before the field existed: visible.
          word.hideWord === true ? 1 : 0,
        ],
      );
      importedWordIds.add(word.id);
      summary.words += 1;
    }

    for (const note of backup.data.notes) {
      if (!importedWordIds.has(note.wordId)) continue;
      await db.runAsync('INSERT INTO notes (word_id, body) VALUES (?, ?)', [note.wordId, note.body]);
      summary.notes += 1;
    }

    for (const link of backup.data.wordLabels) {
      if (!importedWordIds.has(link.wordId)) continue;
      await db.runAsync(
        'INSERT OR IGNORE INTO word_labels (word_id, label_id) VALUES (?, ?)',
        [link.wordId, link.labelId],
      );
      summary.wordLabels += 1;
    }

    for (const entry of backup.data.learningProgress) {
      if (!importedWordIds.has(entry.wordId)) continue;
      await db.runAsync(
        `INSERT INTO learning_progress (word_id, level_id, next_review_at, mastered, hidden_until)
         VALUES (?, ?, ?, ?, ?)`,
        [
          entry.wordId, entry.levelId ?? null, entry.nextReviewAt ?? null,
          entry.mastered ? 1 : 0, entry.hiddenUntil ?? null,
        ],
      );
      summary.learningProgress += 1;
    }

    for (const review of backup.data.reviewHistory) {
      if (!importedWordIds.has(review.wordId)) continue;
      await db.runAsync(
        'INSERT INTO review_history (word_id, rated_at, rating) VALUES (?, ?, ?)',
        [review.wordId, review.ratedAt, review.rating],
      );
      summary.reviewHistory += 1;
    }

    if (importSettings) {
      for (const [key, value] of Object.entries(backup.data.settings)) {
        // Second gate, independent of what the exporter chose to write: a
        // hand-edited backup cannot inject an arbitrary settings key.
        if (!EXPORTABLE_SETTING_KEYS.includes(key)) continue;
        await db.runAsync(
          `INSERT INTO app_settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, value],
        );
        summary.settings += 1;
      }
    }
  });

  return summary;
}
