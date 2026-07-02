import type { IntervalOption, Palette, ThemeColor, ThemeSkin } from './types';

export const INTERVAL_OPTIONS: IntervalOption[] = [
  { label: '30 min',  seconds: 1800 },
  { label: '1 hour',  seconds: 3600 },
  { label: '2 hours', seconds: 7200 },
  { label: '3 hours', seconds: 10800 },
  { label: '6 hours', seconds: 21600 },
  { label: '12 hours', seconds: 43200 },
  { label: '24 hours', seconds: 86400 },
  { label: 'Off',      seconds: 0 },
];

export const THEME_COLORS: ThemeColor[] = [
  { name: 'Black',  value: '#1A1A1A' },
  { name: 'Purple', value: '#7C6BF8' },
  { name: 'Blue',   value: '#3B82F6' },
  { name: 'Pink',   value: '#EC4899' },
  { name: 'Teal',   value: '#14B8A6' },
  { name: 'Coral',  value: '#FF6B6B' },
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

export const SKIN_KEY = 'theme_skin';
export const DEVICE_ID_KEY = 'device_id';
export const CARDS_KEY = 'vocabulary_cards';
export const INTERVAL_KEY = 'notif_interval_seconds';
export const THEME_KEY = 'theme_color';
export const APPEARANCE_KEY = 'appearance';
export const DISPLAY_ONLY_WORD_KEY = 'notification_display_only_word';

export const DEFAULT_DISPLAY_ONLY_WORD = false;

export const SKINS: ThemeSkin[] = [
  {
    id: 'floral',
    name: 'Floral',
    emoji: '🌸',
    darkStatusBar: false,
    themeColor: '#E8779A',
    palette: {
      bg: '#FEF0F5', card: '#FFFFFF', text: '#4A1535', sub: '#C4789A',
      border: '#F8DCEA', input: '#FFF5F8', chip: '#FCE8F0', dialog: '#FFFFFF',
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    emoji: '🌃',
    darkStatusBar: true,
    themeColor: '#FF2D78',
    palette: {
      bg: '#0D0A1E', card: '#15103A', text: '#F0E6FF', sub: '#8B72BE',
      border: '#2A1F5A', input: '#100D28', chip: '#1E1850', dialog: '#15103A',
    },
  },
  {
    id: 'animal',
    name: 'Animal',
    emoji: '🐾',
    darkStatusBar: false,
    themeColor: '#9B6B2F',
    palette: {
      bg: '#FFF8EC', card: '#FFFDF7', text: '#2D1F0A', sub: '#9E8050',
      border: '#EEE0C4', input: '#FFFCF5', chip: '#F5EDD8', dialog: '#FFFDF7',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    emoji: '🌊',
    darkStatusBar: true,
    themeColor: '#00C9B1',
    palette: {
      bg: '#071828', card: '#0C2438', text: '#D4EEF7', sub: '#5A9AB5',
      border: '#1A3D52', input: '#091E30', chip: '#0F2E44', dialog: '#0C2438',
    },
  },
  {
    id: 'cosmos',
    name: 'Cosmos',
    emoji: '✨',
    darkStatusBar: true,
    themeColor: '#A78BFA',
    palette: {
      bg: '#07091A', card: '#0D1030', text: '#DCE4FF', sub: '#6070A8',
      border: '#1A2050', input: '#0A0D22', chip: '#131840', dialog: '#0D1030',
    },
  },
];

export const FOLDERS_KEY      = 'wordping_folders';
export const NOTIF_FOLDER_KEY = 'wordping_notif_folder';
export const LANGUAGE_KEY = 'app_language';
export const DEFAULT_LANGUAGE = 'en-US';

export const REVEAL_WIDTH = 172;


export const FREE_WORD_LIMIT = 30;
export const FREE_VOICE_LIMIT = 10;
