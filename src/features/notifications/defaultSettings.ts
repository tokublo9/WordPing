import type { FolderNotifSettings } from '../../types';

/**
 * A new folder starts with notifications explicitly off.
 *
 * Return a fresh object for each folder so later edits cannot accidentally
 * share notification state between folders. Existing folders are deliberately
 * never passed through this helper: their saved settings remain authoritative.
 */
export function createDefaultFolderNotifSettings(): FolderNotifSettings {
  return { intervalSeconds: 0, displayOnlyWord: false };
}
