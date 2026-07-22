export interface FolderNotifSettings {
  intervalSeconds: number;  // 0 = off
  displayOnlyWord: boolean;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  icon?: string;
  color?: string;
  notifSettings?: FolderNotifSettings;
}

export type TestLevel = 'perfect' | 'good' | 'slightly' | 'unknown';

export interface ReviewEntry {
  ts: number;        // Unix ms timestamp of the review submission
  rating: TestLevel; // stable rating ID — resolved to a label via i18n at display time
}

export interface WordCard {
  id: string;
  word: string;
  meaning: string;
  note: string;
  notifOff?: boolean;
  folderId?: string;
  testMastered?: boolean;
  testNextReview?: number; // Unix ms; if set and > Date.now(), skip in test queue
  testLevel?: TestLevel;
  reviewHistory?: ReviewEntry[];
  wordLang?: string;    // BCP-47 locale for free device TTS (e.g. 'en-US', 'ja-JP')
  meaningLang?: string; // BCP-47 locale for free device TTS
  audioUri?: string;    // local file URI of a user-attached MP3 (Basic plan only)
  audioSpeed?: number;  // playback rate, e.g. 0.5 / 0.75 / 1.0 / 1.25 / 1.5 / 2.0 (default 1.0)
  audioVolume?: number; // playback volume 0.0–1.0 (default 1.0)
}

export interface IntervalOption {
  label: string;
  seconds: number;
}

export interface ThemeColor {
  name: string;
  value: string;
}

export type Appearance = 'light' | 'dark' | 'system';

export interface ThemeSkin {
  id: string;
  name: string;
  emoji: string;
  darkStatusBar: boolean; // true → white status-bar text
  themeColor: string;
  palette: Palette;
  patternType?: 'flower' | 'paw' | 'space';
  wallpaperImage?: number;          // Metro require() result
  wallpaperBlur?: number;           // BlurView intensity
  wallpaperOverlayColor?: string;   // tint layer on top of blur
}

export interface OnboardingChoices {
  purpose: 'language' | 'words';
  gender: 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say';
  dateOfBirth: string;   // ISO date: YYYY-MM-DD
  discoverySource: 'app_store' | 'social_media' | 'friend_family' | 'web_search' | 'advertisement' | 'other';
  learningLang?: string;  // BCP-47; only when purpose === 'language'
  nativeLang: string;     // BCP-47
  wordCategory?: string;  // only when purpose === 'words'
}

export interface Palette {
  bg: string;
  card: string;
  text: string;
  sub: string;
  border: string;
  input: string;
  chip: string;
  dialog: string;
}
