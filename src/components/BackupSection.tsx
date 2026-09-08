import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import type { Palette } from '../types';
import { useLang } from '../i18n';
import {
  createBackupFile,
  pickBackupFile,
  restoreFromBackup,
  shareBackupFile,
} from '../lib/backup/backupFile';
import { BackupImportError } from '../lib/backup/importBackup';
import type { ImportMode } from '../lib/backup/format';
import { canUseBackup } from '../features/backup/backupAccess';
import { posthog } from '../config/posthog';

/**
 * Backup and restore, in Settings.
 *
 * This is the replacement for the cloud sync that used to run silently in the
 * background. Since there is no account and no server copy, a user moving to a
 * new phone has this and only this — so the destructive path is deliberately
 * slow: pick a file, choose a mode, then confirm the warning.
 */

interface Props {
  pal: Palette;
  themeColor: string;
  /**
   * Re-read cards, folders and settings from the database after an import.
   *
   * Required after **both** modes, not just `replace`. An import writes rows
   * directly to SQLite while React still holds the arrays it had beforehand,
   * and the ordinary persistence effect writes that stale array back as the
   * complete library — `syncWords` deletes every row whose id is not in it. A
   * merge that skipped this therefore looked successful, showed nothing new,
   * and lost the imported words on the next save.
   */
  onDataImported(): void;
  /** RevenueCat entitlement state. Backup is Premium-only. */
  isPremium: boolean;
  /**
   * False until RevenueCat has answered. Treated as not-entitled: an unknown
   * plan must never open a paid feature, and a stale "yes" would be worse than
   * a brief lock during launch, a restore, or an offline cache refresh.
   */
  isSubscriptionLoaded: boolean;
}

type Busy = 'export' | 'import' | null;

function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    key in values ? String(values[key]) : match);
}

export function BackupSection({
  pal,
  themeColor,
  onDataImported,
  isPremium,
  isSubscriptionLoaded,
}: Props) {
  const t = useLang();
  const [busy, setBusy] = useState<Busy>(null);

  const appVersion = Constants.expoConfig?.version ?? '0.0.0';

  // Resolved in features/backup/backupAccess.ts so the locked UI below and the
  // guard inside every handler cannot disagree about who is entitled.
  const unlocked = canUseBackup({ isPremium, isSubscriptionLoaded });

  /**
   * The single access check, called first inside every backup action.
   *
   * The section is not rendered at all for an unentitled user, so in practice
   * this never fires — which is exactly why it stays. A stale callback captured
   * before an entitlement lapsed, a queued Alert action, or any future
   * programmatic path must not be able to read or overwrite the user's data.
   */
  const ensureEntitled = useCallback((): boolean => unlocked, [unlocked]);

  const runExport = useCallback(async () => {
    if (!ensureEntitled()) return;
    if (busy !== null) return;
    setBusy('export');
    try {
      const created = await createBackupFile(appVersion);
      // Offer the share sheet immediately: a backup that never leaves the
      // device does not protect against losing the device.
      await shareBackupFile(created.uri, t('backup_share_title'));
      posthog?.capture('backup_exported', {
        word_count: created.backup.data.words.length,
        folder_count: created.backup.data.folders.length,
      });
      Alert.alert(
        t('backup_export_done'),
        fill(t('backup_export_summary'), {
          words: created.backup.data.words.length,
          folders: created.backup.data.folders.length,
        }),
      );
    } catch (error) {
      if (__DEV__) console.warn('[backup] export failed:', error instanceof Error ? error.name : 'Unknown');
      Alert.alert(t('backup'), t('backup_failed'));
    } finally {
      setBusy(null);
    }
  }, [appVersion, busy, ensureEntitled, t]);

  const applyImport = useCallback(async (raw: unknown, mode: ImportMode) => {
    // Re-checked here as well as at the entry point: this is the function that
    // writes to the database, and it is reached through two Alert callbacks
    // that the user could linger on while an entitlement expires.
    if (!ensureEntitled()) return;
    setBusy('import');
    try {
      const summary = await restoreFromBackup(raw, mode);
      // Both modes, always. The import wrote rows underneath React state, so
      // what the screens are holding no longer describes what is stored —
      // and the next ordinary save would write that stale array back as the
      // whole library, deleting everything the import just added. Replace was
      // the only mode that reloaded, which is exactly why merge lost its words.
      //
      // Started before the summary alert so the user is never told an import
      // succeeded while the app is still showing the pre-import library.
      onDataImported();
      posthog?.capture('backup_imported', {
        import_mode: mode,
        word_count: summary.words,
        folder_count: summary.folders,
      });
      Alert.alert(
        t('backup_import_done'),
        fill(t('backup_import_summary'), { words: summary.words, folders: summary.folders }),
      );
    } catch (error) {
      // The import ran in a transaction, so on any failure the database is
      // exactly as it was — worth saying plainly.
      const message = error instanceof BackupImportError ? t('backup_invalid') : t('backup_failed');
      if (__DEV__ && error instanceof BackupImportError) {
        console.warn('[backup] rejected:', error.errors.slice(0, 3));
      }
      Alert.alert(t('backup_import'), message);
    } finally {
      setBusy(null);
    }
  }, [ensureEntitled, onDataImported, t]);

  const confirmReplace = useCallback((raw: unknown) => {
    Alert.alert(
      t('backup_replace_confirm'),
      t('backup_replace_warning'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('backup_import_replace'),
          style: 'destructive',
          onPress: () => { void applyImport(raw, 'replace'); },
        },
      ],
    );
  }, [applyImport, t]);

  const runImport = useCallback(async () => {
    if (!ensureEntitled()) return;
    if (busy !== null) return;
    const picked = await pickBackupFile();
    if (picked.status === 'cancelled') return;
    if (picked.status === 'unreadable') {
      Alert.alert(t('backup_import'), t('backup_invalid'));
      return;
    }

    Alert.alert(
      t('backup_import'),
      picked.fileName,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('backup_import_merge'),
          onPress: () => { void applyImport(picked.raw, 'merge'); },
        },
        {
          text: t('backup_import_replace'),
          style: 'destructive',
          // Never goes straight through: replacement gets its own warning.
          onPress: () => confirmReplace(picked.raw),
        },
      ],
    );
  }, [applyImport, busy, confirmReplace, ensureEntitled, t]);

  // Free, loading, expired or a RevenueCat failure: render nothing. No locked
  // row, badge, description, divider or spacing — the caller renders the whole
  // section (heading included) only when this returns content.
  if (!unlocked) return null;

  const renderRow = (
    kind: Exclude<Busy, null>,
    icon: 'share-outline' | 'download-outline',
    label: string,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={busy !== null}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy !== null }}
    >
      <Ionicons name={icon} size={18} color={pal.sub} />
      <Text style={[styles.rowLabel, { color: pal.text }]}>{label}</Text>
      {busy === kind
        ? <ActivityIndicator size="small" color={themeColor} />
        : <Ionicons name="chevron-forward" size={15} color={pal.sub} />}
    </TouchableOpacity>
  );

  return (
    <View>
      {renderRow('export', 'share-outline', t('backup_export'), () => { void runExport(); })}
      {renderRow('import', 'download-outline', t('backup_import'), () => { void runImport(); })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  rowLabel: { flex: 1, fontSize: 15 },
});
