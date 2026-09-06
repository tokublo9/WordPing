import { Alert, Linking } from 'react-native';
import type { Dispatch, SetStateAction } from 'react';
import type { Folder, FolderNotifSettings, WordCard } from '../../types';
import type { TranslationKey } from '../../i18n';
import {
  requestPermission,
  sendTestNotification,
  type NotificationPermissionState,
} from '../../notifications';
import { hasNoNotifiableWords } from './notificationCandidates';
import { pickTestNotificationCard } from './testNotification';
import { reportSideEffectFailure } from '../../utils/reportSideEffectFailure';

export interface UseFolderNotificationsParams {
  folders: Folder[];
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  currentFolderId: string | null;
  setNotificationGranted: Dispatch<SetStateAction<boolean>>;
  /**
   * Whether the notification icon has already been tapped once on this install.
   *
   * The permission step belongs to the *first* tap and nothing else, so this is
   * what stops it running again — a milestone, not an entitlement.
   */
  permissionPrompted: boolean;
  /** Records that milestone. Called before the prompt, so a dismissal still counts. */
  onPermissionPrompted: () => void;
  /**
   * Every word in the folder, hidden ones included.
   *
   * The eligibility rule does its own hide filtering, so it is handed the whole
   * folder rather than a list something else has already narrowed — otherwise
   * the test notification and the warning below would be answering a different
   * question from the scheduler.
   */
  allFolderCards: WordCard[];
  t: (key: TranslationKey) => string;
}

export interface UseFolderNotificationsReturn {
  folderNotifSettings: FolderNotifSettings;
  notificationsEnabled: boolean;
  updateFolderNotif(patch: Partial<FolderNotifSettings>): void;
  handlePickInterval(seconds: number): void;
  /** Flips "Notify All Words" for the current folder. */
  toggleNotifyAllWords(value: boolean): void;
  /**
   * The folder is scheduled to notify, draws from its list, and the list is
   * empty — so nothing will fire until the user adds a word or turns the switch
   * on. Drives the sheet's warning; nothing else acts on it.
   */
  noNotifiableWords: boolean;
  sendTestForCurrentFolder(): void;
  /**
   * The permission step, run on the first tap of the notification icon.
   *
   * The sheet opens either way — this never stands between the tap and the
   * screen it is for — and it changes no notification setting whatsoever: a
   * granted permission does not turn regular notifications on and does not
   * choose an interval.
   */
  requestPermissionOnFirstOpen(): void;
}

/** No override yet: notifications off, full content, list-only. */
const NO_NOTIF_SETTINGS: FolderNotifSettings = { intervalSeconds: 0, displayOnlyWord: false };

export function useFolderNotifications({
  folders,
  setFolders,
  currentFolderId,
  setNotificationGranted,
  permissionPrompted,
  onPermissionPrompted,
  allFolderCards,
  t,
}: UseFolderNotificationsParams): UseFolderNotificationsReturn {
  const currentFolder = folders.find(f => f.id === currentFolderId) ?? null;
  const folderNotifSettings: FolderNotifSettings =
    currentFolder?.notifSettings ?? NO_NOTIF_SETTINGS;
  const notificationsEnabled = folderNotifSettings.intervalSeconds > 0;
  const noNotifiableWords = hasNoNotifiableWords(allFolderCards, currentFolder?.notifSettings);

  const updateFolderNotif = (patch: Partial<FolderNotifSettings>) => {
    if (!currentFolderId) return;
    setFolders(prev => prev.map(f => {
      if (f.id !== currentFolderId) return f;
      const cur: FolderNotifSettings = f.notifSettings ?? NO_NOTIF_SETTINGS;
      return { ...f, notifSettings: { ...cur, ...patch } };
    }));
  };

  const toggleNotifyAllWords = (value: boolean) => updateFolderNotif({ notifyAllWords: value });

  // Picking an interval asks for nothing. Permission is settled when the
  // notification icon is first tapped — before any of these options are on
  // screen — so raising the system prompt here would be asking a second time
  // for something already decided, in the middle of a different choice.
  const handlePickInterval = (seconds: number) => {
    if (seconds === 0) {
      updateFolderNotif({ intervalSeconds: 0 });
      return;
    }
    const conflicting = folders.find(
      f => f.id !== currentFolderId && (f.notifSettings?.intervalSeconds ?? 0) > 0
    );
    if (!conflicting) {
      updateFolderNotif({ intervalSeconds: seconds });
      return;
    }
    const targetName   = currentFolder?.name ?? '';
    const conflictName = conflicting.name;
    const conflictId   = conflicting.id;
    const body = t('notif_conflict_body').replace('{0}', conflictName).replace('{1}', targetName);
    Alert.alert(
      t('notifications'),
      body,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('notif_conflict_enable'),
          onPress: () => {
            setFolders(prev => prev.map(f => {
              if (f.id === currentFolderId) {
                const cur: FolderNotifSettings = f.notifSettings ?? NO_NOTIF_SETTINGS;
                return { ...f, notifSettings: { ...cur, intervalSeconds: seconds } };
              }
              if (f.id === conflictId) {
                const cur: FolderNotifSettings = f.notifSettings ?? NO_NOTIF_SETTINGS;
                return { ...f, notifSettings: { ...cur, intervalSeconds: 0 } };
              }
              return f;
            }));
          },
        },
      ]
    );
  };

  /**
   * Notifications are off at the OS level and only the device's own Settings
   * can turn them back on. Said once, in one place, so neither entry point
   * implies a system prompt it cannot raise.
   */
  const showPermissionSettingsGuide = () => {
    Alert.alert(
      t('notifications'),
      t('notif_permission_denied'),
      [
        { text: t('close'), style: 'cancel' },
        {
          text: t('notif_open_settings'),
          onPress: () => {
            Linking.openSettings()
              .catch(error => reportSideEffectFailure('openNotificationSettings', error));
          },
        },
      ],
    );
  };

  /**
   * Reads the permission, asking only from `undetermined`, and keeps the app's
   * copy of it in step. The scheduler watches that copy, so granting here is
   * what lets an already-chosen interval start firing.
   */
  const resolvePermission = async (): Promise<NotificationPermissionState> => {
    const state = await requestPermission();
    setNotificationGranted(state === 'granted');
    return state;
  };

  const requestPermissionOnFirstOpen = () => {
    if (permissionPrompted) return;
    // Recorded first: the offer has been made whether the user allows, refuses,
    // or swipes the system prompt away, and none of those should bring it back.
    onPermissionPrompted();
    resolvePermission()
      .then(state => {
        // `undetermined` here means the prompt was dismissed rather than
        // answered. That is not a refusal to explain, so nothing is said.
        if (state === 'denied') showPermissionSettingsGuide();
      })
      .catch(error => reportSideEffectFailure('requestNotificationPermission', error));
  };

  const sendTestForCurrentFolder = () => {
    // Chosen before the permission is looked at, so the one thing that cannot be
    // fixed by allowing notifications — having no word to send — is reported as
    // itself rather than behind a permission prompt.
    const card = pickTestNotificationCard(allFolderCards, currentFolder?.notifSettings);
    if (!card) {
      Alert.alert(t('notifications'), t('notif_test_no_words'));
      return;
    }
    resolvePermission()
      .then(state => {
        if (state === 'granted') {
          return sendTestNotification(card, folderNotifSettings.displayOnlyWord);
        }
        if (state === 'denied') showPermissionSettingsGuide();
        return undefined;
      })
      .catch(error => reportSideEffectFailure('sendTestNotification', error));
  };

  return {
    folderNotifSettings,
    notificationsEnabled,
    updateFolderNotif,
    handlePickInterval,
    toggleNotifyAllWords,
    noNotifiableWords,
    sendTestForCurrentFolder,
    requestPermissionOnFirstOpen,
  };
}
