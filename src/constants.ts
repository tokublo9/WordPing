import { Dimensions } from 'react-native';
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

export const FREE_THEME_COLOR = '#3B82F6';

export const THEME_COLORS: ThemeColor[] = [
  { name: 'Blue',   value: FREE_THEME_COLOR },
  { name: 'Purple', value: '#7C6BF8' },
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

export const DEFAULT_THEME = FREE_THEME_COLOR;
export const DEFAULT_INTERVAL = 1800;

export const SKIN_KEY = 'theme_skin';
export const DEVICE_ID_KEY = 'device_id';
export const CARDS_KEY = 'vocabulary_cards';
export const THEME_KEY = 'theme_color';
export const APPEARANCE_KEY = 'appearance';

export const DEFAULT_DISPLAY_ONLY_WORD = false;

// Legacy skins kept for backward compat (not shown in new skin picker UI).
const LEGACY_SKINS: ThemeSkin[] = [
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

// Solid-colour skins — available free in the Kisekae Shop.
// Skins free users may activate (no subscription required).
export const FREE_SKIN_IDS = new Set(['solid_blue', 'solid_gray']);

export const SOLID_SKINS: ThemeSkin[] = [
  {
    id: 'solid_blue', name: 'Blue', emoji: '💙',
    darkStatusBar: false, themeColor: FREE_THEME_COLOR,
    palette: {
      bg: '#EEF3FF', card: '#FFFFFF', text: '#1E3A5F', sub: '#6B8098',
      border: 'rgba(37,99,235,0.12)', input: '#F5F8FF', chip: '#E0EAFF', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_gray', name: 'Gray', emoji: '🩶',
    darkStatusBar: false, themeColor: '#6B7280',
    palette: {
      bg: '#F9FAFB', card: '#FFFFFF', text: '#111827', sub: '#6B7280',
      border: 'rgba(107,114,128,0.12)', input: '#F3F4F6', chip: '#E5E7EB', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_green', name: 'Green', emoji: '💚',
    darkStatusBar: false, themeColor: '#16A34A',
    palette: {
      bg: '#EDFBF2', card: '#FFFFFF', text: '#1A3A28', sub: '#527A5E',
      border: 'rgba(22,163,74,0.12)', input: '#F4FDF7', chip: '#D4F5E3', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_purple', name: 'Purple', emoji: '💜',
    darkStatusBar: false, themeColor: '#7C3AED',
    palette: {
      bg: '#F5F0FF', card: '#FFFFFF', text: '#2E1B5C', sub: '#7060A0',
      border: 'rgba(124,58,237,0.12)', input: '#FAF7FF', chip: '#EDE4FF', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_teal', name: 'Teal', emoji: '💎',
    darkStatusBar: false, themeColor: '#0D9488',
    palette: {
      bg: '#F0FDFA', card: '#FFFFFF', text: '#0D2E2A', sub: '#3D8C84',
      border: 'rgba(13,148,136,0.12)', input: '#F5FFFE', chip: '#CCFBF1', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_beige', name: 'Beige', emoji: '🤎',
    darkStatusBar: false, themeColor: '#92400E',
    palette: {
      bg: '#FAF5EB', card: '#FFFFFF', text: '#3D2A1A', sub: '#8A6A4A',
      border: 'rgba(146,64,14,0.12)', input: '#FFFBF5', chip: '#F5EDD8', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_sky', name: 'Sky Blue', emoji: '🩵',
    darkStatusBar: false, themeColor: '#0EA5E9',
    palette: {
      bg: '#F0F9FF', card: '#FFFFFF', text: '#0C2D48', sub: '#4A90B0',
      border: 'rgba(14,165,233,0.12)', input: '#F5FBFF', chip: '#DBEAFE', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_mint', name: 'Mint', emoji: '🌱',
    darkStatusBar: false, themeColor: '#10B981',
    palette: {
      bg: '#F0FDF4', card: '#FFFFFF', text: '#0A2D1C', sub: '#3A7A58',
      border: 'rgba(16,185,129,0.12)', input: '#F5FFF9', chip: '#D1FAE5', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_pink', name: 'Pink', emoji: '🩷',
    darkStatusBar: false, themeColor: '#EC4899',
    palette: {
      bg: '#FDF2F8', card: '#FFFFFF', text: '#4A1535', sub: '#A0527A',
      border: 'rgba(236,72,153,0.12)', input: '#FFF5FA', chip: '#FCE7F3', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_red', name: 'Red', emoji: '❤️',
    darkStatusBar: false, themeColor: '#EF4444',
    palette: {
      bg: '#FFF5F5', card: '#FFFFFF', text: '#450A0A', sub: '#9A3535',
      border: 'rgba(239,68,68,0.12)', input: '#FFFAFA', chip: '#FEE2E2', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_orange', name: 'Orange', emoji: '🧡',
    darkStatusBar: false, themeColor: '#F97316',
    palette: {
      bg: '#FFF7ED', card: '#FFFFFF', text: '#431407', sub: '#9A4A1A',
      border: 'rgba(249,115,22,0.12)', input: '#FFFBF5', chip: '#FFEDD5', dialog: '#FFFFFF',
    },
  },
  {
    id: 'solid_yellow', name: 'Yellow', emoji: '💛',
    darkStatusBar: false, themeColor: '#CA8A04',
    palette: {
      bg: '#FEFCE8', card: '#FFFFFF', text: '#2D2000', sub: '#7A6020',
      border: 'rgba(202,138,4,0.12)', input: '#FEFDF5', chip: '#FEF9C3', dialog: '#FFFFFF',
    },
  },
];

// Premium pattern skins — shown in the skin picker; require subscription.
export const PREMIUM_SKINS: ThemeSkin[] = [
  {
    id: 'skin_deep_sea',
    name: 'Deep Sea',
    emoji: '🌊',
    darkStatusBar: true,
    themeColor: '#38BDF8',
    palette: {
      bg:     '#061628',
      card:   'rgba(10,40,90,1)',
      text:   '#E8F4FF',
      sub:    '#7AB8D8',
      border: 'rgba(100,180,255,0.18)',
      input:  'rgba(255,255,255,0.08)',
      chip:   'rgba(100,180,255,0.18)',
      dialog: '#0A2440',
    },
  },
  {
    id: 'skin_leaf_blur',
    name: 'Leaf Blur',
    emoji: '🌿',
    darkStatusBar: false,
    themeColor: '#2E7D5A',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wallpaperImage: require('../assets/wallpapers/green-leaf-bg.png') as number,
    wallpaperBlur: 30,
    wallpaperOverlayColor: 'rgba(240, 255, 245, 0.45)',
    palette: {
      bg:     '#F5FBF6',
      card:   'rgba(255,255,255,1)',
      text:   '#1F2D24',
      sub:    '#5E7468',
      border: 'rgba(46,125,90,0.12)',
      input:  'rgba(255,255,255,0.92)',
      chip:   'rgba(240,255,245,0.9)',
      dialog: 'rgba(255,255,255,0.95)',
    },
  },
  {
    id: 'skin_flower',
    name: 'Flower',
    emoji: '🌸',
    darkStatusBar: false,
    themeColor: '#D4668A',
    patternType: 'flower',
    palette: {
      bg: '#FFF5F8', card: '#FFFFFF', text: '#4A1535', sub: '#B56B8A',
      border: '#F5D6E0', input: '#FFF9FB', chip: '#FCE8F0', dialog: '#FFFFFF',
    },
  },
  {
    id: 'skin_paw',
    name: 'Animal',
    emoji: '🐾',
    darkStatusBar: false,
    themeColor: '#BF7A40',
    patternType: 'paw',
    palette: {
      bg: '#FFF8F0', card: '#FFFDF7', text: '#3D2A1A', sub: '#A07850',
      border: '#EEE0C4', input: '#FFFCF5', chip: '#F5EDD8', dialog: '#FFFDF7',
    },
  },
  {
    id: 'skin_space',
    name: 'Space',
    emoji: '🚀',
    darkStatusBar: true,
    themeColor: '#8B6FFF',
    patternType: 'space',
    palette: {
      bg: '#08091A', card: '#0E1030', text: '#E0E8FF', sub: '#6070A8',
      border: '#1A2050', input: '#0A0D22', chip: '#131840', dialog: '#0E1030',
    },
  },
  {
    id: 'skin_sunset',
    name: 'Sunset',
    emoji: '🌅',
    darkStatusBar: false,
    themeColor: '#F97316',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wallpaperImage: require('../assets/wallpapers/sunset.png') as number,
    wallpaperBlur: 25,
    wallpaperOverlayColor: 'rgba(255, 240, 220, 0.38)',
    palette: {
      bg: '#FFF3E8', card: '#FFFFFF', text: '#3A1505', sub: '#B06030',
      border: 'rgba(249,115,22,0.15)', input: '#FFFBF5', chip: '#FFE8CC', dialog: '#FFFFFF',
    },
  },
  {
    id: 'skin_sakura',
    name: 'Sakura',
    emoji: '🌸',
    darkStatusBar: false,
    themeColor: '#F472B6',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wallpaperImage: require('../assets/wallpapers/sakura.png') as number,
    wallpaperBlur: 25,
    wallpaperOverlayColor: 'rgba(253, 240, 248, 0.42)',
    palette: {
      bg: '#FDF4F8', card: '#FFFFFF', text: '#4A1040', sub: '#C060A0',
      border: 'rgba(244,114,182,0.15)', input: '#FFF8FB', chip: '#FCE7F5', dialog: '#FFFFFF',
    },
  },
  {
    id: 'skin_galaxy',
    name: 'Galaxy',
    emoji: '🌌',
    darkStatusBar: true,
    themeColor: '#818CF8',
    palette: {
      bg: '#050714', card: '#0D0F2E', text: '#E8ECFF', sub: '#6068B8',
      border: 'rgba(129,140,248,0.18)', input: '#080A1E', chip: '#121840', dialog: '#0D0F2E',
    },
  },
  {
    id: 'skin_snow',
    name: 'Snow Mountain',
    emoji: '🏔️',
    darkStatusBar: false,
    themeColor: '#60A5FA',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wallpaperImage: require('../assets/wallpapers/Snowy-mountain.png') as number,
    wallpaperBlur: 28,
    wallpaperOverlayColor: 'rgba(240, 248, 255, 0.42)',
    palette: {
      bg: '#F8FBFF', card: '#FFFFFF', text: '#0A1A2E', sub: '#608098',
      border: 'rgba(96,165,250,0.15)', input: '#F0F6FF', chip: '#DBEAFE', dialog: '#FFFFFF',
    },
  },
  {
    id: 'skin_cyber',
    name: 'Cyber Neon',
    emoji: '⚡',
    darkStatusBar: true,
    themeColor: '#00E5FF',
    palette: {
      bg: '#040810', card: '#0A1020', text: '#B8F0FF', sub: '#407080',
      border: 'rgba(0,229,255,0.18)', input: '#060C16', chip: '#0E1A28', dialog: '#0A1020',
    },
  },
  {
    id: 'skin_coffee',
    name: 'Coffee House',
    emoji: '☕',
    darkStatusBar: false,
    themeColor: '#92400E',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wallpaperImage: require('../assets/wallpapers/coffee-shop.png') as number,
    wallpaperBlur: 0,
    wallpaperOverlayColor: 'rgba(251, 240, 220, 0.12)',
    palette: {
      bg: '#FBF6F0', card: '#FFFFFF', text: '#2A1205', sub: '#7A5030',
      border: 'rgba(146,64,14,0.15)', input: '#FDFAF6', chip: '#F5E8D8', dialog: '#FFFFFF',
    },
  },
  {
    id: 'shop_woods',
    name: 'Beautiful Woods',
    emoji: '🌲',
    darkStatusBar: true,
    themeColor: '#6AAF5A',
    palette: {
      bg: '#0E1A0E', card: '#182818', text: '#D4EBD0', sub: '#6A9868',
      border: 'rgba(106,175,90,0.18)', input: '#122012', chip: '#1E3C1E', dialog: '#182818',
    },
  },
  {
    id: 'shop_roses',
    name: 'Roses',
    emoji: '🌹',
    darkStatusBar: false,
    themeColor: '#D4627A',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wallpaperImage: require('../assets/wallpapers/rose.png') as number,
    wallpaperBlur: 25,
    wallpaperOverlayColor: 'rgba(254, 240, 245, 0.40)',
    palette: {
      bg: '#FEF0F5', card: '#FFFFFF', text: '#4A0820', sub: '#B06080',
      border: 'rgba(212,98,122,0.15)', input: '#FFF5F8', chip: '#FDE8EE', dialog: '#FFFFFF',
    },
  },
  {
    id: 'skin_aurora',
    name: 'Aurora',
    emoji: '🌠',
    darkStatusBar: true,
    themeColor: '#00E5A0',
    palette: {
      bg: '#020814', card: '#050E28', text: '#C8F0E8', sub: '#4A9080',
      border: 'rgba(0,229,160,0.18)', input: '#030C1E', chip: '#081830', dialog: '#050E28',
    },
  },
  {
    id: 'skin_rain',
    name: 'Rainy Window',
    emoji: '🌧️',
    darkStatusBar: true,
    themeColor: '#60A5FA',
    palette: {
      bg: '#0D1520', card: '#152030', text: '#C0D8F0', sub: '#5080A0',
      border: 'rgba(96,165,250,0.18)', input: '#101C2C', chip: '#182840', dialog: '#152030',
    },
  },
  {
    id: 'skin_night_city',
    name: 'Night City',
    emoji: '🌃',
    darkStatusBar: true,
    themeColor: '#F59E0B',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wallpaperImage: require('../assets/wallpapers/night-city.png') as number,
    wallpaperBlur: 15,
    wallpaperOverlayColor: 'rgba(5, 3, 20, 0.25)',
    palette: {
      bg:     '#0A0816',
      card:   '#131126',
      text:   '#F5F0FF',
      sub:    '#7B70A0',
      border: 'rgba(245,158,11,0.15)',
      input:  '#0D0B20',
      chip:   '#1A1540',
      dialog: '#131126',
    },
  },
];

export const SKINS: ThemeSkin[] = [...LEGACY_SKINS, ...SOLID_SKINS, ...PREMIUM_SKINS];

export const FOLDERS_KEY      = 'wordping_folders';
export const ONBOARDING_KEY   = 'wordping_onboarding';
export const LANGUAGE_KEY = 'app_language';
export const DEFAULT_LANGUAGE = 'en-US';

export const REVEAL_WIDTH = 220;


export const FREE_WORD_LIMIT = 30;
export const FREE_VOICE_LIMIT = 10;

export const MAX_AI_INPUT_CHARS = 500;

export const SHOW_FULL_CARD_KEY  = 'card_show_full';
export const VERTICAL_FLIP_KEY   = 'card_vertical_flip';
export const HIDE_AI_TOOLS_KEY   = 'wordping_hide_ai_tools';

// ── Flip / Test card shared geometry ─────────────────────────────────────────
const { width: _SCREEN_W } = Dimensions.get('window');
export const FLIP_CARD_W          = _SCREEN_W - 48;
export const FLIP_CARD_H          = 280;
export const FLIP_CARD_RADIUS     = 20;
export const FLIP_CARD_PAD_H      = 28;
export const FLIP_CARD_PAD_V      = 52;

// Typography shared between Flip Mode and Test Mode
export const FLIP_WORD_FONT_SIZE    = 26;
export const FLIP_MEANING_FONT_SIZE = 22;
export const FLIP_MEANING_LINE_H    = 30;
export const FLIP_NOTE_FONT_SIZE    = 16;
export const FLIP_NOTE_LINE_H       = 23;
export const FLIP_NOTE_MARGIN_TOP   = 20;
