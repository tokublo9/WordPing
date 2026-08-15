export const ALL_LEVEL_KEYS = ['perfect', 'good', 'slightly', 'unknown', 'none'] as const;

export type LevelFilterKey = typeof ALL_LEVEL_KEYS[number];
export type LevelFiltersByFolder = Record<string, LevelFilterKey[]>;

const LEVEL_FILTER_KEY_SET = new Set<string>(ALL_LEVEL_KEYS);

export function isLevelFilterKey(value: unknown): value is LevelFilterKey {
  return typeof value === 'string' && LEVEL_FILTER_KEY_SET.has(value);
}

/**
 * Validates the locally stored per-folder filters and restores their canonical order.
 * An empty array is intentional: it means all five filters are disabled.
 */
export function parseLevelFiltersByFolder(raw: string | null): LevelFiltersByFolder {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const result: LevelFiltersByFolder = {};
  for (const [folderId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!folderId || !Array.isArray(value)) continue;
    const selected = new Set(value.filter(isLevelFilterKey));
    // Preserve an intentionally empty selection, but treat a non-empty array with no
    // recognized values as corrupt data and fall back to the all-enabled default.
    if (value.length > 0 && selected.size === 0) continue;
    result[folderId] = ALL_LEVEL_KEYS.filter(level => selected.has(level));
  }
  return result;
}

export const LEVEL_ORDER: Record<string, number> = { perfect: 0, good: 1, slightly: 2, unknown: 3 };

export const LEVEL_FILTER_OPTIONS: Array<{ level: string; icon: string | null; color: string }> = [
  { level: 'perfect',  icon: '◎',               color: '#5EBF84' },
  { level: 'good',     icon: 'ellipse-outline',  color: '#6BA4F0' },
  { level: 'slightly', icon: 'triangle-outline', color: '#F2B445' },
  { level: 'unknown',  icon: 'close-outline',    color: '#ED7373' },
  { level: 'none',     icon: null,               color: '#AEB6C0' },
];
