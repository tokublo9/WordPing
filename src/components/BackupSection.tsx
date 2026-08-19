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
  /** Reload cards and folders from the database after an import replaces them. */
  onDataReplaced(): void;
}

type Busy = 'export' | 'import' | null;

function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    key in values ? String(values[key]) : match);
}

export function BackupSection({ pal, themeColor, onDataReplaced }: Props) {
  const t = useLang();
  const [busy, setBusy] = useState<Busy>(null);

  const appVersion = Constants.expoConfig?.version ?? '0.0.0';

  const runExport = useCallback(async () => {
    if (busy !== null) return;
    setBusy('export');
    try {
      const created = await createBackupFile(appVersion);
      // Offer the share sheet immediately: a backup that never leaves the
      // device does not protect against losing the device.
      await shareBackupFile(created.uri);
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
  }, [appVersion, busy, t]);

  const applyImport = useCallback(async (raw: unknown, mode: ImportMode) => {
    setBusy('import');
    try {
      const summary = await restoreFromBackup(raw, mode);
      // Replace mode swapped the rows out from under React state, so the
      // screens above have to re-read rather than keep what they were showing.
      if (mode === 'replace') onDataReplaced();
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
  }, [onDataReplaced, t]);

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
  }, [applyImport, busy, confirmReplace, t]);

  return (
    <View>
      <Text style={[styles.description, { color: pal.sub }]}>{t('backup_desc')}</Text>

      <TouchableOpacity
        style={styles.row}
        onPress={() => { void runExport(); }}
        disabled={busy !== null}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={t('backup_export')}
      >
        <Ionicons name="share-outline" size={18} color={pal.sub} />
        <Text style={[styles.rowLabel, { color: pal.text }]}>{t('backup_export')}</Text>
        {busy === 'export'
          ? <ActivityIndicator size="small" color={themeColor} />
          : <Ionicons name="chevron-forward" size={15} color={pal.sub} />}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.row}
        onPress={() => { void runImport(); }}
        disabled={busy !== null}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={t('backup_import')}
      >
        <Ionicons name="download-outline" size={18} color={pal.sub} />
        <Text style={[styles.rowLabel, { color: pal.text }]}>{t('backup_import')}</Text>
        {busy === 'import'
          ? <ActivityIndicator size="small" color={themeColor} />
          : <Ionicons name="chevron-forward" size={15} color={pal.sub} />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  rowLabel: { flex: 1, fontSize: 15 },
});
