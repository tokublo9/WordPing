/** New and legacy installations both start with the visual decoration hidden. */
export const DEFAULT_SHOW_RESULT_COLOR = false;

/** Only the exact value written by the app enables the decoration. */
export function parseShowResultColorPreference(raw: string | null | undefined): boolean {
  return raw === 'true';
}

export function serializeShowResultColorPreference(value: boolean): string {
  return value ? 'true' : 'false';
}
