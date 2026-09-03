import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appearance, Folder, WordCard } from '../types';
import {
  HIDE_AI_TOOLS_KEY,
  STUDY_LOG_KEY,
  SYNC_TEST_RESULTS_KEY,
  SHOW_FULL_CARD_KEY,
  VERTICAL_FLIP_KEY,
} from '../constants';
import {
  FIRST_TEST_ANSWER_KEY,
  RESULT_FILTER_TUTORIAL_KEY,
  serializeTutorialFlag,
} from '../features/onboarding/tutorialState';
import { persist, persistFolders } from '../lib/db';
import { reportSideEffectFailure } from '../utils/reportSideEffectFailure';
import { serializeStudyLog, type StudyLog } from '../features/study/studyLog';
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
  syncTestResults: boolean;
  studyLog: StudyLog;
  resultFilterTutorialSeen: boolean;
  firstTestAnswerRecorded: boolean;
  hasLoaded: MutableRefObject<boolean>;
  cardsLoaded: MutableRefObject<boolean>;
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
  syncTestResults,
  studyLog,
  resultFilterTutorialSeen,
  firstTestAnswerRecorded,
  hasLoaded,
  cardsLoaded,
}: UseAppPersistenceParams): void {
  // Persist cards + settings whenever any of them change. Gated on cardsLoaded, which
  // opens as soon as stored cards reach state: a word added while the remaining
  // bootstrap phases are still running must reach storage, not sit in memory. `persist`
  // queues the write; db.ts coalesces it with the folder write below into one
  // SQLite transaction, folders first, so foreign keys hold.
  useEffect(() => {
    if (!cardsLoaded.current) return;
    persist({ cards, settings: { themeColor, appearance, skinId, language, aiVoice } });
  }, [cards, themeColor, appearance, skinId, language, aiVoice]);

  // Keep foldersRef in sync and persist folders.
  useEffect(() => {
    if (!cardsLoaded.current) return;
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

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(SYNC_TEST_RESULTS_KEY, syncTestResults ? 'true' : 'false')
      .catch(e => reportSideEffectFailure('setSyncTestResults', e));
  }, [syncTestResults]);

  // One write per answer, and the value is a handful of small numbers. A failed
  // write costs a day's tally, never a word: nothing here is vocabulary.
  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STUDY_LOG_KEY, serializeStudyLog(studyLog))
      .catch(e => reportSideEffectFailure('setStudyLog', e));
  }, [studyLog]);

  // One-time tutorial flags. Each is only ever set, never cleared, so these
  // writes are a handful per install and the `hasLoaded` guard keeps the initial
  // false values from being written back over a stored true.
  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(RESULT_FILTER_TUTORIAL_KEY, serializeTutorialFlag(resultFilterTutorialSeen))
      .catch(e => reportSideEffectFailure('setResultFilterTutorialSeen', e));
  }, [resultFilterTutorialSeen]);

  // Written as soon as the first card is graded, so force-closing the app right
  // afterwards still leaves the filters visible on the next launch.
  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(FIRST_TEST_ANSWER_KEY, serializeTutorialFlag(firstTestAnswerRecorded))
      .catch(e => reportSideEffectFailure('setFirstTestAnswerRecorded', e));
  }, [firstTestAnswerRecorded]);

}
