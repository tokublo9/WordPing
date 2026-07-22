import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appearance, Folder, WordCard } from '../types';
import { HIDE_AI_TOOLS_KEY, SHOW_FULL_CARD_KEY, VERTICAL_FLIP_KEY } from '../constants';
import { persist, persistFolders } from '../lib/db';
import { reportSideEffectFailure } from '../utils/reportSideEffectFailure';
import type { AIVoice } from '../lib/aiVoices';

export interface UseAppPersistenceParams {
  cards: WordCard[];
  folders: Folder[];
  foldersRef: MutableRefObject<Folder[]>;
  themeColor: string;
  appearance: Appearance;
  skinId: string | null;
  language: string;
  aiVoice: AIVoice;
  showFullCard: boolean;
  verticalFlip: boolean;
  hideAiTools: boolean;
  hasLoaded: MutableRefObject<boolean>;
}

export function useAppPersistence({
  cards,
  folders,
  foldersRef,
  themeColor,
  appearance,
  skinId,
  language,
  aiVoice,
  showFullCard,
  verticalFlip,
  hideAiTools,
  hasLoaded,
}: UseAppPersistenceParams): void {
  // Persist cards + settings whenever any of them change.
  useEffect(() => {
    if (!hasLoaded.current) return;
    persist({ cards, settings: { themeColor, appearance, skinId, language, aiVoice } });
  }, [cards, themeColor, appearance, skinId, language, aiVoice]);

  // Keep foldersRef in sync and persist folders.
  useEffect(() => {
    if (!hasLoaded.current) return;
    foldersRef.current = folders;
    persistFolders(folders);
  }, [folders]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(SHOW_FULL_CARD_KEY, showFullCard ? 'true' : 'false')
      .catch(e => reportSideEffectFailure('setShowFullCard', e));
  }, [showFullCard]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(VERTICAL_FLIP_KEY, verticalFlip ? 'true' : 'false')
      .catch(e => reportSideEffectFailure('setVerticalFlip', e));
  }, [verticalFlip]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(HIDE_AI_TOOLS_KEY, hideAiTools ? 'true' : 'false')
      .catch(e => reportSideEffectFailure('setHideAiTools', e));
  }, [hideAiTools]);
}
