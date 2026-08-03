export type TTSPlaybackPhase =
  | 'checking-cache'
  | 'generating-or-downloading'
  | 'ready'
  | 'playing'
  | 'failed'
  | 'idle';

/** The spinner is intentionally exclusive to a confirmed network cache miss. */
export function isTTSNetworkLoading(phase: TTSPlaybackPhase | undefined): boolean {
  return phase === 'generating-or-downloading';
}
