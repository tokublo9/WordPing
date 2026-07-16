import { Alert } from 'react-native';
import type { Dispatch, SetStateAction } from 'react';
import type { Folder, FolderNotifSettings, WordCard } from '../../types';
import type { TranslationKey } from '../../i18n';
import { requestPermission, sendTestNotification } from '../../notifications';

export interface UseFolderNotificationsParams {
  folders: Folder[];
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  currentFolderId: string | null;
  notificationGranted: boolean;
  setNotificationGranted: Dispatch<SetStateAction<boolean>>;
  folderCards: WordCard[];
  t: (key: TranslationKey) => string;
}

export interface UseFolderNotificationsReturn {
  folderNotifSettings: FolderNotifSettings;
  notificationsEnabled: boolean;
  updateFolderNotif(patch: Partial<FolderNotifSettings>): void;
  handlePickInterval(seconds: number): void;
  sendTestForCurrentFolder(): void;
}

export function useFolderNotifications({
  folders,
  setFolders,
  currentFolderId,
  notificationGranted,
  setNotificationGranted,
  folderCards,
  t,
}: UseFolderNotificationsParams): UseFolderNotificationsReturn {
  const currentFolder = folders.find(f => f.id === currentFolderId) ?? null;
  const folderNotifSettings: FolderNotifSettings =
    currentFolder?.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
  const notificationsEnabled = folderNotifSettings.intervalSeconds > 0;

  const updateFolderNotif = (patch: Partial<FolderNotifSettings>) => {
    if (!currentFolderId) return;
    setFolders(prev => prev.map(f => {
      if (f.id !== currentFolderId) return f;
      const cur: FolderNotifSettings = f.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
      return { ...f, notifSettings: { ...cur, ...patch } };
    }));
  };

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
      });
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
    Alert.alert(
      t('notifications'),
      `Notifications are already enabled for "${conflictName}". Enable for "${targetName}" instead?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: 'Enable',
          onPress: () => {
            setFolders(prev => prev.map(f => {
              if (f.id === currentFolderId) {
                const cur: FolderNotifSettings = f.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
                return { ...f, notifSettings: { ...cur, intervalSeconds: seconds } };
              }
              if (f.id === conflictId) {
                const cur: FolderNotifSettings = f.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
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
    const eligible = folderCards.filter(c => !c.notifOff);
    if (eligible.length === 0) return;
    const card = eligible[Math.floor(Math.random() * eligible.length)];
    sendTestNotification(card, folderNotifSettings.displayOnlyWord);
  };

  return {
    folderNotifSettings,
    notificationsEnabled,
    updateFolderNotif,
    handlePickInterval,
    sendTestForCurrentFolder,
  };
}
