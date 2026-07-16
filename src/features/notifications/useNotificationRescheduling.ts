import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { Folder, WordCard } from '../../types';
import { rescheduleAllNotifications } from '../../notifications';

export interface UseNotificationReschedulingParams {
  cards: WordCard[];
  folders: Folder[];
  notificationGranted: boolean;
  hasLoaded: MutableRefObject<boolean>;
}

export function useNotificationRescheduling({
  cards,
  folders,
  notificationGranted,
  hasLoaded,
}: UseNotificationReschedulingParams): void {
  useEffect(() => {
    if (!hasLoaded.current) return;
    if (!notificationGranted) return;
    rescheduleAllNotifications(cards, folders);
  }, [cards, folders, notificationGranted]);
}
