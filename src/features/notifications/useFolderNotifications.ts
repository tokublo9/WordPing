import { Alert } from 'react-native';
import type { Dispatch, SetStateAction } from 'react';
import type { Folder, FolderNotifSettings, WordCard } from '../../types';
import type { TranslationKey } from '../../i18n';
import { requestPermission, sendTestNotification } from '../../notifications';
import { hasNoNotifiableWords, notifiableCards } from './notificationCandidates';
import { reportSideEffectFailure } from '../../utils/reportSideEffectFailure';

export interface UseFolderNotificationsParams {
  folders: Folder[];
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  currentFolderId: string | null;
  notificationGranted: boolean;
  setNotificationGranted: Dispatch<SetStateAction<boolean>>;
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
}

/** No override yet: notifications off, full content, list-only. */
const NO_NOTIF_SETTINGS: FolderNotifSettings = { intervalSeconds: 0, displayOnlyWord: false };

export function useFolderNotifications({
  folders,
  setFolders,
  currentFolderId,
  notificationGranted,
  setNotificationGranted,
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

  const handlePickInterval = (seconds: number) => {
    if (seconds === 0) {
      updateFolderNotif({ intervalSeconds: 0 });
      return;
    }
    if (!notificationGranted) {
      requestPermission().then(granted => {
        setNotificationGranted(granted);
        if (!granted) return;
        updateFolderNotif({ intervalSeconds: seconds });
      }).catch(error => reportSideEffectFailure('requestNotificationPermission', error));
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

  const sendTestForCurrentFolder = () => {
    // The same rule the scheduler applies, so the test fires a word the schedule
    // could actually have picked — and fires nothing when the schedule would.
    const eligible = notifiableCards(allFolderCards, currentFolder?.notifSettings);
    if (eligible.length === 0) return;
    const card = eligible[Math.floor(Math.random() * eligible.length)];
    sendTestNotification(card, folderNotifSettings.displayOnlyWord)
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
  };
}
