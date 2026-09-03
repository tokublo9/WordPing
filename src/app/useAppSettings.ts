import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Appearance } from '../types';
import { DEFAULT_LANGUAGE, DEFAULT_THEME } from '../constants';
import type { Settings } from '../lib/db';
import { DEFAULT_AI_VOICE, type AIVoice } from '../lib/aiVoices';
import type { StudyLog } from '../features/study/studyLog';

export interface AppSettingsState {
  themeColor: string;
  setThemeColor: Dispatch<SetStateAction<string>>;
  appearance: Appearance;
  setAppearance: Dispatch<SetStateAction<Appearance>>;
  skinId: string | null;
  setSkinId: Dispatch<SetStateAction<string | null>>;
  language: string;
  setLanguage: Dispatch<SetStateAction<string>>;
  aiVoice: AIVoice;
  setAIVoice: Dispatch<SetStateAction<AIVoice>>;
  showFullCard: boolean;
  setShowFullCard: Dispatch<SetStateAction<boolean>>;
  verticalFlip: boolean;
  setVerticalFlip: Dispatch<SetStateAction<boolean>>;
  hideAiTools: boolean;
  syncTestResults: boolean;
  setSyncTestResults: Dispatch<SetStateAction<boolean>>;
  /** Answers per local day, the only record of what was studied when. */
  studyLog: StudyLog;
  setStudyLog: Dispatch<SetStateAction<StudyLog>>;
  setHideAiTools: Dispatch<SetStateAction<boolean>>;
  /** One-time tutorial. False until the stored flag says otherwise. */
  resultFilterTutorialSeen: boolean;
  setResultFilterTutorialSeen: Dispatch<SetStateAction<boolean>>;
  /** Set the first time a card is graded in Test Mode, and never cleared. */
  firstTestAnswerRecorded: boolean;
  setFirstTestAnswerRecorded: Dispatch<SetStateAction<boolean>>;
  settingsLoaded: boolean;
  // Called by useAppBootstrap after the async data load completes.
  applySettings(s: Settings): void;
  markSettingsLoaded(): void;
}

export function useAppSettings(): AppSettingsState {
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME);
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [skinId, setSkinId] = useState<string | null>(null);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [aiVoice, setAIVoice] = useState<AIVoice>(DEFAULT_AI_VOICE);
  const [showFullCard, setShowFullCard] = useState(false);
  const [verticalFlip, setVerticalFlip] = useState(false);
  const [hideAiTools, setHideAiTools]   = useState(false);
  // Dormant saved preference retained for a possible future UI restoration.
  // Test Mode currently uses SYNC_WITH_TEST_RESULTS_ENABLED instead.
  const [syncTestResults, setSyncTestResults] = useState(false);
  const [studyLog, setStudyLog] = useState<StudyLog>({});
  const [resultFilterTutorialSeen, setResultFilterTutorialSeen] = useState(false);
  const [firstTestAnswerRecorded, setFirstTestAnswerRecorded] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const applySettings = useCallback((s: Settings) => {
    setThemeColor(s.themeColor);
    setAppearance(s.appearance);
    setSkinId(s.skinId ?? null);
    setLanguage(s.language ?? DEFAULT_LANGUAGE);
    setAIVoice(s.aiVoice ?? DEFAULT_AI_VOICE);
  }, []);

  const markSettingsLoaded = useCallback(() => setSettingsLoaded(true), []);

  return {
    themeColor, setThemeColor,
    appearance, setAppearance,
    skinId, setSkinId,
    language, setLanguage,
    aiVoice, setAIVoice,
    showFullCard, setShowFullCard,
    verticalFlip, setVerticalFlip,
    hideAiTools, setHideAiTools,
    syncTestResults, setSyncTestResults,
    studyLog, setStudyLog,
    resultFilterTutorialSeen, setResultFilterTutorialSeen,
    firstTestAnswerRecorded, setFirstTestAnswerRecorded,
    settingsLoaded,
    applySettings,
    markSettingsLoaded,
  };
}
