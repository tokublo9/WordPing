import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Folder, WordCard } from './types';
import { reportSideEffectFailure } from './utils/reportSideEffectFailure';

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
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'WordPing reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  if (await getPermissionStatus()) return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getPermissionStatus(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
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
  pendingSchedule = { cards, folders };
  if (!scheduleRun) {
    scheduleRun = flushSchedules().finally(() => {
      scheduleRun = null;
      if (pendingSchedule) {
        void rescheduleAllNotifications(pendingSchedule.cards, pendingSchedule.folders)
          .catch(error => reportSideEffectFailure('rescheduleAllNotifications', error));
      }
    });
  }
  return scheduleRun;
}

interface ScheduleSnapshot {
  cards: WordCard[];
  folders: Folder[];
}

let pendingSchedule: ScheduleSnapshot | null = null;
let scheduleRun: Promise<void> | null = null;

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

async function flushSchedules(): Promise<void> {
  while (pendingSchedule) {
    const snapshot = pendingSchedule;
    pendingSchedule = null;
    await applySchedule(snapshot.cards, snapshot.folders);
  }
}

async function applySchedule(cards: WordCard[], folders: Folder[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const active = folders.filter(f => (f.notifSettings?.intervalSeconds ?? 0) > 0);
  if (active.length === 0) return;

  const slotsPerFolder = Math.max(1, Math.floor(64 / active.length));

  for (const folder of active) {
    const { intervalSeconds, displayOnlyWord } = folder.notifSettings!;
    const eligible = cards.filter(c => c.folderId === folder.id && !c.notifOff);
    if (eligible.length === 0) continue;

    const pool  = shuffled(eligible);
    const count = Math.min(slotsPerFolder, Math.ceil(86400 / intervalSeconds));

    for (let i = 0; i < count; i++) {
      // A more recent app snapshot is waiting. Stop doing obsolete work; the
      // serialized runner will immediately rebuild from the newest snapshot.
      if (pendingSchedule) return;
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
