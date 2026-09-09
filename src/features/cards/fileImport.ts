/**
 * CSV and JSON word files.
 *
 * Parsing only: this module turns a file's text into rows the existing bulk
 * import pipeline already understands, and never touches storage or the
 * network. An imported file is read from the device and stays there.
 *
 * Every failure is per-row. A malformed line costs that line and is reported
 * with its number; it never aborts the file or throws into the UI.
 *
 * Pure — no react-native or expo import — so both formats are tested directly.
 */

import {
  applyImportMapping,
  analyzeImportColumns,
  detectHeaderRole,
  validateMapping,
  MAX_IMPORT_BYTES,
  type ImportColumnAnalysis,
  type ImportFieldRole,
  type MappingValidity,
  type NormalizedImport,
} from './importMapping';

export type ImportFileFormat = 'csv' | 'json';

/** The fields a row can carry, before mapping onto the word model. */
export interface ImportedRow {
  /** 1-based, counted the way a person reads the file: the CSV header is row 1. */
  rowNumber: number;
  word: string;
  meaning: string;
  note: string;
  /** Folder name as written in the file. Resolved against real folders later. */
  folderName: string;
}

export interface ImportRowError {
  rowNumber: number;
  reason: 'missing_word' | 'malformed';
}

export interface ParsedImportFile {
  format: ImportFileFormat;
  rows: ImportedRow[];
  errors: ImportRowError[];
  /** Recognised column names this import cannot store. Reported, never guessed at. */
  ignoredColumns: string[];
}

export type ImportParseFailure =
  | 'empty_file'
  | 'invalid_json'
  | 'unsupported_shape'
  | 'no_columns'
  | 'no_rows';

export type ImportParseResult =
  | { ok: true; value: ParsedImportFile }
  | { ok: false; error: ImportParseFailure };

// ── Column aliases ───────────────────────────────────────────────────────────

/**
 * Header aliases, compared after trimming and lower-casing.
 *
 * `example` maps onto the note because the word model has no separate example
 * field — see `mergeNote`. `label` is recognised only so it can be reported as
 * ignored: `word_labels` has no producer in the app, and inventing label rows
 * during an import would persist something the rest of WordPing cannot show.
 */
const COLUMN_ALIASES: Readonly<Record<string, 'word' | 'meaning' | 'note' | 'example' | 'folder' | 'label'>> = {
  front: 'word', word: 'word', term: 'word',
  back: 'meaning', meaning: 'meaning', definition: 'meaning',
  note: 'note', notes: 'note',
  example: 'example', examplesentence: 'example', example_sentence: 'example',
  folder: 'folder', foldername: 'folder', folder_name: 'folder',
  label: 'label', labels: 'label',
};

/** Ignores case, surrounding whitespace, and a BOM on the first header cell. */
export function normalizeColumnName(raw: string): string {
  return raw.replace(/^﻿/u, '').trim().toLowerCase().replace(/[\s-]+/gu, '');
}

/**
 * Roles from `importMapping`, expressed in this module's older vocabulary.
 *
 * The two tables exist for different jobs: this one carries `folder`, `example`
 * and `label`, which are WordCore's own export columns, while `importMapping`
 * carries the far wider set of names other apps use. Consulting it second is
 * what let a file headed `FrontText,BackText,Comment` start importing without
 * changing anything about how a WordCore export is read.
 */
const ROLE_TO_COLUMN: Readonly<Record<ImportFieldRole, 'word' | 'meaning' | 'note' | null>> = {
  front: 'word', back: 'meaning', note: 'note', ignore: null,
};

export function resolveColumn(raw: string): 'word' | 'meaning' | 'note' | 'example' | 'folder' | 'label' | null {
  const normalized = normalizeColumnName(raw);
  const own = COLUMN_ALIASES[normalized] ?? COLUMN_ALIASES[normalized.replace(/_/gu, '')];
  if (own) return own;
  const role = detectHeaderRole(raw);
  return role ? ROLE_TO_COLUMN[role] : null;
}

/**
 * Puts an example sentence into the note without losing an existing note.
 *
 * The model has `word`, `meaning` and `note` and nothing else that fits, so an
 * example is appended rather than dropped or stored under an invented key.
 */
export function mergeNote(note: string, example: string): string {
  const trimmedNote = note.trim();
  const trimmedExample = example.trim();
  if (!trimmedExample) return trimmedNote;
  if (!trimmedNote) return trimmedExample;
  return `${trimmedNote}\n${trimmedExample}`;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * RFC 4180-style CSV, with the delimiter detected from the header.
 *
 * Handles quoted fields, escaped quotes (`""`), and newlines inside quotes.
 * Written as a character scanner rather than a line split precisely because a
 * quoted field may contain the delimiter or a line break.
 */
export function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 2; continue; }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === '') { inQuotes = true; index += 1; continue; }
    if (char === delimiter) { endField(); index += 1; continue; }
    if (char === '\r') {
      // Treat CRLF and a lone CR as one row break.
      endRow();
      index += text[index + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (char === '\n') { endRow(); index += 1; continue; }

    field += char;
    index += 1;
  }

  // A file that does not end with a newline still has a final row.
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

const CANDIDATE_DELIMITERS = [',', '\t', ';'] as const;

/**
 * Picks the delimiter from the header line.
 *
 * Chooses whichever candidate yields the most columns, so a comma-quoted
 * Japanese file and a tab-separated export both work without asking the user.
 */
export function detectDelimiter(text: string): string {
  const headerLine = text.split(/\r\n?|\n/u, 1)[0] ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of CANDIDATE_DELIMITERS) {
    const count = parseDelimitedRows(headerLine, candidate)[0]?.length ?? 0;
    if (count > bestCount) { best = candidate; bestCount = count; }
  }
  return best;
}

export function parseCsv(text: string): ImportParseResult {
  if (text.trim() === '') return { ok: false, error: 'empty_file' };

  const rows = parseDelimitedRows(text, detectDelimiter(text));
  const header = rows[0];
  if (!header || header.length === 0) return { ok: false, error: 'no_columns' };

  const columns = header.map(resolveColumn);
  if (!columns.includes('word')) return { ok: false, error: 'no_columns' };

  const ignoredColumns = header
    .filter((_, index) => columns[index] === 'label')
    .map(name => name.trim())
    .filter(Boolean);

  const parsedRows: ImportedRow[] = [];
  const errors: ImportRowError[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    const rowNumber = index + 1;
    // A trailing newline produces one empty cell. That is not an error to report.
    if (!cells || cells.every(cell => cell.trim() === '')) continue;

    let word = '', meaning = '', note = '', example = '', folderName = '';
    for (let column = 0; column < columns.length; column += 1) {
      const value = (cells[column] ?? '').trim();
      switch (columns[column]) {
        case 'word': if (!word) word = value; break;
        case 'meaning': if (!meaning) meaning = value; break;
        case 'note': if (!note) note = value; break;
        case 'example': if (!example) example = value; break;
        case 'folder': if (!folderName) folderName = value; break;
        // 'label' and unrecognised columns are read past deliberately.
        default: break;
      }
    }

    if (!word) { errors.push({ rowNumber, reason: 'missing_word' }); continue; }
    parsedRows.push({ rowNumber, word, meaning, note: mergeNote(note, example), folderName });
  }

  if (parsedRows.length === 0 && errors.length === 0) return { ok: false, error: 'no_rows' };
  return { ok: true, value: { format: 'csv', rows: parsedRows, errors, ignoredColumns } };
}

// ── JSON ─────────────────────────────────────────────────────────────────────

/**
 * Keys an export may wrap its array under.
 *
 * A bare array is the common case; the rest are what tools that also emit
 * metadata alongside the words use.
 */
export const JSON_LIST_KEYS = ['words', 'cards', 'items', 'entries', 'data'] as const;

/** The array of words in a parsed JSON document, or null if there is not one. */
export function readWordList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return null;
  const source = parsed as Record<string, unknown>;
  for (const key of JSON_LIST_KEYS) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

function readString(source: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    // A number is a reasonable thing to find in a hand-made file.
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

/** Matches an object's own keys against the aliases, ignoring case and spacing. */
function keysFor(source: Record<string, unknown>, target: string): string[] {
  return Object.keys(source).filter(key => resolveColumn(key) === target);
}

export function parseJson(text: string): ImportParseResult {
  if (text.trim() === '') return { ok: false, error: 'empty_file' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  const list = readWordList(parsed);
  if (list === null) return { ok: false, error: 'unsupported_shape' };

  const rows: ImportedRow[] = [];
  const errors: ImportRowError[] = [];
  const ignored = new Set<string>();

  list.forEach((entry, index) => {
    // 1-based so the reported number matches the array position a person counts.
    const rowNumber = index + 1;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push({ rowNumber, reason: 'malformed' });
      return;
    }
    const source = entry as Record<string, unknown>;
    for (const key of keysFor(source, 'label')) ignored.add(key.trim());

    const word = readString(source, keysFor(source, 'word'));
    if (!word) { errors.push({ rowNumber, reason: 'missing_word' }); return; }

    rows.push({
      rowNumber,
      word,
      meaning: readString(source, keysFor(source, 'meaning')),
      note: mergeNote(
        readString(source, keysFor(source, 'note')),
        readString(source, keysFor(source, 'example')),
      ),
      folderName: readString(source, keysFor(source, 'folder')),
    });
  });

  if (rows.length === 0 && errors.length === 0) return { ok: false, error: 'no_rows' };
  return { ok: true, value: { format: 'json', rows, errors, ignoredColumns: [...ignored] } };
}

/** Chooses the parser from the file name, falling back to sniffing the content. */
export function parseImportFile(text: string, fileName = ''): ImportParseResult {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.json')) return parseJson(text);
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return parseCsv(text);
  // No usable extension: JSON announces itself unambiguously.
  return /^\s*[[{]/u.test(text) ? parseJson(text) : parseCsv(text);
}

// ── Tabular source, for the column-mapping screen ────────────────────────────

/**
 * A file reduced to a header row and cell rows, whatever format it arrived in.
 *
 * This is what the mapping screen works from. It deliberately stops short of
 * deciding anything: no role is applied, no record is built, nothing is
 * rejected for a missing field. That all happens in `importMapping` once the
 * mapping — auto-detected or chosen by hand — is known.
 */
export interface ImportSource {
  format: ImportFileFormat;
  headers: string[];
  /** Header excluded. Rows are aligned to `headers` by index. */
  rows: string[][];
  analysis: ImportColumnAnalysis;
}

export type ImportSourceFailure = ImportParseFailure | 'file_too_large';

export type ImportSourceResult =
  | { ok: true; value: ImportSource }
  | { ok: false; error: ImportSourceFailure };

/**
 * A JSON value flattened to a cell.
 *
 * A string, number or boolean is content. An object or array is not: writing
 * one into a card yields `[object Object]`, so the cell is left empty and the
 * record fails the missing-field check rather than importing nonsense.
 */
function cellFromJsonValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return String(value);
  return '';
}

function jsonSource(text: string): ImportSourceResult {
  if (text.trim() === '') return { ok: false, error: 'empty_file' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  const list = readWordList(parsed);
  if (list === null) return { ok: false, error: 'unsupported_shape' };

  // Union of keys in first-seen order, so a file whose later entries carry an
  // extra field still offers that field for mapping.
  const headers: string[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    for (const key of Object.keys(entry as Record<string, unknown>)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  if (headers.length === 0) return { ok: false, error: 'no_columns' };

  const rows = list.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return headers.map(() => '');
    const source = entry as Record<string, unknown>;
    return headers.map(key => cellFromJsonValue(source[key]));
  });

  return { ok: true, value: { format: 'json', headers, rows, analysis: analyzeImportColumns(headers) } };
}

function csvSource(text: string): ImportSourceResult {
  if (text.trim() === '') return { ok: false, error: 'empty_file' };
  const rows = parseDelimitedRows(text, detectDelimiter(text));
  const header = rows[0];
  if (!header || header.length === 0) return { ok: false, error: 'no_columns' };
  const headers = header.map(name => name.replace(/^﻿/u, '').trim());
  return {
    ok: true,
    value: { format: 'csv', headers, rows: rows.slice(1), analysis: analyzeImportColumns(headers) },
  };
}

/**
 * Reads any supported file into the mapping screen's source table.
 *
 * Size is checked first and in characters — the file is already in memory by
 * the time this runs, so the ceiling is about what the UI can survive laying
 * out, not about the read itself.
 */
export function parseImportSource(text: string, fileName = ''): ImportSourceResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'file_too_large' };
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.json')) return jsonSource(text);
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return csvSource(text);
  return /^\s*[[{]/u.test(text) ? jsonSource(text) : csvSource(text);
}

/**
 * The whole external-file path in one call: read, detect, normalize.
 *
 * `mapping` overrides detection, which is what the mapping screen passes once
 * the user has assigned the columns. Without it the source's own proposal is
 * used — and that proposal is deliberately left *invalid* when detection was
 * ambiguous, so a caller that forgot to check `autoMappable` gets zero records
 * and a reason rather than a silent import of whichever column came first.
 */
export function normalizeImportSource(
  source: ImportSource,
  mapping: readonly ImportFieldRole[] = source.analysis.mapping,
): NormalizedImport & { validity: MappingValidity } {
  const validity = validateMapping(mapping);
  if (!validity.ok) {
    return { records: [], errors: [], skippedBlank: 0, truncated: false, validity };
  }
  return {
    ...applyImportMapping(source.rows, mapping, {
      // A CSV header occupies row 1; a JSON array's first entry is item 1.
      firstRowNumber: source.format === 'csv' ? 2 : 1,
    }),
    validity,
  };
}
