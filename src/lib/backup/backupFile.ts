import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { runExclusive } from '../db';
import { getDatabase } from '../sqlite/database';
import { exportBackup, serializeBackup } from './exportBackup';
import { importBackup } from './importBackup';
import type { BackupFile, ImportMode, ImportSummary } from './format';

/**
 * The device-facing half of backup and restore.
 *
 * Kept separate from the pure export/import logic so that the interesting parts
 * — serialisation, validation, transactional apply — stay testable outside
 * React Native. This file only moves bytes between the database and the file
 * system.
 */

const BACKUP_DIRECTORY = 'backups';

/** Paths.document, not Paths.cache: a backup must survive a low-storage sweep. */
function backupDirectory(): Directory {
  const directory = new Directory(Paths.document, BACKUP_DIRECTORY);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function backupFileName(exportedAt: string): string {
  // 2026-08-19T09-30-00 — filesystem-safe and sorts chronologically.
  const stamp = exportedAt.replace(/\.\d+Z$/u, '').replace(/:/gu, '-');
  return `wordping-backup-${stamp}.json`;
}

export interface CreatedBackup {
  uri: string;
  fileName: string;
  backup: BackupFile;
  byteSize: number;
}

/** Writes a backup of the current database and returns its location. */
export async function createBackupFile(appVersion: string): Promise<CreatedBackup> {
  const db = await getDatabase();
  const backup = await exportBackup(db, { appVersion });
  const serialized = serializeBackup(backup);

  const fileName = backupFileName(backup.exportedAt);
  const file = new File(backupDirectory(), fileName);
  file.create({ overwrite: true });
  file.write(serialized);

  return { uri: file.uri, fileName, backup, byteSize: serialized.length };
}

/** Opens the system share sheet so the user can move the file off the device. */
export async function shareBackupFile(uri: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Save your WordCore backup',
    UTI: 'public.json',
  });
  return true;
}

export type PickedBackup =
  | { status: 'cancelled' }
  | { status: 'unreadable' }
  | { status: 'picked'; raw: unknown; fileName: string };

/**
 * Lets the user choose a backup file and parses it.
 *
 * Only parses — validation and the decision to write happen later, so the UI
 * can show what is about to change before anything is committed.
 */
export async function pickBackupFile(): Promise<PickedBackup> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return { status: 'cancelled' };

  const asset = result.assets[0];
  if (!asset) return { status: 'unreadable' };

  try {
    const contents = await new File(asset.uri).text();
    return { status: 'picked', raw: JSON.parse(contents), fileName: asset.name };
  } catch {
    // Unreadable or not JSON at all. Reported as a distinct outcome so the UI
    // can say "this file isn't a backup" rather than "import failed".
    return { status: 'unreadable' };
  }
}

/**
 * Applies a previously picked backup.
 *
 * `replace` discards everything currently on the device — the caller is
 * responsible for confirming that with the user first.
 */
export async function restoreFromBackup(
  raw: unknown,
  mode: ImportMode,
  options: { importSettings?: boolean } = {},
): Promise<ImportSummary> {
  const db = await getDatabase();
  // Exclusive: a pending card write queued just before the import would
  // otherwise flush on top of the restored rows and undo them.
  return runExclusive(() => importBackup(db, raw, {
    mode,
    ...(options.importSettings !== undefined ? { importSettings: options.importSettings } : {}),
  }));
}

/** Backups previously written by this device, newest first. */
export function listLocalBackups(): { uri: string; fileName: string }[] {
  const directory = new Directory(Paths.document, BACKUP_DIRECTORY);
  if (!directory.exists) return [];
  return directory
    .list()
    .flatMap(entry => (entry instanceof File && entry.name.endsWith('.json')
      ? [{ uri: entry.uri, fileName: entry.name }]
      : []))
    .sort((a, b) => b.fileName.localeCompare(a.fileName));
}
