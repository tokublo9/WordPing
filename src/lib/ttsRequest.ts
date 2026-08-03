import type { AIVoice } from './aiVoices';

export const AI_SPEECH_MODEL = 'gpt-4o-mini-tts';
export const AI_SPEECH_FORMAT = 'wav' as const;
export const AI_SPEECH_SPEED = 1;

export interface NormalizedTTSRequest {
  text: string;
  voice: AIVoice;
  speed: number;
  model: typeof AI_SPEECH_MODEL;
  format: typeof AI_SPEECH_FORMAT;
  contentVersion?: string;
}

/** Keep local cache and server request identity aligned without retaining raw text in logs. */
export function normalizeTTSRequest(
  text: string,
  voice: AIVoice,
  contentVersion?: string,
): NormalizedTTSRequest {
  return {
    text: text.trim().replace(/\s+/gu, ' '),
    voice,
    speed: AI_SPEECH_SPEED,
    model: AI_SPEECH_MODEL,
    format: AI_SPEECH_FORMAT,
    ...(contentVersion ? { contentVersion } : {}),
  };
}

export function serializeTTSCacheKey(request: NormalizedTTSRequest): string {
  return JSON.stringify({
    text: request.text,
    voice: request.voice,
    speed: request.speed,
    model: request.model,
    format: request.format,
    ...(request.contentVersion ? { contentVersion: request.contentVersion } : {}),
  });
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/** Lightweight structural validation before handing a disk-cached WAV to the native player. */
export function isSupportedCachedWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 44 || fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WAVE') return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredSize = view.getUint32(4, true) + 8;
  if (declaredSize > bytes.byteLength) return false;

  let offset = 12;
  let validFormat = false;
  let blockAlign = 0;
  let validData = false;
  while (offset + 8 <= declaredSize) {
    const id = fourCC(bytes, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    const payloadEnd = payloadOffset + chunkSize;
    if (payloadEnd > declaredSize || payloadEnd > bytes.byteLength) return false;

    if (id === 'fmt ') {
      if (chunkSize < 16) return false;
      const audioFormat = view.getUint16(payloadOffset, true);
      const channels = view.getUint16(payloadOffset + 2, true);
      const sampleRate = view.getUint32(payloadOffset + 4, true);
      blockAlign = view.getUint16(payloadOffset + 12, true);
      const bitsPerSample = view.getUint16(payloadOffset + 14, true);
      validFormat = audioFormat === 1 && channels > 0 && sampleRate > 0 &&
        bitsPerSample === 16 && blockAlign === channels * 2;
    } else if (id === 'data') {
      validData = chunkSize > 0 && blockAlign > 0 && chunkSize % blockAlign === 0;
    }

    offset = payloadEnd + (chunkSize % 2);
  }
  return validFormat && validData;
}

interface PendingRequest<T> {
  controller: AbortController;
  promise: Promise<T>;
}

/** Shares identical work and makes cancellation race-safe when a retry starts immediately. */
export class DeduplicatedRequestRegistry<T> {
  private readonly pending = new Map<string, PendingRequest<T>>();

  run(key: string, factory: (signal: AbortSignal) => Promise<T>): PendingRequest<T> & { deduplicated: boolean } {
    const existing = this.pending.get(key);
    if (existing) return { ...existing, deduplicated: true };

    const controller = new AbortController();
    const entry: PendingRequest<T> = {
      controller,
      promise: Promise.resolve().then(() => factory(controller.signal)),
    };
    this.pending.set(key, entry);
    void entry.promise.finally(() => {
      // A cancelled request may finish after its immediate retry was inserted.
      // Delete only the entry that actually settled.
      if (this.pending.get(key) === entry) this.pending.delete(key);
    }).catch(() => {});
    return { ...entry, deduplicated: false };
  }

  cancel(controller: AbortController): void {
    controller.abort();
    for (const [key, entry] of this.pending) {
      if (entry.controller === controller) this.pending.delete(key);
    }
  }
}
