type StopAudio = () => void;

interface AudioFocus {
  token: symbol;
  stop: StopAudio;
}

let activeFocus: AudioFocus | null = null;

/**
 * Claim app-wide audio focus and stop playback owned by another feature.
 * The token prevents a stale completion callback from releasing newer audio.
 */
export function claimAudioFocus(stop: StopAudio): symbol {
  const previous = activeFocus;
  activeFocus = null;
  try { previous?.stop(); } catch {}

  const token = Symbol('audio-focus');
  activeFocus = { token, stop };
  return token;
}

export function releaseAudioFocus(token: symbol | null): void {
  if (token && activeFocus?.token === token) activeFocus = null;
}
