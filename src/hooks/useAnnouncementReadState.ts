import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ANNOUNCEMENTS,
  ANNOUNCEMENT_READ_STATE_KEY,
  FORCE_SHOW_WELCOME_ANNOUNCEMENT,
  WELCOME_ANNOUNCEMENT_ID,
  initialReadAnnouncementIds,
  serializeReadAnnouncementIds,
  unreadAnnouncementIds,
} from '../features/announcements/announcements';
import { reportSideEffectFailure } from '../utils/reportSideEffectFailure';

export interface AnnouncementReadState {
  unreadIds: ReadonlySet<string>;
  hasUnread: boolean;
  markVisibleRead(): void;
}

/** Local read state for the static announcement list. */
export function useAnnouncementReadState(
  isFirstLaunch: boolean | null,
): AnnouncementReadState {
  const [readIds, setReadIds] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    if (isFirstLaunch === null) return;
    let active = true;
    AsyncStorage.getItem(ANNOUNCEMENT_READ_STATE_KEY)
      .then(raw => {
        if (!active) return;
        const initial = initialReadAnnouncementIds(raw, isFirstLaunch);
        setReadIds(initial);
        if (raw === null) {
          AsyncStorage.setItem(
            ANNOUNCEMENT_READ_STATE_KEY,
            serializeReadAnnouncementIds(initial),
          ).catch(error => reportSideEffectFailure('announcementReadState', error));
        }
      })
      .catch(error => {
        reportSideEffectFailure('announcementReadState', error);
        if (active) {
          setReadIds(isFirstLaunch
            ? new Set()
            : new Set([WELCOME_ANNOUNCEMENT_ID]));
        }
      });
    return () => { active = false; };
  }, [isFirstLaunch]);

  const forceWelcomeUnread = __DEV__ && FORCE_SHOW_WELCOME_ANNOUNCEMENT;
  const unreadIds = useMemo(
    () => readIds === null
      ? new Set<string>()
      : unreadAnnouncementIds(readIds, forceWelcomeUnread),
    [forceWelcomeUnread, readIds],
  );

  const markVisibleRead = useCallback(() => {
    if (readIds === null) return;
    setReadIds(current => {
      if (current === null) return current;
      const next = new Set(current);
      for (const item of ANNOUNCEMENTS) {
        // The DEV override is visual only. It must not spend the genuine state.
        if (forceWelcomeUnread && item.id === WELCOME_ANNOUNCEMENT_ID) continue;
        next.add(item.id);
      }
      if (next.size === current.size) return current;
      AsyncStorage.setItem(
        ANNOUNCEMENT_READ_STATE_KEY,
        serializeReadAnnouncementIds(next),
      ).catch(error => reportSideEffectFailure('announcementReadState', error));
      return next;
    });
  }, [forceWelcomeUnread, readIds]);

  return { unreadIds, hasUnread: unreadIds.size > 0, markVisibleRead };
}
