export const ALL_LEVEL_KEYS = ['perfect', 'good', 'slightly', 'unknown', 'none'] as const;

export const LEVEL_ORDER: Record<string, number> = { perfect: 0, good: 1, slightly: 2, unknown: 3 };

export const LEVEL_FILTER_OPTIONS: Array<{ level: string; icon: string | null; color: string }> = [
  { level: 'perfect',  icon: '◎',               color: '#5EBF84' },
  { level: 'good',     icon: 'ellipse-outline',  color: '#6BA4F0' },
  { level: 'slightly', icon: 'triangle-outline', color: '#F2B445' },
  { level: 'unknown',  icon: 'close-outline',    color: '#ED7373' },
  { level: 'none',     icon: null,               color: '#AEB6C0' },
];
