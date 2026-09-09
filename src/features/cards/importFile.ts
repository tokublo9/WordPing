import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  parseImportFile,
  parseImportSource,
  type ImportParseResult,
  type ImportSourceResult,
} from './fileImport';

/**
 * The device-facing half of CSV / JSON word import.
 *
 * Kept apart from `fileImport.ts` so the parsing stays testable outside React
 * Native, exactly as `backup/backupFile.ts` is kept apart from the backup
 * validation. This module only reads a file the user picked; the chosen file is
 * never uploaded, copied off the device, or sent to any service.
 */

export type PickedImportFile =
  | { status: 'cancelled' }
  | { status: 'unreadable' }
  | {
    status: 'picked';
    fileName: string;
    /** Source table retained for live mapping without reading the file again. */
    result: ImportSourceResult;
    /** Existing compatible parse, created only when detection is unambiguous. */
    compatibleResult: ImportParseResult | null;
  };

/**
 * Lets the user choose a word file and parses it locally.
 *
 * Parsing only — nothing is written. The caller shows the resulting plan and
 * waits for a confirmation before any card is created.
 */
export async function pickWordImportFile(): Promise<PickedImportFile> {
  const picked = await DocumentPicker.getDocumentAsync({
    // A generous list: exporters label CSV inconsistently (text/csv,
    // application/vnd.ms-excel, or nothing at all), so the extension and the
    // content decide the format rather than the reported MIME type.
    type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text',
      'application/json', 'public.json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled) return { status: 'cancelled' };

  const asset = picked.assets[0];
  if (!asset) return { status: 'unreadable' };

  try {
    const contents = await new File(asset.uri).text();
    const result = parseImportSource(contents, asset.name);
    return {
      status: 'picked',
      fileName: asset.name,
      result,
      // Preserve the established file-import shape and folder-column behavior
      // for files that never need the mapping screen. An ambiguous file never
      // enters that permissive legacy path.
      compatibleResult: result.ok && result.value.analysis.autoMappable
        ? parseImportFile(contents, asset.name)
        : null,
    };
  } catch {
    // The file could not be read at all — distinct from "read but malformed",
    // which comes back inside `result` with a reason the UI can name.
    return { status: 'unreadable' };
  }
}
