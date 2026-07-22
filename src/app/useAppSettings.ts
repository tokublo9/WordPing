import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Appearance } from '../types';
import { DEFAULT_LANGUAGE, DEFAULT_THEME } from '../constants';
import type { Settings } from '../lib/db';
import { DEFAULT_AI_VOICE, type AIVoice } from '../lib/aiVoices';

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
  setHideAiTools: Dispatch<SetStateAction<boolean>>;
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
    settingsLoaded,
    applySettings,
    markSettingsLoaded,
  };
}
