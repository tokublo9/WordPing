import type { WordCard } from '../../types';

export type BulkDuplicateKind = 'input' | 'existing' | null;

export interface BulkImportDraft {
  id: string;
  text: string;
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

export function bulkDuplicateKey(text: string): string {
  return text.trim().normalize('NFC').toLowerCase();
}

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

export function createBulkImportBatch(options: {
  drafts: readonly BulkImportDraft[];
  existingCards: readonly WordCard[];
  destinationFolderId: string;
  firstCreatedAt: number;
  createId(): string;
}): BulkImportBatchResult {
  const destinationCards = options.existingCards.filter(
    card => card.folderId === options.destinationFolderId,
  );
  const analysis = analyzeBulkImport(
    options.drafts,
    destinationCards.map(card => card.word),
  );

  // Build the complete array before state changes. If ID creation fails, no
  // partially prepared batch can reach persistence.
  const cards = analysis.validItems.map((item, index): WordCard => ({
    id: options.createId(),
    createdAt: options.firstCreatedAt + index,
    word: item.normalizedText,
    meaning: '',
    note: '',
    folderId: options.destinationFolderId,
  }));
  return {
    cards,
    duplicatesSkipped: analysis.duplicateCount,
    invalidCount: analysis.items.length - analysis.validItems.length - analysis.duplicateCount,
  };
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
