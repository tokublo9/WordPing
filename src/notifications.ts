import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import type { WordCard } from './types';

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

export async function rescheduleNotifications(
  cards: WordCard[],
  intervalSeconds: number,
  displayOnlyWord: boolean,
) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const eligible = cards.filter(c => !c.notifOff);
  if (eligible.length === 0 || intervalSeconds === 0) return;
  const count = Math.min(64, Math.ceil(86400 / intervalSeconds));
  const pool = [...eligible].sort(() => Math.random() - 0.5);
  for (let i = 0; i < count; i++) {
    const card = pool[i % pool.length];
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
