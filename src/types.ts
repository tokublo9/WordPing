export interface WordCard {
  id: string;
  word: string;
  meaning: string;
  note: string;
  notifOff?: boolean;
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
