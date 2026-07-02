// expo-audio is lazy-required so that a missing native module (e.g. in an
// older Expo Go build) throws at call-time rather than at module evaluation.
function audioLib() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-audio') as typeof import('expo-audio');
}

type AudioPlayer = import('expo-audio').AudioPlayer;

// ── Module-level singleton state ─────────────────────────────────────────────

let currentPlayer: AudioPlayer | null = null;

// Rejects the promise returned by the previous speakWithAI call when a new
// one starts, so the caller's `setLoadingVoice(null)` fires immediately.
let pendingReject: ((e: Error) => void) | null = null;

// Incremented on every speakWithAI call; lets us detect when a concurrent
// call superseded us during an async gap (e.g. the network fetch).
let epoch = 0;

// ── Audio cache ───────────────────────────────────────────────────────────────

const base64Cache = new Map<string, string>();
const inFlight   = new Map<string, Promise<string>>();

async function toBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fetchBase64(text: string): Promise<string> {
  if (base64Cache.has(text)) return Promise.resolve(base64Cache.get(text)!);
  if (inFlight.has(text))   return inFlight.get(text)!;

  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) return Promise.reject(new Error('EXPO_PUBLIC_OPENAI_API_KEY is not set'));

  const p = (async () => {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: text,
        voice: 'marin',
        response_format: 'wav',
        instructions: 'Speak in an emotive and friendly tone.',
      }),
    });
    if (!res.ok) {
      inFlight.delete(text);
      if (res.status === 429) throw new Error('quota_exceeded');
      throw new Error(`OpenAI TTS failed: ${res.status}`);
    }
    const b64 = await toBase64(await res.arrayBuffer());
    base64Cache.set(text, b64);
    inFlight.delete(text);
    return b64;
  })();

  inFlight.set(text, p);
  return p;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function stopCurrent() {
  // Reject the promise returned by the previous play so the caller's
  // loadingVoice state resets without waiting for playback to finish.
  if (pendingReject) {
    pendingReject(new Error('cancelled'));
    pendingReject = null;
  }
  if (currentPlayer) {
    try { currentPlayer.remove(); } catch {}
    currentPlayer = null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Call when a card becomes visible to warm the cache in the background.
export async function preloadAI(text: string): Promise<void> {
  if (base64Cache.has(text) || inFlight.has(text)) return;
  try { await fetchBase64(text); } catch {}
}

/**
 * Fetch (or use cached) audio for `text` and play it.
 * Returns a Promise that resolves when playback finishes, or rejects on
 * error / when another speakWithAI call supersedes this one.
 */
export async function speakWithAI(text: string): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();

  // Immediately stop any prior playback and cancel its pending promise.
  stopCurrent();
  const myEpoch = ++epoch;

  // ── Fetch audio data ───────────────────────────────────────────────────────
  const base64 = await fetchBase64(text);

  // If another speakWithAI call arrived while we were fetching, bail out.
  if (myEpoch !== epoch) throw new Error('cancelled');

  // ── Prepare audio session ─────────────────────────────────────────────────
  // Always re-apply: iOS resets the audio session after backgrounding or when
  // another app takes audio focus, making subsequent playback silent/missing.
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {}

  if (myEpoch !== epoch) throw new Error('cancelled');

  // ── Create player and play ────────────────────────────────────────────────
  const player = createAudioPlayer({ uri: `data:audio/wav;base64,${base64}` });
  currentPlayer = player;

  return new Promise<void>((resolve, reject) => {
    pendingReject = reject;

    const finish = (err?: Error) => {
      sub.remove();
      try { player.remove(); } catch {}
      if (currentPlayer === player) currentPlayer = null;
      if (pendingReject === reject) pendingReject = null;
      err ? reject(err) : resolve();
    };

    const sub = player.addListener('playbackStatusUpdate', (status: any) => {
      if (status.didJustFinish) {
        finish();
      } else if (status.error) {
        finish(new Error(`Playback error: ${status.error}`));
      }
    });

    try {
      player.play();
    } catch (e) {
      finish(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Stop any active playback immediately (e.g. on component unmount). */
export function stopPlayback(): void {
  stopCurrent();
  epoch++; // Abort any in-flight fetch that hasn't created a player yet.
}
