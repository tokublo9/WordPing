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

export function resolveColumn(raw: string): 'word' | 'meaning' | 'note' | 'example' | 'folder' | 'label' | null {
  const normalized = normalizeColumnName(raw);
  return COLUMN_ALIASES[normalized] ?? COLUMN_ALIASES[normalized.replace(/_/gu, '')] ?? null;
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

  // Either a bare array of words, or an object wrapping one under `words`.
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { words?: unknown }).words)
      ? (parsed as { words: unknown[] }).words
      : null;
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
