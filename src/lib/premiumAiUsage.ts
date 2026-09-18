export interface PremiumAiUsageWindow {
  used: number;
  limit: number;
  resetsAt: string;
}

export interface PremiumAiUsage {
  day: PremiumAiUsageWindow;
  month: PremiumAiUsageWindow;
}

function parseWindow(value: unknown): PremiumAiUsageWindow | null {
  if (!value || typeof value !== 'object') return null;
  const window = value as Record<string, unknown>;
  if (typeof window.used !== 'number' || !Number.isInteger(window.used) || window.used < 0
    || typeof window.limit !== 'number' || !Number.isInteger(window.limit) || window.limit < 0
    || typeof window.resetsAt !== 'string' || !Number.isFinite(Date.parse(window.resetsAt))) {
    return null;
  }
  return { used: window.used, limit: window.limit, resetsAt: window.resetsAt };
}

/** Only server-verified Premium counters may appear in the usage display. */
export function parsePremiumAiUsage(value: unknown): PremiumAiUsage | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  if (payload.tier !== 'premium' || !payload.usage || typeof payload.usage !== 'object') return null;
  const usage = payload.usage as Record<string, unknown>;
  const day = parseWindow(usage.day);
  const month = parseWindow(usage.month);
  return day && month ? { day, month } : null;
}

export function remainingAiRequests(window: PremiumAiUsageWindow): number {
  return Math.max(0, window.limit - window.used);
}

/** Compact reset countdown, rounded up and never shorter than one minute. */
export function formatAiUsageReset(resetsAt: string, now: number, language: string): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(resetsAt) - now) / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const mins = minutes % 60;
  const number = new Intl.NumberFormat(language);
  const japanese = language.startsWith('ja');
  // Hermes can convert Intl unit formatting into seconds (e.g. 10h -> 36,000 sec).
  // Format the countdown units ourselves so it never displays seconds.
  const compact = (value: number, suffix: string) => `${number.format(value)}${suffix}`;
  if (days > 0) return japanese
    ? `${number.format(days)}日 ${number.format(hours)}時間`
    : `${compact(days, 'd')} ${compact(hours, 'h')}`;
  if (hours > 0) return japanese
    ? `${number.format(hours)}時間 ${number.format(mins)}分`
    : `${compact(hours, 'h')} ${compact(mins, 'm')}`;
  return japanese ? `${number.format(mins)}分` : compact(mins, 'm');
}
