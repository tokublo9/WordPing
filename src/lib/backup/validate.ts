import {
  BACKUP_FILE_KIND,
  SUPPORTED_FORMAT_VERSIONS,
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
 * Whole-file validation, run to completion before the database is touched.
 *
 * A backup is untrusted input: it may come from a different app version, a
 * truncated download, or a hand-edited file. Every problem found is collected
 * rather than thrown on first sight, so the user gets one useful message
 * instead of discovering faults one import at a time.
 */

export type ValidationResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; errors: string[] };

const MAX_ERRORS = 20;

class Errors {
  readonly list: string[] = [];

  add(message: string): void {
    if (this.list.length < MAX_ERRORS) this.list.push(message);
  }

  get failed(): boolean {
    return this.list.length > 0;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optional<T>(value: unknown, check: (value: unknown) => value is T): boolean {
  return value === undefined || check(value);
}

function readArray(source: Record<string, unknown>, key: string, errors: Errors): unknown[] {
  const value = source[key];
  if (value === undefined) {
    errors.add(`data.${key} is missing`);
    return [];
  }
  if (!Array.isArray(value)) {
    errors.add(`data.${key} must be an array`);
    return [];
  }
  return value;
}

function parseFolders(raw: unknown[], errors: Errors): BackupFolder[] {
  return raw.flatMap((entry, index) => {
    const at = `data.folders[${index}]`;
    if (!isRecord(entry)) {
      errors.add(`${at} must be an object`);
      return [];
    }
    if (!nonEmptyString(entry.id)) errors.add(`${at}.id must be a non-empty string`);
    if (typeof entry.name !== 'string') errors.add(`${at}.name must be a string`);
    if (!finiteNumber(entry.createdAt)) errors.add(`${at}.createdAt must be a number`);
    if (!finiteNumber(entry.position)) errors.add(`${at}.position must be a number`);
    if (!optional(entry.icon, nonEmptyString)) errors.add(`${at}.icon must be a string`);
    if (!optional(entry.color, nonEmptyString)) errors.add(`${at}.color must be a string`);
    if (!optional(entry.notifIntervalSeconds, finiteNumber)) errors.add(`${at}.notifIntervalSeconds must be a number`);
    if (entry.notifDisplayOnlyWord !== undefined && typeof entry.notifDisplayOnlyWord !== 'boolean') {
      errors.add(`${at}.notifDisplayOnlyWord must be a boolean`);
    }
    return errors.failed ? [] : [entry as unknown as BackupFolder];
  });
}

function parseLabels(raw: unknown[], errors: Errors): BackupLabel[] {
  return raw.flatMap((entry, index) => {
    const at = `data.labels[${index}]`;
    if (!isRecord(entry)) {
      errors.add(`${at} must be an object`);
      return [];
    }
    if (!nonEmptyString(entry.id)) errors.add(`${at}.id must be a non-empty string`);
    if (typeof entry.name !== 'string') errors.add(`${at}.name must be a string`);
    if (!nonEmptyString(entry.kind)) errors.add(`${at}.kind must be a non-empty string`);
    if (!finiteNumber(entry.position)) errors.add(`${at}.position must be a number`);
    return errors.failed ? [] : [entry as unknown as BackupLabel];
  });
}

const VALID_RATINGS: ReadonlySet<string> = new Set(['perfect', 'good', 'slightly', 'unknown']);

function parseWords(raw: unknown[], errors: Errors): BackupWord[] {
  return raw.flatMap((entry, index) => {
    const at = `data.words[${index}]`;
    if (!isRecord(entry)) {
      errors.add(`${at} must be an object`);
      return [];
    }
    if (!nonEmptyString(entry.id)) errors.add(`${at}.id must be a non-empty string`);
    if (typeof entry.word !== 'string') errors.add(`${at}.word must be a string`);
    if (typeof entry.meaning !== 'string') errors.add(`${at}.meaning must be a string`);
    if (!finiteNumber(entry.position)) errors.add(`${at}.position must be a number`);
    if (!optional(entry.folderId, nonEmptyString)) errors.add(`${at}.folderId must be a string`);
    if (!optional(entry.createdAt, finiteNumber)) errors.add(`${at}.createdAt must be a number`);
    if (entry.notifOff !== undefined && typeof entry.notifOff !== 'boolean') {
      errors.add(`${at}.notifOff must be a boolean`);
    }
    if (!optional(entry.wordLang, nonEmptyString)) errors.add(`${at}.wordLang must be a string`);
    if (!optional(entry.meaningLang, nonEmptyString)) errors.add(`${at}.meaningLang must be a string`);
    if (!optional(entry.audioSpeed, finiteNumber)) errors.add(`${at}.audioSpeed must be a number`);
    if (!optional(entry.audioVolume, finiteNumber)) errors.add(`${at}.audioVolume must be a number`);
    if (entry.hideWord !== undefined && typeof entry.hideWord !== 'boolean') {
      errors.add(`${at}.hideWord must be a boolean`);
    }
    return errors.failed ? [] : [entry as unknown as BackupWord];
  });
}

function parseNotes(raw: unknown[], errors: Errors): BackupNote[] {
  return raw.flatMap((entry, index) => {
    const at = `data.notes[${index}]`;
    if (!isRecord(entry)) {
      errors.add(`${at} must be an object`);
      return [];
    }
    if (!nonEmptyString(entry.wordId)) errors.add(`${at}.wordId must be a non-empty string`);
    if (typeof entry.body !== 'string') errors.add(`${at}.body must be a string`);
    return errors.failed ? [] : [entry as unknown as BackupNote];
  });
}

function parseWordLabels(raw: unknown[], errors: Errors): BackupWordLabel[] {
  return raw.flatMap((entry, index) => {
    const at = `data.wordLabels[${index}]`;
    if (!isRecord(entry)) {
      errors.add(`${at} must be an object`);
      return [];
    }
    if (!nonEmptyString(entry.wordId)) errors.add(`${at}.wordId must be a non-empty string`);
    if (!nonEmptyString(entry.labelId)) errors.add(`${at}.labelId must be a non-empty string`);
    return errors.failed ? [] : [entry as unknown as BackupWordLabel];
  });
}

function parseProgress(raw: unknown[], errors: Errors): BackupLearningProgress[] {
  return raw.flatMap((entry, index) => {
    const at = `data.learningProgress[${index}]`;
    if (!isRecord(entry)) {
      errors.add(`${at} must be an object`);
      return [];
    }
    if (!nonEmptyString(entry.wordId)) errors.add(`${at}.wordId must be a non-empty string`);
    if (!optional(entry.levelId, nonEmptyString)) errors.add(`${at}.levelId must be a string`);
    if (!optional(entry.nextReviewAt, finiteNumber)) errors.add(`${at}.nextReviewAt must be a number`);
    if (!optional(entry.hiddenUntil, finiteNumber)) errors.add(`${at}.hiddenUntil must be a number`);
    if (typeof entry.mastered !== 'boolean') errors.add(`${at}.mastered must be a boolean`);
    return errors.failed ? [] : [entry as unknown as BackupLearningProgress];
  });
}

function parseReviews(raw: unknown[], errors: Errors): BackupReviewEntry[] {
  return raw.flatMap((entry, index) => {
    const at = `data.reviewHistory[${index}]`;
    if (!isRecord(entry)) {
      errors.add(`${at} must be an object`);
      return [];
    }
    if (!nonEmptyString(entry.wordId)) errors.add(`${at}.wordId must be a non-empty string`);
    if (!finiteNumber(entry.ratedAt)) errors.add(`${at}.ratedAt must be a number`);
    if (!nonEmptyString(entry.rating) || !VALID_RATINGS.has(entry.rating)) {
      errors.add(`${at}.rating must be one of perfect, good, slightly, unknown`);
    }
    return errors.failed ? [] : [entry as unknown as BackupReviewEntry];
  });
}

function parseSettings(value: unknown, errors: Errors): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    errors.add('data.settings must be an object');
    return {};
  }
  const settings: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      errors.add(`data.settings.${key} must be a string`);
      continue;
    }
    settings[key] = entry;
  }
  return settings;
}

function checkUniqueIds(items: readonly { id: string }[], label: string, errors: Errors): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) errors.add(`${label} contains a duplicate id: ${item.id}`);
    seen.add(item.id);
  }
}

/**
 * Cross-table checks. A backup whose words point at folders it does not contain
 * would silently lose those relationships on import, so it is rejected instead.
 */
function checkRelationships(
  folders: readonly BackupFolder[],
  labels: readonly BackupLabel[],
  words: readonly BackupWord[],
  notes: readonly BackupNote[],
  wordLabels: readonly BackupWordLabel[],
  progress: readonly BackupLearningProgress[],
  reviews: readonly BackupReviewEntry[],
  errors: Errors,
): void {
  const folderIds = new Set(folders.map(folder => folder.id));
  const labelIds = new Set(labels.map(label => label.id));
  const wordIds = new Set(words.map(word => word.id));

  for (const word of words) {
    if (word.folderId !== undefined && !folderIds.has(word.folderId)) {
      errors.add(`word ${word.id} references a folder that is not in the backup: ${word.folderId}`);
    }
  }
  for (const note of notes) {
    if (!wordIds.has(note.wordId)) errors.add(`note references a missing word: ${note.wordId}`);
  }
  for (const link of wordLabels) {
    if (!wordIds.has(link.wordId)) errors.add(`wordLabel references a missing word: ${link.wordId}`);
    if (!labelIds.has(link.labelId)) errors.add(`wordLabel references a missing label: ${link.labelId}`);
  }
  for (const entry of progress) {
    if (!wordIds.has(entry.wordId)) errors.add(`learningProgress references a missing word: ${entry.wordId}`);
    if (entry.levelId !== undefined && !labelIds.has(entry.levelId)) {
      errors.add(`learningProgress references a missing label: ${entry.levelId}`);
    }
  }
  for (const review of reviews) {
    if (!wordIds.has(review.wordId)) errors.add(`reviewHistory references a missing word: ${review.wordId}`);
  }
}

export function validateBackup(value: unknown): ValidationResult {
  const errors = new Errors();

  if (!isRecord(value)) return { ok: false, errors: ['The file is not a JSON object.'] };
  if (value.kind !== BACKUP_FILE_KIND) {
    return { ok: false, errors: ['This is not a WordPing backup file.'] };
  }
  if (!finiteNumber(value.formatVersion)) {
    return { ok: false, errors: ['The backup does not declare a format version.'] };
  }
  if (!SUPPORTED_FORMAT_VERSIONS.includes(value.formatVersion)) {
    return {
      ok: false,
      errors: [
        `Backup format version ${value.formatVersion} is not supported by this version of WordPing ` +
        `(supported: ${SUPPORTED_FORMAT_VERSIONS.join(', ')}).`,
      ],
    };
  }
  if (!isRecord(value.data)) return { ok: false, errors: ['The backup has no data section.'] };

  if (!finiteNumber(value.schemaVersion)) errors.add('schemaVersion must be a number');
  if (!nonEmptyString(value.exportedAt)) errors.add('exportedAt must be a non-empty string');
  if (!nonEmptyString(value.appVersion)) errors.add('appVersion must be a non-empty string');

  const data = value.data;
  const folders = parseFolders(readArray(data, 'folders', errors), errors);
  const labels = parseLabels(readArray(data, 'labels', errors), errors);
  const words = parseWords(readArray(data, 'words', errors), errors);
  const notes = parseNotes(readArray(data, 'notes', errors), errors);
  const wordLabels = parseWordLabels(readArray(data, 'wordLabels', errors), errors);
  const learningProgress = parseProgress(readArray(data, 'learningProgress', errors), errors);
  const reviewHistory = parseReviews(readArray(data, 'reviewHistory', errors), errors);
  const settings = parseSettings(data.settings, errors);

  if (!errors.failed) {
    checkUniqueIds(folders, 'data.folders', errors);
    checkUniqueIds(labels, 'data.labels', errors);
    checkUniqueIds(words, 'data.words', errors);
    checkRelationships(folders, labels, words, notes, wordLabels, learningProgress, reviewHistory, errors);
  }

  if (errors.failed) return { ok: false, errors: errors.list };

  return {
    ok: true,
    backup: {
      kind: BACKUP_FILE_KIND,
      formatVersion: value.formatVersion,
      schemaVersion: value.schemaVersion as number,
      appVersion: value.appVersion as string,
      exportedAt: value.exportedAt as string,
      data: { folders, labels, words, notes, wordLabels, learningProgress, reviewHistory, settings },
    },
  };
}
