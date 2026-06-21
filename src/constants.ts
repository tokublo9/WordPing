import type { IntervalOption, Palette, ThemeColor } from './types';

export const INTERVAL_OPTIONS: IntervalOption[] = [
  { label: '30 seconds', seconds: 30 },
  { label: '1 minute',   seconds: 60 },
  { label: '3 minutes',  seconds: 180 },
  { label: '5 minutes',  seconds: 300 },
  { label: '10 minutes', seconds: 600 },
  { label: '15 minutes', seconds: 900 },
  { label: '30 minutes', seconds: 1800 },
  { label: '1 hour',     seconds: 3600 },
  { label: '2 hours',    seconds: 7200 },
  { label: 'Off',        seconds: 0 },
];

export const THEME_COLORS: ThemeColor[] = [
  { name: 'Purple', value: '#7C6BF8' },
  { name: 'Blue',   value: '#3B82F6' },
  { name: 'Red',    value: '#EF4444' },
  { name: 'Green',  value: '#10B981' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Pink',   value: '#EC4899' },
  { name: 'Teal',   value: '#14B8A6' },
];

export const LIGHT: Palette = {
  bg: '#F7F8FC', card: '#fff', text: '#1A1A2E', sub: '#888',
  border: '#E8E8F0', input: '#FAFAFA', chip: '#EBEBF0', dialog: '#fff',
};

export const DARK: Palette = {
  bg: '#0F0F1A', card: '#1C1C2E', text: '#F0F0FF', sub: '#777',
  border: '#2A2A4A', input: '#16162A', chip: '#2A2A4A', dialog: '#1C1C2E',
};

export const DEFAULT_THEME = '#7C6BF8';
export const DEFAULT_INTERVAL = 1800;

export const CARDS_KEY = 'vocabulary_cards';
export const INTERVAL_KEY = 'notif_interval_seconds';
export const THEME_KEY = 'theme_color';
export const APPEARANCE_KEY = 'appearance';
export const DISPLAY_ONLY_WORD_KEY = 'notification_display_only_word';

export const DEFAULT_DISPLAY_ONLY_WORD = false;

export const REVEAL_WIDTH = 172;
