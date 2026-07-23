import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { Folder, WordCard } from '../../types';
import { rescheduleAllNotifications } from '../../notifications';
import { reportSideEffectFailure } from '../../utils/reportSideEffectFailure';

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
    const timer = setTimeout(() => {
      rescheduleAllNotifications(cards, folders)
        .catch(e => reportSideEffectFailure('rescheduleAllNotifications', e));
    }, 500);
    return () => clearTimeout(timer);
  }, [cards, folders, notificationGranted]);
}
