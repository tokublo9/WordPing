import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import type { Folder, WordCard } from './types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const { status: current } = await Notifications.getPermissionsAsync();
  if (current === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function sendTestNotification(card: WordCard, displayOnlyWord: boolean): Promise<void> {
  const title = displayOnlyWord ? ' ' : card.word;
  const body  = displayOnlyWord ? card.word : (card.meaning || ' ');
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      repeats: false,
    },
  });
}

/**
 * Reschedule notifications for all folders that have notifications enabled.
 * Distributes the 64-slot iOS limit evenly across active folders, using each
 * folder's own interval and display preference independently.
 */
export async function rescheduleAllNotifications(
  cards: WordCard[],
  folders: Folder[],
): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const active = folders.filter(f => (f.notifSettings?.intervalSeconds ?? 0) > 0);
  if (active.length === 0) return;

  const slotsPerFolder = Math.max(1, Math.floor(64 / active.length));

  for (const folder of active) {
    const { intervalSeconds, displayOnlyWord } = folder.notifSettings!;
    const eligible = cards.filter(c => c.folderId === folder.id && !c.notifOff);
    if (eligible.length === 0) continue;

    const pool  = [...eligible].sort(() => Math.random() - 0.5);
    const count = Math.min(slotsPerFolder, Math.ceil(86400 / intervalSeconds));

    for (let i = 0; i < count; i++) {
      const card  = pool[i % pool.length];
      const title = displayOnlyWord ? ' ' : card.word;
      const body  = displayOnlyWord ? card.word : (card.meaning || ' ');
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: (i + 1) * intervalSeconds,
          repeats: false,
        },
      });
    }
  }
}
