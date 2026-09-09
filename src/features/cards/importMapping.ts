/**
 * Turning someone else's vocabulary export into WordCore words.
 *
 * WHAT WAS ACTUALLY BROKEN. The CSV engine in `fileImport.ts` was already
 * correct — RFC 4180 quoting, escaped quotes, CRLF, BOM, delimiter detection
 * and line breaks inside quoted cells all worked. What failed was recognition:
 * `COLUMN_ALIASES` knew `front`/`word`/`term` and nothing else, so a file whose
 * headers read `FrontText,BackText,Comment` resolved every column to null and
 * the whole file was rejected with `no_columns`. A correct parser, refusing a
 * correct file, because of a lookup table.
 *
 * So this module is about *naming*, not parsing. It owns three things:
 *
 *  - the alias tables, widened to the words competing apps actually use;
 *  - `ImportWordRecord`, the one shape every format is converted into before
 *    anything else in the pipeline sees it;
 *  - the rule for when auto-detection must give up and ask.
 *
 * THAT LAST ONE IS THE POINT. Two columns that are equally plausible `front`
 * candidates are not resolved by picking the leftmost — that is how an import
 * silently loads the wrong column into every card, which is worse than not
 * importing at all. Ambiguity is reported so the user maps the file by hand.
 *
 * Pure — no react-native, no expo, no storage, no network. An imported file is
 * read on the device and normalized here; nothing leaves.
 */

/** The one intermediate every CSV and JSON shape becomes. */
export interface ImportWordRecord {
  front: string;
  back: string;
  note: string;
}

/** What a source column has been assigned to. `ignore` keeps it out. */
export type ImportFieldRole = 'front' | 'back' | 'note' | 'ignore';

/** The three roles a column can be mapped onto, in the order the UI lists them. */
export const IMPORT_ROLES: readonly ImportFieldRole[] = ['front', 'back', 'note', 'ignore'];

// ── Limits ───────────────────────────────────────────────────────────────────

/**
 * Ceilings, so a pathological file fails as a message rather than a freeze.
 *
 * Deliberately generous: a real vocabulary export is small, and the point is to
 * stop a 200 MB file or a runaway cell from locking the UI thread, not to
 * second-guess how many words someone has.
 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_RECORDS = 5000;
/** Matches nothing the app can usefully show; longer cells are truncated. */
export const MAX_IMPORT_CELL_LENGTH = 2000;
/** Preview stays bounded while confirmation and import still use every valid record. */
export const IMPORT_PREVIEW_LIMIT = 10;

// ── Aliases ──────────────────────────────────────────────────────────────────

/**
 * Header spellings, matched after normalization.
 *
 * Every entry is a name some export actually uses. `source`/`target` come from
 * translation tools, `question`/`answer`/`prompt` from flashcard apps,
 * `frontText`/`backText`/`comment` from the file this feature was built for.
 */
const FRONT_ALIASES = [
  'front', 'fronttext', 'frontside', 'word', 'term', 'question', 'prompt',
  'expression', 'source', 'vocabulary', 'vocab',
] as const;

const BACK_ALIASES = [
  'back', 'backtext', 'backside', 'meaning', 'definition', 'answer',
  'translation', 'target', 'reading',
] as const;

const NOTE_ALIASES = [
  'note', 'notes', 'comment', 'comments', 'memo', 'example', 'examplesentence',
  'description', 'remark', 'remarks', 'hint',
] as const;

/**
 * Header spellings that are deliberately *not* one of the three roles.
 *
 * Recognised only so auto-detection can pass over them with intent rather than
 * by accident: `frontTextLanguage` must not be mistaken for `frontText`, and a
 * tag column must not become a note. They default to `ignore` and the user can
 * still map them by hand.
 */
const KNOWN_IGNORED_ALIASES = [
  'fronttextlanguage', 'backtextlanguage', 'frontlanguage', 'backlanguage',
  'language', 'lang', 'tag', 'tags', 'label', 'labels', 'folder', 'foldername',
  'deck', 'category', 'created', 'createdat', 'updated', 'updatedat', 'id',
  'starred', 'favorite', 'favourite', 'status', 'level', 'progress',
] as const;

/**
 * Ignores case, surrounding whitespace, a BOM, and separator punctuation.
 *
 * `Front Text`, `front_text`, `front-text` and `FRONTTEXT` are the same header.
 * Only the *match* is normalized — cell contents are never altered.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/^﻿/u, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./]+/gu, '');
}

/** The role a header names on its own, or null when it names none of them. */
export function detectHeaderRole(raw: string): ImportFieldRole | null {
  const key = normalizeHeader(raw);
  if (key === '') return null;
  // Checked before the role lists, so `frontTextLanguage` cannot match `front`.
  if ((KNOWN_IGNORED_ALIASES as readonly string[]).includes(key)) return 'ignore';
  if ((FRONT_ALIASES as readonly string[]).includes(key)) return 'front';
  if ((BACK_ALIASES as readonly string[]).includes(key)) return 'back';
  if ((NOTE_ALIASES as readonly string[]).includes(key)) return 'note';
  return null;
}

// ── Detection ────────────────────────────────────────────────────────────────

export interface ImportColumn {
  /** Exactly as written in the file, for display. */
  header: string;
  index: number;
  /** What detection proposes. `null` means it could not tell. */
  detected: ImportFieldRole | null;
}

export interface ImportColumnAnalysis {
  columns: ImportColumn[];
  /** The proposed mapping, by column index. Complete only when unambiguous. */
  mapping: ImportFieldRole[];
  /**
   * True when exactly one column claimed `front` and exactly one `back`.
   *
   * The only condition under which an import may proceed without asking. Note
   * is optional and never affects it.
   */
  autoMappable: boolean;
  /** Roles claimed by more than one header, so the user must choose. */
  ambiguousRoles: ImportFieldRole[];
  /** Roles no header claimed. */
  missingRoles: ImportFieldRole[];
}

export function analyzeImportColumns(headers: readonly string[]): ImportColumnAnalysis {
  const columns: ImportColumn[] = headers.map((header, index) => ({
    header,
    index,
    detected: detectHeaderRole(header),
  }));

  const claimants = (role: ImportFieldRole) =>
    columns.filter(column => column.detected === role);

  const ambiguousRoles: ImportFieldRole[] = [];
  const missingRoles: ImportFieldRole[] = [];
  for (const role of ['front', 'back'] as const) {
    const count = claimants(role).length;
    if (count > 1) ambiguousRoles.push(role);
    if (count === 0) missingRoles.push(role);
  }
  // A second note column is not ambiguity worth stopping for — the extra one is
  // simply left ignored, and the user can reassign it.
  const autoMappable = ambiguousRoles.length === 0 && missingRoles.length === 0;

  const mapping = columns.map((column, index) => {
    if (!autoMappable) return column.detected === 'ignore' ? 'ignore' : (column.detected ?? 'ignore');
    if (column.detected === null) return 'ignore';
    if (column.detected === 'note') {
      // Only the first note column is taken, so two of them cannot both write.
      return claimants('note')[0]?.index === index ? 'note' : 'ignore';
    }
    return column.detected;
  });

  return { columns, mapping, autoMappable, ambiguousRoles, missingRoles };
}

// ── Applying a mapping ───────────────────────────────────────────────────────

export type ImportRecordIssue = 'missing_front' | 'missing_back';

export interface ImportRecordError {
  /** 1-based and counted the way a person reads the file: the header is row 1. */
  rowNumber: number;
  issue: ImportRecordIssue;
}

export interface NormalizedImport {
  records: ImportWordRecord[];
  errors: ImportRecordError[];
  /** Records dropped for being entirely blank. Not an error worth reporting. */
  skippedBlank: number;
  /** True when the file was cut off at `MAX_IMPORT_RECORDS`. */
  truncated: boolean;
}

export type MappingValidity =
  | { ok: true }
  | { ok: false; reason: 'front_missing' | 'back_missing' | 'duplicate_role' };

/**
 * A mapping is usable only with exactly one Front and one Back.
 *
 * Duplicates are rejected rather than resolved: two columns both marked Front
 * is a question, not something to answer by taking the first.
 */
export function validateMapping(mapping: readonly ImportFieldRole[]): MappingValidity {
  const count = (role: ImportFieldRole) => mapping.filter(entry => entry === role).length;
  if (count('front') > 1 || count('back') > 1 || count('note') > 1) {
    return { ok: false, reason: 'duplicate_role' };
  }
  if (count('front') === 0) return { ok: false, reason: 'front_missing' };
  if (count('back') === 0) return { ok: false, reason: 'back_missing' };
  return { ok: true };
}

/**
 * Trims the ends and caps the length, and does nothing else.
 *
 * Interior line breaks, emoji, commas and quotes are content and survive
 * untouched — a multiline cell arrives multiline. Nothing here interprets a
 * leading `=`, `+` or `@`: a cell is text, never a formula.
 */
function cleanCell(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > MAX_IMPORT_CELL_LENGTH
    ? trimmed.slice(0, MAX_IMPORT_CELL_LENGTH)
    : trimmed;
}

/**
 * Rows plus a mapping become records.
 *
 * A row shorter than the header — a malformed line — reads missing cells as
 * empty rather than borrowing from the next row, so one bad record cannot shift
 * every column after it.
 */
export function applyImportMapping(
  rows: readonly (readonly string[])[],
  mapping: readonly ImportFieldRole[],
  options: { firstRowNumber?: number } = {},
): NormalizedImport {
  const firstRowNumber = options.firstRowNumber ?? 2;
  const indexOf = (role: ImportFieldRole) => mapping.indexOf(role);
  const frontIndex = indexOf('front');
  const backIndex = indexOf('back');
  const noteIndex = indexOf('note');

  const records: ImportWordRecord[] = [];
  const errors: ImportRecordError[] = [];
  let skippedBlank = 0;
  let truncated = false;

  for (let index = 0; index < rows.length; index += 1) {
    if (records.length >= MAX_IMPORT_RECORDS) { truncated = true; break; }

    const row = rows[index] ?? [];
    const rowNumber = firstRowNumber + index;
    // Reading past the end yields '' rather than undefined, which is what keeps
    // a short row from pulling later columns out of alignment.
    const at = (position: number) => cleanCell(position >= 0 ? (row[position] ?? '') : '');

    if (row.every(cell => cell.trim() === '')) { skippedBlank += 1; continue; }

    const front = at(frontIndex);
    const back = at(backIndex);
    if (!front) { errors.push({ rowNumber, issue: 'missing_front' }); continue; }
    if (!back) { errors.push({ rowNumber, issue: 'missing_back' }); continue; }

    records.push({ front, back, note: at(noteIndex) });
  }

  return { records, errors, skippedBlank, truncated };
}

/** The first ten records, for the preview. Content is shown as it will import. */
export function previewRecords(
  records: readonly ImportWordRecord[],
  count = IMPORT_PREVIEW_LIMIT,
): ImportWordRecord[] {
  return records.slice(0, Math.max(0, count));
}
