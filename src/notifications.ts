import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Folder, WordCard } from './types';
import { notifiableCards } from './features/notifications/notificationCandidates';
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

/**
 * The three answers the OS can give, kept apart because they need three
 * different things from us.
 *
 * `undetermined` is the only one the system prompt can still be raised from.
 * `denied` can be changed in the device's own Settings and nowhere else, so
 * collapsing it into a bare `false` would leave the caller offering a prompt
 * that will never appear.
 */
export type NotificationPermissionState = 'granted' | 'undetermined' | 'denied';

function readState(
  permissions: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  const granted = permissions.granted
    || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (granted) return 'granted';
  return permissions.canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Asks for notification permission — and only when there is something to ask.
 *
 * Determined states return straight back out, so this is safe to call on every
 * entry point: the system prompt is reached from `undetermined` alone, which is
 * also the only state iOS will actually draw it in. A device that cannot
 * receive notifications at all (a simulator) reads as `denied`, the same answer
 * it gave before, because there is no prompt to offer there either.
 */
export async function requestPermission(): Promise<NotificationPermissionState> {
  if (!Device.isDevice) return 'denied';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'WordCore reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const current = await getPermissionState();
  if (current !== 'undetermined') return current;
  return readState(await Notifications.requestPermissionsAsync());
}

/** Reads the current state without prompting. */
export async function getPermissionState(): Promise<NotificationPermissionState> {
  if (!Device.isDevice) return 'denied';
  return readState(await Notifications.getPermissionsAsync());
}

/** The same read, for the callers that only care whether notifications arrive. */
export async function getPermissionStatus(): Promise<boolean> {
  return (await getPermissionState()) === 'granted';
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
    // Ownership first, then eligibility. Both are read from the card array this
    // reschedule was handed, so a word deleted or moved to another folder since
    // the last one is simply absent and can never be picked.
    const owned = cards.filter(c => c.folderId === folder.id);
    const eligible = notifiableCards(owned, folder.notifSettings);
    // Nothing on the list and "Notify All Words" off: this folder schedules
    // nothing. It deliberately does not fall back to every word — the sheet
    // tells the user why instead.
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
