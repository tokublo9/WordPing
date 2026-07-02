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
