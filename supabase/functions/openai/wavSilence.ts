const PCM_FORMAT = 1;
// Start detection is deliberately more sensitive than end detection so quiet
// fricatives (/s/, /f/, /th/, /sh/, /squ/) are treated as speech rather than
// leading silence.
const AUDIBLE_START_THRESHOLD_DBFS = -60;
const AUDIBLE_END_THRESHOLD_DBFS = -50;
const ANALYSIS_WINDOW_MS = 10;
const RELEASE_PADDING_MS = 40;
const MINIMUM_TRIM_MS = 80;
const MAX_SUPPORTED_CHANNELS = 8;
const MAX_SUPPORTED_SAMPLE_RATE = 384_000;
const STREAMING_SIZE_SENTINEL = 0xffffffff;

export interface AudioTiming {
  durationMs: number;
  audibleStartMs: number;
  audibleEndMs: number;
  leadingSilenceMs: number;
  trailingSilenceMs: number;
}

export interface WavTrimResult {
  audio: ArrayBuffer;
  before: AudioTiming;
  after: AudioTiming;
  trimmed: boolean;
}

export type WavAnalysisStage = 'wav_parse' | 'pcm_analysis' | 'wav_trim';

export interface WavAnalysisFailure {
  stage: WavAnalysisStage;
  name: string;
  message: string;
}

export interface BestEffortWavResult {
  audio: ArrayBuffer;
  timing: WavTrimResult | null;
  failure: WavAnalysisFailure | null;
}

interface ParsedPcmWav {
  channels: number;
  sampleRate: number;
  blockAlign: number;
  dataOffset: number;
  dataSizeOffset: number;
  frameCount: number;
}

class WavAnalysisError extends Error {
  constructor(
    readonly stage: WavAnalysisStage,
    message: string,
  ) {
    super(message);
    this.name = 'WavAnalysisError';
  }
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function parsePcm16Wav(audio: ArrayBuffer): ParsedPcmWav {
  const bytes = new Uint8Array(audio);
  if (bytes.byteLength < 12) throw new WavAnalysisError('wav_parse', 'WAV header is truncated');
  if (fourCC(bytes, 0) !== 'RIFF') throw new WavAnalysisError('wav_parse', 'Missing RIFF signature');
  if (fourCC(bytes, 8) !== 'WAVE') throw new WavAnalysisError('wav_parse', 'Missing WAVE signature');

  const view = new DataView(audio);
  const riffSize = view.getUint32(4, true);
  if (riffSize !== STREAMING_SIZE_SENTINEL && riffSize + 8 > bytes.byteLength) {
    throw new WavAnalysisError('wav_parse', 'RIFF payload is truncated');
  }

  let channels: number | null = null;
  let sampleRate: number | null = null;
  let blockAlign: number | null = null;
  let bitsPerSample: number | null = null;
  let audioFormat: number | null = null;
  let dataOffset: number | null = null;
  let dataSizeOffset: number | null = null;
  let dataSize: number | null = null;
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = fourCC(bytes, offset);
    const declaredSize = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    const availableSize = bytes.byteLength - payloadOffset;
    const streamingData = chunkId === 'data' && declaredSize === STREAMING_SIZE_SENTINEL;

    if (!streamingData && declaredSize > availableSize) {
      throw new WavAnalysisError('wav_parse', `${chunkId} chunk is truncated`);
    }
    const chunkSize = streamingData ? availableSize : declaredSize;

    if (chunkId === 'fmt ' && audioFormat == null) {
      if (chunkSize < 16) throw new WavAnalysisError('wav_parse', 'fmt chunk is truncated');
      audioFormat = view.getUint16(payloadOffset, true);
      channels = view.getUint16(payloadOffset + 2, true);
      sampleRate = view.getUint32(payloadOffset + 4, true);
      blockAlign = view.getUint16(payloadOffset + 12, true);
      bitsPerSample = view.getUint16(payloadOffset + 14, true);
    } else if (chunkId === 'data' && dataOffset == null) {
      dataOffset = payloadOffset;
      dataSizeOffset = offset + 4;
      dataSize = chunkSize;
    }

    if (streamingData) {
      offset = bytes.byteLength;
      break;
    }
    const paddedSize = declaredSize + (declaredSize % 2);
    const nextOffset = payloadOffset + paddedSize;
    if (nextOffset > bytes.byteLength) {
      throw new WavAnalysisError('wav_parse', `${chunkId} chunk padding is truncated`);
    }
    offset = nextOffset;
  }

  if (audioFormat == null) throw new WavAnalysisError('wav_parse', 'fmt chunk was not found');
  if (dataOffset == null || dataSizeOffset == null || dataSize == null) {
    throw new WavAnalysisError('wav_parse', 'data chunk was not found');
  }
  if (audioFormat !== PCM_FORMAT) {
    throw new WavAnalysisError('wav_parse', `Unsupported WAV sample format: ${audioFormat}`);
  }
  if (bitsPerSample !== 16) {
    throw new WavAnalysisError('wav_parse', `Unsupported PCM bit depth: ${bitsPerSample ?? 0}`);
  }
  if (channels == null || channels < 1 || channels > MAX_SUPPORTED_CHANNELS) {
    throw new WavAnalysisError('wav_parse', `Invalid channel count: ${channels ?? 0}`);
  }
  if (sampleRate == null || sampleRate < 1 || sampleRate > MAX_SUPPORTED_SAMPLE_RATE) {
    throw new WavAnalysisError('wav_parse', `Invalid sample rate: ${sampleRate ?? 0}`);
  }
  if (blockAlign !== channels * 2) {
    throw new WavAnalysisError('wav_parse', `Invalid block alignment: ${blockAlign ?? 0}`);
  }
  if (dataSize === 0) throw new WavAnalysisError('wav_parse', 'WAV data chunk is empty');
  if (dataSize % blockAlign !== 0) {
    throw new WavAnalysisError('wav_parse', 'WAV data ends with a partial PCM frame');
  }

  return {
    channels,
    sampleRate,
    blockAlign,
    dataOffset,
    dataSizeOffset,
    frameCount: dataSize / blockAlign,
  };
}

function milliseconds(frames: number, sampleRate: number): number {
  return Math.round(frames * 1000 / sampleRate);
}

function timing(
  frameCount: number,
  audibleStartFrame: number,
  audibleEndFrame: number,
  sampleRate: number,
): AudioTiming {
  const durationMs = milliseconds(frameCount, sampleRate);
  const audibleStartMs = Math.min(durationMs, Math.max(0, milliseconds(audibleStartFrame, sampleRate)));
  const audibleEndMs = Math.min(durationMs, Math.max(audibleStartMs, milliseconds(audibleEndFrame, sampleRate)));
  return {
    durationMs,
    audibleStartMs,
    audibleEndMs,
    leadingSilenceMs: audibleStartMs,
    trailingSilenceMs: Math.max(0, durationMs - audibleEndMs),
  };
}

function analyzeAndTrimWav(audio: ArrayBuffer): WavTrimResult {
  const wav = parsePcm16Wav(audio);
  const view = new DataView(audio);
  const windowFrames = Math.max(1, Math.round(wav.sampleRate * ANALYSIS_WINDOW_MS / 1000));
  const audibleStartThreshold = 10 ** (AUDIBLE_START_THRESHOLD_DBFS / 20);
  const audibleEndThreshold = 10 ** (AUDIBLE_END_THRESHOLD_DBFS / 20);
  let audibleStartFrame: number | null = null;
  let audibleEndFrame = 0;

  try {
    for (let windowStart = 0; windowStart < wav.frameCount; windowStart += windowFrames) {
      const windowEnd = Math.min(wav.frameCount, windowStart + windowFrames);
      let sumSquares = 0;
      let sampleCount = 0;

      for (let frame = windowStart; frame < windowEnd; frame++) {
        const frameOffset = wav.dataOffset + frame * wav.blockAlign;
        for (let channel = 0; channel < wav.channels; channel++) {
          const sample = view.getInt16(frameOffset + channel * 2, true) / 32768;
          sumSquares += sample * sample;
          sampleCount++;
        }
      }

      const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
      if (audibleStartFrame == null && rms >= audibleStartThreshold) audibleStartFrame = windowStart;
      if (rms >= audibleEndThreshold) audibleEndFrame = windowEnd;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WavAnalysisError('pcm_analysis', message);
  }

  // Do not alter an unexpectedly silent response; returning it unchanged makes
  // upstream generation failures diagnosable instead of producing an empty WAV.
  if (audibleEndFrame === 0) {
    const unchanged = timing(wav.frameCount, 0, wav.frameCount, wav.sampleRate);
    return { audio, before: unchanged, after: unchanged, trimmed: false };
  }

  const detectedStartFrame = audibleStartFrame ?? 0;
  const before = timing(wav.frameCount, detectedStartFrame, audibleEndFrame, wav.sampleRate);
  const releaseFrames = Math.round(wav.sampleRate * RELEASE_PADDING_MS / 1000);
  const minimumTrimFrames = Math.round(wav.sampleRate * MINIMUM_TRIM_MS / 1000);
  const trimmedFrameCount = Math.min(wav.frameCount, audibleEndFrame + releaseFrames);

  if (wav.frameCount - trimmedFrameCount < minimumTrimFrames) {
    return { audio, before, after: before, trimmed: false };
  }

  try {
    const outputLength = wav.dataOffset + trimmedFrameCount * wav.blockAlign;
    const output = new Uint8Array(outputLength);
    output.set(new Uint8Array(audio, 0, outputLength));
    const outputView = new DataView(output.buffer);
    outputView.setUint32(4, outputLength - 8, true);
    outputView.setUint32(wav.dataSizeOffset, trimmedFrameCount * wav.blockAlign, true);

    return {
      audio: output.buffer,
      before,
      after: timing(trimmedFrameCount, detectedStartFrame, audibleEndFrame, wav.sampleRate),
      trimmed: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WavAnalysisError('wav_trim', message);
  }
}

/**
 * Detect and remove the inaudible tail from a 16-bit PCM WAV response.
 * Invalid or unsupported WAV data is reported as null for backward compatibility.
 */
export function trimWavTrailingSilence(audio: ArrayBuffer): WavTrimResult | null {
  try {
    return analyzeAndTrimWav(audio);
  } catch {
    return null;
  }
}

/**
 * Waveform timing is optional. This boundary guarantees that malformed audio or
 * an analyzer defect can never replace successfully downloaded audio with an
 * HTTP error. The caller may log `failure` but must return `audio` unchanged.
 */
export function analyzeWavBestEffort(
  audio: ArrayBuffer,
  analyzer: (value: ArrayBuffer) => WavTrimResult = analyzeAndTrimWav,
): BestEffortWavResult {
  try {
    const timingResult = analyzer(audio);
    return { audio: timingResult.audio, timing: timingResult, failure: null };
  } catch (error) {
    const stage = error instanceof WavAnalysisError ? error.stage : 'pcm_analysis';
    return {
      audio,
      timing: null,
      failure: {
        stage,
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
