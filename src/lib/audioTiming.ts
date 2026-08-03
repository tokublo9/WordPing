export const AUDIBLE_START_PREROLL_MS = 80;

export interface AudiblePlaybackTiming {
  durationMs: number;
  audibleStartMs?: number;
  audibleEndMs: number;
}

/**
 * Keep a small waveform-relative lead-in before detected speech. The 80 ms is
 * protective audio, not a playback timeout, and avoids clipping low-energy
 * initial consonants such as /s/, /f/, /th/, /sh/, and /squ/.
 */
export function safeAudibleStartSeconds(
  timing: AudiblePlaybackTiming | undefined,
): number {
  if (
    !timing ||
    timing.audibleStartMs == null ||
    !Number.isFinite(timing.audibleStartMs) ||
    timing.audibleStartMs <= 0 ||
    timing.audibleStartMs >= timing.audibleEndMs ||
    timing.audibleEndMs > timing.durationMs
  ) return 0;

  return Math.max(0, timing.audibleStartMs - AUDIBLE_START_PREROLL_MS) / 1000;
}

/** Persist the exact derived seek position alongside waveform timing metadata. */
export function withSafeAudibleStartMs<T extends AudiblePlaybackTiming>(
  timing: T,
): T & { safeStartMs: number } {
  return {
    ...timing,
    safeStartMs: Math.round(safeAudibleStartSeconds(timing) * 1000),
  };
}

export function hasReachedAISpeechAudibleEnd(
  playbackPositionSeconds: number,
  timing: AudiblePlaybackTiming | undefined,
): boolean {
  if (
    !timing ||
    !Number.isFinite(playbackPositionSeconds) ||
    playbackPositionSeconds < 0 ||
    timing.audibleEndMs <= 0
  ) return false;

  return playbackPositionSeconds * 1000 >= timing.audibleEndMs;
}
