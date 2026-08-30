import type { Folder, WordCard } from '../../types';
import { FolderWordIndex, normalizeWordKey } from './duplicates';
import type { ImportRowError, ImportedRow } from './fileImport';

export type BulkDuplicateKind = 'input' | 'existing' | null;

export interface BulkImportDraft {
  id: string;
  text: string;
  /** Set by the CSV/JSON path only. The typed path creates word-only cards. */
  meaning?: string;
  note?: string;
  /** Pre-resolved by `planFileImport`; null means "no folder". */
  folderId?: string | null;
}

export interface AnalyzedBulkImportItem extends BulkImportDraft {
  normalizedText: string;
  duplicateKind: BulkDuplicateKind;
  valid: boolean;
}

export interface BulkImportAnalysis {
  items: AnalyzedBulkImportItem[];
  validItems: AnalyzedBulkImportItem[];
  duplicateCount: number;
}

function stripCommonListMarker(line: string): string {
  return line
    .replace(/^\s*[-*•・]\s*\[\s*(?:x|X)?\s*\]\s*/u, '')
    .replace(/^\s*\d+\s*[.)]\s+/u, '')
    .replace(/^\s*[•・*]\s*/u, '')
    // Require whitespace after '-' so an actual hyphenated word is untouched.
    .replace(/^\s*-\s+/u, '');
}

export function normalizeBulkImportLine(line: string): string {
  return stripCommonListMarker(line).trim();
}

export function parseBulkImportText(input: string): BulkImportDraft[] {
  return input
    .split(/\r\n?|\n/u)
    .map(normalizeBulkImportLine)
    .filter(Boolean)
    .map((text, index) => ({ id: `bulk-line-${index}`, text }));
}

/**
 * The app's single duplicate rule, re-exported under the name this module has
 * always used so existing callers and tests keep working.
 */
export const bulkDuplicateKey = normalizeWordKey;

export function resolveBulkImportDestination(currentFolderId: string | null): string | null {
  return currentFolderId && currentFolderId.trim() ? currentFolderId : null;
}

export function analyzeBulkImport(
  drafts: readonly BulkImportDraft[],
  existingTexts: readonly string[],
): BulkImportAnalysis {
  const existingKeys = new Set(existingTexts.map(bulkDuplicateKey).filter(Boolean));
  const inputKeys = new Set<string>();
  const items = drafts.map(draft => {
    const normalizedText = draft.text.trim();
    const key = bulkDuplicateKey(normalizedText);
    let duplicateKind: BulkDuplicateKind = null;
    if (key && existingKeys.has(key)) duplicateKind = 'existing';
    else if (key && inputKeys.has(key)) duplicateKind = 'input';
    if (key) inputKeys.add(key);
    return {
      ...draft,
      normalizedText,
      duplicateKind,
      valid: Boolean(normalizedText) && duplicateKind == null,
    };
  });
  const validItems = items.filter(item => item.valid);
  return {
    items,
    validItems,
    duplicateCount: items.filter(item => item.duplicateKind != null).length,
  };
}

export interface BulkImportBatchResult {
  cards: WordCard[];
  duplicatesSkipped: number;
  invalidCount: number;
}

export interface BulkImportResult {
  added: number;
  duplicatesSkipped: number;
  failed: number;
  error?: 'destination_missing' | 'unknown';
}

/**
 * The commit step for every bulk path, typed or from a file.
 *
 * Duplicates are re-checked here rather than trusted from the preview. The
 * preview describes the library as it was when it was drawn; by the time Import
 * is tapped a word may have been added from somewhere else, and this is the last
 * point before the batch reaches state. A row that has become a duplicate is
 * dropped and counted, never written.
 */
export function createBulkImportBatch(options: {
  drafts: readonly BulkImportDraft[];
  existingCards: readonly WordCard[];
  destinationFolderId: string;
  firstCreatedAt: number;
  createId(): string;
}): BulkImportBatchResult {
  // Every folder, not just the destination: a file import can carry rows bound
  // for other folders, and each is checked against the folder it lands in.
  const index = new FolderWordIndex(options.existingCards);

  const cards: WordCard[] = [];
  let duplicatesSkipped = 0;
  let invalidCount = 0;

  for (const draft of options.drafts) {
    const word = draft.text.trim();
    if (!normalizeWordKey(word)) { invalidCount += 1; continue; }
    // A draft without its own folder belongs to the folder the import started in.
    const folderId = draft.folderId === undefined ? options.destinationFolderId : draft.folderId;
    // `add` returns false when the folder already holds the word — whether it was
    // stored before this import or added by an earlier row of it.
    if (!index.add(word, folderId)) { duplicatesSkipped += 1; continue; }

    cards.push({
      id: options.createId(),
      createdAt: options.firstCreatedAt + cards.length,
      word,
      // The typed path has only a word per line. The file path supplies these.
      meaning: draft.meaning?.trim() ?? '',
      note: draft.note?.trim() ?? '',
      ...(folderId ? { folderId } : {}),
    });
  }

  return { cards, duplicatesSkipped, invalidCount };
}

// ── CSV / JSON import ────────────────────────────────────────────────────────

export type FileImportStatus = 'valid' | 'duplicate_existing' | 'duplicate_file' | 'invalid';

export interface FileImportPlanItem {
  id: string;
  /** The row number as printed in the file, so an error can name it. */
  rowNumber: number;
  word: string;
  meaning: string;
  note: string;
  /** Where the row will actually land, after resolving any folder column. */
  folderId: string | null;
  /** The resolved folder's name, for the preview. Empty for the destination. */
  routedFolderName: string;
  status: FileImportStatus;
}

export interface FileImportPlan {
  items: FileImportPlanItem[];
  validItems: FileImportPlanItem[];
  validCount: number;
  /** Already in the destination folder, plus repeats inside the file itself. */
  duplicateCount: number;
  /** Rows the parser rejected, plus rows with no usable word. */
  invalidCount: number;
  /** Rows a `folder` column sent somewhere other than the destination. */
  routedElsewhereCount: number;
  errors: ImportRowError[];
  ignoredColumns: string[];
}

/**
 * Matches a folder column against real folders by name.
 *
 * Names are compared with the same normalisation words use, so "english" finds
 * "English". Importing never creates a folder: a name that matches nothing falls
 * back to the folder the user started the import from, which is visible in the
 * preview rather than silently deciding for them.
 */
export function resolveImportFolderId(
  folderName: string,
  folders: readonly Folder[],
  destinationFolderId: string | null,
): { folderId: string | null; routedFolderName: string } {
  const key = normalizeWordKey(folderName);
  if (!key) return { folderId: destinationFolderId, routedFolderName: '' };
  const match = folders.find(folder => normalizeWordKey(folder.name) === key);
  if (!match || match.id === destinationFolderId) {
    return { folderId: destinationFolderId, routedFolderName: '' };
  }
  return { folderId: match.id, routedFolderName: match.name };
}

export interface FileImportPlanOptions {
  rows: readonly ImportedRow[];
  errors: readonly ImportRowError[];
  ignoredColumns?: readonly string[];
  existingCards: readonly WordCard[];
  folders: readonly Folder[];
  destinationFolderId: string | null;
}

/**
 * Decides, per row, whether it will be created and where.
 *
 * Duplicates are checked against the folder each row actually lands in — both
 * against words already stored there and against earlier rows of the same file,
 * so a file that repeats a word imports it once. Nothing here mutates anything;
 * the caller shows this plan and only then builds cards from it.
 */
export function planFileImport(options: FileImportPlanOptions): FileImportPlan {
  // Two indexes, deliberately. `stored` is what the library already holds and is
  // never written to; `seen` accumulates the rows of this file. Sharing one
  // index would make the second occurrence of a word inside the file look like
  // it had been in the library all along, and the preview would say the wrong
  // thing about which one of the two is the duplicate.
  const stored = new FolderWordIndex(options.existingCards);
  const seen = new FolderWordIndex();
  const items: FileImportPlanItem[] = [];

  options.rows.forEach((row, position) => {
    const { folderId, routedFolderName } = resolveImportFolderId(
      row.folderName, options.folders, options.destinationFolderId,
    );
    const word = row.word.trim();
    const base = {
      id: `file-row-${position}`,
      rowNumber: row.rowNumber,
      word,
      meaning: row.meaning.trim(),
      note: row.note.trim(),
      folderId,
      routedFolderName,
    };

    if (!normalizeWordKey(word)) {
      items.push({ ...base, status: 'invalid' });
      return;
    }
    // Already in the folder this row is going to, before the import started.
    if (stored.has(word, folderId)) {
      items.push({ ...base, status: 'duplicate_existing' });
      return;
    }
    // `add` returns false when an earlier row of this same file already claimed
    // the word for this folder.
    items.push({ ...base, status: seen.add(word, folderId) ? 'valid' : 'duplicate_file' });
  });

  const validItems = items.filter(item => item.status === 'valid');
  return {
    items,
    validItems,
    validCount: validItems.length,
    duplicateCount: items.filter(
      item => item.status === 'duplicate_existing' || item.status === 'duplicate_file',
    ).length,
    invalidCount: items.filter(item => item.status === 'invalid').length + options.errors.length,
    routedElsewhereCount: validItems.filter(item => item.routedFolderName !== '').length,
    errors: [...options.errors],
    ignoredColumns: [...(options.ignoredColumns ?? [])],
  };
}

/**
 * Turns the accepted rows into drafts for the existing import path.
 *
 * The folder is carried per draft because a `folder` column can send rows to
 * different folders in one import.
 */
export function fileImportDrafts(plan: FileImportPlan): BulkImportDraft[] {
  return plan.validItems.map(item => ({
    id: item.id,
    text: item.word,
    meaning: item.meaning,
    note: item.note,
    folderId: item.folderId,
  }));
}

/** Guards an async Import action against rapid repeated taps. */
export class BulkImportExecutionGuard {
  private active: Promise<unknown> | null = null;

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active) return this.active as Promise<T>;
    let operationResult: Promise<T>;
    try {
      operationResult = operation();
    } catch (error) {
      return Promise.reject(error);
    }
    const request = operationResult.finally(() => {
      if (this.active === request) this.active = null;
    });
    this.active = request;
    return request;
  }
}
