import { Directory, File, Paths } from 'expo-file-system';
import { MAX_AI_INPUT_CHARS } from '../constants';
import { DEFAULT_AI_VOICE, type AIVoice } from './aiVoices';
import { isLocalAiVoiceScenarioActive } from '../dev/localAiVoiceScenario';
import { resolveCardVoiceSource } from '../features/voice/cardVoiceSource';

/**
 * Promotional previews always use the app's default voice, matching the voice
 * the Worker speaks them in. The user's saved voice preference is irrelevant
 * here: the clip is a fixed marketing asset shared by every caller and cached
 * server-side, so it must not vary per user.
 */
const PROMO_PREVIEW_VOICE: AIVoice = DEFAULT_AI_VOICE;
import {
  PROMO_SAMPLE_VERSION,
  promoSampleText,
  resolvePromoLang,
  type PromoSampleId,
} from './promoVoiceSamples';
import {
  AI_VOICE_SAMPLES,
  AI_VOICE_SAMPLE_PRELOAD_CONCURRENCY,
  getAIVoiceSample,
} from './aiVoiceSamples';
import {
  hasReachedAISpeechAudibleEnd,
  safeAudibleStartSeconds,
  withSafeAudibleStartMs,
} from './audioTiming';
import {
  getAISpeechRequestTiming,
  getAISpeechTiming,
  isAISpeechTimingDiagnostics,
  requestAISpeech,
  type AISpeechTimingDiagnostics,
  type PromoSpeechRequest,
} from './openaiGateway';
import { isAIConsentGranted } from './aiConsent';
import { claimAudioFocus, releaseAudioFocus } from './audioFocus';
import { deferAudioPlayerRemoval } from './audioPlayerCleanup';
import {
  DeduplicatedRequestRegistry,
  isSupportedCachedWav,
  normalizeTTSRequest,
  serializeTTSCacheKey,
} from './ttsRequest';
import {
  ControlledTTSPreloadQueue,
  DEFAULT_TTS_PRELOAD_CONCURRENCY,
  isAIPronunciationPreloadEligible,
} from './ttsPreloadQueue';
import type { TTSPlaybackPhase } from './ttsPlaybackState';
export type { TTSPlaybackPhase } from './ttsPlaybackState';

// expo-audio is lazy-required so that a missing native module (e.g. in an
// older Expo Go build) throws at call-time rather than at module evaluation.
function audioLib() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-audio') as typeof import('expo-audio');
}

function speechLib() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-speech') as typeof import('expo-speech');
}

type AudioPlayer = import('expo-audio').AudioPlayer;
type AudioStatus = import('expo-audio').AudioStatus;

// ── Module-level singleton state ─────────────────────────────────────────────

let currentPlayer: AudioPlayer | null = null;
let activePlaybackKey: string | null = null;
let stopActivePlayer: (() => void) | null = null;
let focusToken: symbol | null = null;

// Incremented on every speakWithAI call; lets us detect when a concurrent
// call superseded us during an async gap (e.g. the network fetch).
let epoch = 0;
let activeAIVoice: AIVoice = DEFAULT_AI_VOICE;

// ── Persistent audio file cache ───────────────────────────────────────────────

const TTS_CACHE_DIR = 'tts';
// Incrementing this avoids replaying pre-fix files whose encoded duration still
// includes OpenAI's trailing silence.
const TTS_CACHE_VERSION = 'trimmed-v3-leading';

type AudioCacheSource = 'memory' | 'disk' | 'network';

interface CachedAudio {
  uri: string;
  source: AudioCacheSource;
  cacheLookupDurationMs: number;
  networkDurationMs?: number;
  requestDeduplicated?: boolean;
}

export interface TTSPlaybackOptions {
  buttonPressedAtMs?: number;
  onPhaseChange?: (phase: TTSPlaybackPhase) => void;
}

interface AudioCacheLookupOptions {
  onNetworkRequired?: () => void;
  loadingIndicatorAvailable?: boolean;
  trackAsActiveGeneration?: boolean;
  /** Local manual test only: traverse the real request path without deleting cached audio. */
  bypassCache?: boolean;
  sampleVersion?: string;
  /**
   * Fetch a fixed promotional clip instead of speaking `text`.
   *
   * `text` is still supplied — it is what the sample says — but it is used only
   * for the local cache key and never leaves the device: the request body
   * carries the sample id and language code alone.
   */
  promo?: PromoSpeechRequest;
}

// Session-level index: cache key → file URI (avoids repeated File.exists checks)
const fileUriIndex = new Map<string, string>();
const networkRequests = new DeduplicatedRequestRegistry<CachedAudio>();
const preloadQueue = new ControlledTTSPreloadQueue(DEFAULT_TTS_PRELOAD_CONCURRENCY);
const voiceSamplePreloadQueue = new ControlledTTSPreloadQueue(AI_VOICE_SAMPLE_PRELOAD_CONCURRENCY);
const timingByFileUri = new Map<string, AISpeechTimingDiagnostics>();
const validatedFileUris = new Set<string>();
let activeGenerationController: AbortController | null = null;

// FNV-1a 32-bit hash — deterministic, filesystem-safe cache filenames
function fnv32a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h ^ str.charCodeAt(i), 0x01000193)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function ttsCacheFile(cacheKey: string, voice: AIVoice): File {
  const dir = new Directory(Paths.cache, TTS_CACHE_DIR);
  dir.create({ intermediates: true, idempotent: true });
  return new File(dir, `${TTS_CACHE_VERSION}_${voice}_${fnv32a(`${TTS_CACHE_VERSION}\x00${cacheKey}`)}.wav`);
}

function legacyTTSCacheFile(text: string, voice: AIVoice): File {
  const dir = new Directory(Paths.cache, TTS_CACHE_DIR);
  dir.create({ intermediates: true, idempotent: true });
  return new File(dir, `${TTS_CACHE_VERSION}_${voice}_${fnv32a(`${TTS_CACHE_VERSION}\x00${voice}\x00${text}`)}.wav`);
}

function ttsTimingFile(audioFile: File): File {
  return new File(audioFile.parentDirectory, `${audioFile.name}.timing.json`);
}

function restoreCachedTiming(audioFile: File): void {
  const timingFile = ttsTimingFile(audioFile);
  if (!timingFile.exists) return;
  try {
    const parsed: unknown = JSON.parse(timingFile.textSync());
    if (isAISpeechTimingDiagnostics(parsed)) timingByFileUri.set(audioFile.uri, parsed);
  } catch {
    // Timing metadata is diagnostic only; a corrupt sidecar must not prevent playback.
  }
}

async function validateCachedAudioFile(file: File): Promise<boolean> {
  if (!file.exists) return false;
  if (validatedFileUris.has(file.uri)) return true;
  try {
    if (!isSupportedCachedWav(await file.bytes())) return false;
    validatedFileUris.add(file.uri);
    return true;
  } catch {
    return false;
  }
}

function invalidateCachedAudioFile(file: File): void {
  validatedFileUris.delete(file.uri);
  timingByFileUri.delete(file.uri);
  const timingFile = ttsTimingFile(file);
  try { if (timingFile.exists) timingFile.delete(); } catch {}
  try { if (file.exists) file.delete(); } catch {}
}

async function fetchAndCacheAudio(
  text: string,
  voice: AIVoice,
  options: AudioCacheLookupOptions = {},
): Promise<CachedAudio> {
  const request = normalizeTTSRequest(text, voice, options.sampleVersion);
  if (!request.text) return Promise.reject(new Error('input_empty'));
  if (request.text.length > MAX_AI_INPUT_CHARS) return Promise.reject(new Error('input_too_long'));

  const key = serializeTTSCacheKey(request);
  const lookupStartedAtMs = performance.now();

  // 1. Session-level memory index
  const indexed = fileUriIndex.get(key);
  if (indexed && !options.bypassCache) {
    const indexedFile = new File(indexed);
    if (await validateCachedAudioFile(indexedFile)) {
      const cacheLookupDurationMs = Math.round(performance.now() - lookupStartedAtMs);
      if (__DEV__) console.log('[TTS cache] memory hit', { voice, textLength: text.length });
      if (__DEV__) console.log('[TTS playback stages]', {
        source: 'word-card', phase: 'cache-lookup-complete', cacheSource: 'memory',
        loadingIndicatorDisplayed: false, cacheLookupMs: cacheLookupDurationMs,
      });
      return { uri: indexed, source: 'memory', cacheLookupDurationMs };
    }
    if (__DEV__) console.warn('[TTS cache warning]', {
      cacheSource: 'memory', cacheStatus: indexedFile.exists ? 'invalid-or-unreadable' : 'missing',
    });
    invalidateCachedAudioFile(indexedFile);
    fileUriIndex.delete(key);
  }

  // 2. Persistent disk cache
  const cachedFile = ttsCacheFile(key, voice);
  if (!options.bypassCache && await validateCachedAudioFile(cachedFile)) {
    const cacheLookupDurationMs = Math.round(performance.now() - lookupStartedAtMs);
    if (__DEV__) console.log('[TTS cache] disk hit', { voice, textLength: text.length });
    restoreCachedTiming(cachedFile);
    fileUriIndex.set(key, cachedFile.uri);
    if (__DEV__) console.log('[TTS playback stages]', {
      source: 'word-card', phase: 'cache-lookup-complete', cacheSource: 'disk',
      loadingIndicatorDisplayed: false, cacheLookupMs: cacheLookupDurationMs,
    });
    return { uri: cachedFile.uri, source: 'disk', cacheLookupDurationMs };
  }
  if (!options.bypassCache && cachedFile.exists) {
    if (__DEV__) console.warn('[TTS cache warning]', {
      cacheSource: 'disk', cacheStatus: 'invalid-or-unreadable', cacheKeyVersion: 'current',
    });
    invalidateCachedAudioFile(cachedFile);
  }

  // Preserve valid pre-normalization cache files instead of charging for a
  // second generation after this cache-key migration.
  const legacyFile = legacyTTSCacheFile(request.text, voice);
  if (!options.bypassCache && !request.contentVersion && await validateCachedAudioFile(legacyFile)) {
    const cacheLookupDurationMs = Math.round(performance.now() - lookupStartedAtMs);
    restoreCachedTiming(legacyFile);
    fileUriIndex.set(key, legacyFile.uri);
    if (__DEV__) console.log('[TTS playback stages]', {
      source: 'word-card', phase: 'cache-lookup-complete', cacheSource: 'disk',
      cacheKeyVersion: 'legacy', loadingIndicatorDisplayed: false,
      cacheLookupMs: cacheLookupDurationMs,
    });
    return { uri: legacyFile.uri, source: 'disk', cacheLookupDurationMs };
  }
  if (!options.bypassCache && !request.contentVersion && legacyFile.exists) {
    if (__DEV__) console.warn('[TTS cache warning]', {
      cacheSource: 'disk', cacheStatus: 'invalid-or-unreadable', cacheKeyVersion: 'legacy',
    });
    invalidateCachedAudioFile(legacyFile);
  }

  // 3. Deduplicate concurrent requests for the same text+voice
  const cacheLookupDurationMs = Math.round(performance.now() - lookupStartedAtMs);
  if (__DEV__) console.log('[TTS playback stages]', {
    source: 'word-card', phase: 'cache-lookup-complete', cacheSource: 'network',
    loadingIndicatorDisplayed: Boolean(options.loadingIndicatorAvailable),
    cacheLookupMs: cacheLookupDurationMs,
  });
  options.onNetworkRequired?.();
  const pending = networkRequests.run(key, async signal => {
      const networkStartedAtMs = performance.now();
      const ab = await requestAISpeech(
        request.text,
        voice,
        signal,
        request.format,
        options.promo ? 'speech_promo' : request.contentVersion ? 'speech_sample' : 'speech',
        request.contentVersion,
        options.promo,
      );
      const networkCompletedAtMs = performance.now();
      const timing = getAISpeechTiming(ab);
      const requestTiming = getAISpeechRequestTiming(ab);
      const fileWriteStartedAtMs = performance.now();
      const file = ttsCacheFile(key, voice);
      file.create({ overwrite: true });
      file.write(new Uint8Array(ab));
      validatedFileUris.add(file.uri);
      const fileWriteCompletedAtMs = performance.now();
      if (timing) {
        timingByFileUri.set(file.uri, timing);
        const timingFile = ttsTimingFile(file);
        timingFile.create({ overwrite: true });
        timingFile.write(JSON.stringify(withSafeAudibleStartMs(timing)));
      }
      fileUriIndex.set(key, file.uri);
      if (__DEV__ && requestTiming) {
        console.log('[TTS playback stages]', {
          source: 'word-card',
          phase: 'network-audio-ready',
          ttsRequestStartMs: 0,
          ttsRequestCompleteMs: Math.round(
            requestTiming.responseReceivedAtMs - requestTiming.requestStartedAtMs,
          ),
          // Silence analysis moved from the server to the client, so it is now
          // a local stage between download and file write rather than an
          // opaque slice of the server's total time.
          audioAnalysisMs: Math.round(
            requestTiming.analysisCompletedAtMs - requestTiming.responseReceivedAtMs,
          ),
          localFileWriteMs: Math.round(fileWriteCompletedAtMs - fileWriteStartedAtMs),
          apiRequestId: requestTiming.requestId,
          apiCache: requestTiming.cache,
        });
      }
      return {
        uri: file.uri,
        source: 'network',
        cacheLookupDurationMs,
        networkDurationMs: Math.round(networkCompletedAtMs - networkStartedAtMs),
      };
  });
  const trackAsActiveGeneration = options.trackAsActiveGeneration !== false;
  if (trackAsActiveGeneration) activeGenerationController = pending.controller;
  if (__DEV__) console.log(
    pending.deduplicated ? '[TTS cache] in-flight dedup' : '[TTS cache] miss — fetching',
    { voice, textLength: request.text.length },
  );
  return pending.promise
    .then(audio => ({
      ...audio,
      cacheLookupDurationMs,
      requestDeduplicated: pending.deduplicated,
    }))
    .finally(() => {
      if (trackAsActiveGeneration && activeGenerationController === pending.controller) {
        activeGenerationController = null;
      }
    });
}

export interface AIPronunciationPreloadOptions {
  entryId: string;
  text: string;
  voice: AIVoice;
  hasAIAccess: boolean;
  hasCustomAudio?: boolean;
}

/**
 * Queue pronunciation generation after registration without creating a player
 * or changing playback UI. Manual playback uses the same fetch/cache function
 * and request registry, so it can join a running preload.
 */
export function preloadAIPronunciation(options: AIPronunciationPreloadOptions): void {
  if (!isAIPronunciationPreloadEligible(options)) return;
  // No user action is behind a preload, so it must never raise the consent
  // dialog — and without consent it has nothing to do. The hard guard in
  // api/client.ts would refuse the request anyway; stopping here keeps a
  // whole library sweep from queueing work that can only fail.
  if (!isAIConsentGranted()) return;

  const request = normalizeTTSRequest(options.text, options.voice);
  if (!request.text || request.text.length > MAX_AI_INPUT_CHARS || !options.entryId) return;
  const key = serializeTTSCacheKey(request);

  const queued = preloadQueue.enqueue(key, options.entryId, async () => {
    const startedAtMs = performance.now();
    if (__DEV__) console.log('[TTS preload diagnostic]', {
      phase: 'preload-started',
      voice: request.voice,
      textLength: request.text.length,
      concurrencyLimit: DEFAULT_TTS_PRELOAD_CONCURRENCY,
    });

    try {
      const audio = await fetchAndCacheAudio(request.text, request.voice, {
        loadingIndicatorAvailable: false,
        trackAsActiveGeneration: false,
      });
      const durationMs = Math.round(performance.now() - startedAtMs);
      if (__DEV__ && audio.source !== 'network') console.log('[TTS preload diagnostic]', {
        phase: 'cache-hit',
        cacheSource: audio.source,
        cacheLookupMs: audio.cacheLookupDurationMs,
        loadingIndicatorDisplayed: false,
      });
      if (__DEV__ && audio.requestDeduplicated) console.log('[TTS preload diagnostic]', {
        phase: 'in-flight-request-reused',
        cacheSource: 'network',
        loadingIndicatorDisplayed: false,
      });
      if (__DEV__) console.log('[TTS preload diagnostic]', {
        phase: 'preload-completed',
        cacheSource: audio.source,
        preloadDurationMs: durationMs,
        cacheLookupMs: audio.cacheLookupDurationMs,
        networkGenerationDownloadDurationMs: audio.networkDurationMs ?? 0,
        loadingIndicatorDisplayed: false,
        discardedForDeletedEntry: !preloadQueue.hasOwners(key),
      });
    } catch (error) {
      if (__DEV__) console.warn('[TTS preload diagnostic]', {
        phase: 'preload-failed',
        preloadDurationMs: Math.round(performance.now() - startedAtMs),
        loadingIndicatorDisplayed: false,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : 'unknown_error',
      });
      // Best-effort only. The request registry removes failed work so a later
      // user tap retries through the normal path.
    }
  });

  if (__DEV__) console.log('[TTS preload diagnostic]', {
    phase: queued.deduplicated ? 'preload-in-flight-reused' : 'preload-queued',
    queueState: queued.state,
    loadingIndicatorDisplayed: false,
  });
  void queued.promise.catch(() => {});
}

export interface AIPronunciationLibraryEntry {
  id: string;
  text: string;
  hasCustomAudio?: boolean;
}

export interface AIPronunciationLibraryPreloadOptions {
  entries: readonly AIPronunciationLibraryEntry[];
  voice: AIVoice;
  hasAIAccess: boolean;
  triggerReason: string;
}

/**
 * Queue pronunciation generation for a whole library at once — used when an entitlement
 * becomes active, so existing words are already cached before their first tap.
 *
 * Each entry goes through `preloadAIPronunciation`, so this inherits its cache hits,
 * in-flight deduplication and single-slot queue: the work is serialized in the
 * background rather than fired off in parallel. Entries already on disk cost a cache
 * lookup and nothing more, which is what makes re-running this cheap.
 */
export function preloadAIPronunciationLibrary(
  options: AIPronunciationLibraryPreloadOptions,
): void {
  if (!options.hasAIAccess || options.entries.length === 0) return;
  // Same rule as the single-entry preload: a background sweep of the whole
  // library is exactly the kind of unattended transmission consent exists to
  // prevent. Each entry is checked again inside preloadAIPronunciation.
  if (!isAIConsentGranted()) return;

  if (__DEV__) console.log('[TTS preload diagnostic]', {
    phase: 'library-preload-started',
    triggerReason: options.triggerReason,
    totalEntries: options.entries.length,
    voice: options.voice,
    concurrencyLimit: DEFAULT_TTS_PRELOAD_CONCURRENCY,
    loadingIndicatorDisplayed: false,
  });

  for (const entry of options.entries) {
    preloadAIPronunciation({
      entryId: entry.id,
      text: entry.text,
      voice: options.voice,
      hasAIAccess: true,
      hasCustomAudio: entry.hasCustomAudio,
    });
  }
}

/** Stop associating queued/running preload work with a deleted card. */
export function cancelAIPronunciationPreload(entryId: string): void {
  if (!entryId) return;
  const result = preloadQueue.cancelOwner(entryId);
  if (__DEV__ && (result.queuedCancelled > 0 || result.runningDiscarded > 0)) {
    console.log('[TTS preload diagnostic]', {
      phase: 'entry-deleted',
      queuedCancelled: result.queuedCancelled,
      runningResultsDiscarded: result.runningDiscarded,
    });
  }
}

export interface AIVoiceSamplePreloadOptions {
  hasAIAccess: boolean;
  activeEntitlement?: 'basic' | 'premium';
  triggerReason: string;
}

const VOICE_SAMPLE_PRELOAD_OWNER = 'natural-ai-voice-samples';
const failedVoiceSampleKeys = new Set<string>();
let voiceSamplePreloadEligible = false;
let activeVoiceSamplePreload: Promise<void> | null = null;
let pendingVoiceSamplePreloadTrigger: AIVoiceSamplePreloadOptions | null = null;

/**
 * Preload the fixed Natural AI Voice previews without creating a player or
 * changing any button state. Disk files are the persisted completion state and
 * are structurally validated before they are trusted after an app restart.
 */
export function syncAIVoiceSamplePreloading(options: AIVoiceSamplePreloadOptions): void {
  const wasEligible = voiceSamplePreloadEligible;
  // Consent is part of eligibility, not an extra early return: passing it
  // through the existing flag means revoking consent cancels queued sample work
  // exactly the way losing the entitlement does.
  voiceSamplePreloadEligible = options.hasAIAccess && isAIConsentGranted();
  if (!voiceSamplePreloadEligible) {
    const cancelled = voiceSamplePreloadQueue.cancelOwner(VOICE_SAMPLE_PRELOAD_OWNER);
    if (__DEV__) console.log('[AI voice sample preload]', {
      phase: 'eligibility-inactive',
      triggerReason: options.triggerReason,
      queuedCancelled: cancelled.queuedCancelled,
      runningDiscarded: cancelled.runningDiscarded,
    });
    return;
  }

  if (activeVoiceSamplePreload) {
    if (!wasEligible) pendingVoiceSamplePreloadTrigger = options;
    if (__DEV__) console.log('[AI voice sample preload]', {
      phase: 'trigger-reused',
      triggerReason: options.triggerReason,
      activeEntitlement: options.activeEntitlement,
    });
    return;
  }

  const preloadStartedAtMs = performance.now();
  if (__DEV__) console.log('[AI voice sample preload]', {
    phase: 'started',
    triggerReason: options.triggerReason,
    activeEntitlement: options.activeEntitlement,
    totalSamples: AI_VOICE_SAMPLES.length,
    concurrencyLimit: AI_VOICE_SAMPLE_PRELOAD_CONCURRENCY,
    loadingIndicatorDisplayed: false,
  });

  const work = AI_VOICE_SAMPLES.map((sample, index) => {
    const request = normalizeTTSRequest(sample.text, sample.voice, sample.contentVersion);
    const key = serializeTTSCacheKey(request);
    if (failedVoiceSampleKeys.has(key)) return Promise.resolve();

    const queued = voiceSamplePreloadQueue.enqueue(key, VOICE_SAMPLE_PRELOAD_OWNER, async () => {
      if (!voiceSamplePreloadEligible) return;
      const sampleStartedAtMs = performance.now();
      try {
        const audio = await fetchAndCacheAudio(sample.text, sample.voice, {
          loadingIndicatorAvailable: false,
          trackAsActiveGeneration: false,
          sampleVersion: sample.contentVersion,
        });
        if (__DEV__) console.log('[AI voice sample preload]', {
          phase: audio.source === 'network' ? 'sample-completed' : 'cache-hit',
          sampleId: sample.id,
          queueProgress: `${index + 1}/${AI_VOICE_SAMPLES.length}`,
          cacheSource: audio.source,
          inFlightRequestReused: Boolean(audio.requestDeduplicated),
          sampleDurationMs: Math.round(performance.now() - sampleStartedAtMs),
          networkGenerationDownloadDurationMs: audio.networkDurationMs ?? 0,
          loadingIndicatorDisplayed: false,
        });
      } catch (error) {
        failedVoiceSampleKeys.add(key);
        if (__DEV__) console.warn('[AI voice sample preload]', {
          phase: 'sample-failed',
          sampleId: sample.id,
          queueProgress: `${index + 1}/${AI_VOICE_SAMPLES.length}`,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : 'unknown_error',
          loadingIndicatorDisplayed: false,
        });
      }
    });
    if (__DEV__ && queued.deduplicated) console.log('[AI voice sample preload]', {
      phase: 'queue-request-reused',
      sampleId: sample.id,
      queueState: queued.state,
    });
    return queued.promise;
  });

  const run = Promise.allSettled(work).then(() => {
    if (__DEV__) console.log('[AI voice sample preload]', {
      phase: 'finished',
      totalSamples: AI_VOICE_SAMPLES.length,
      failedSamples: failedVoiceSampleKeys.size,
      totalDurationMs: Math.round(performance.now() - preloadStartedAtMs),
      loadingIndicatorDisplayed: false,
    });
  });
  const trackedRun = run.finally(() => {
    if (activeVoiceSamplePreload !== trackedRun) return;
    activeVoiceSamplePreload = null;
    const nextTrigger = pendingVoiceSamplePreloadTrigger;
    pendingVoiceSamplePreloadTrigger = null;
    if (voiceSamplePreloadEligible && nextTrigger) syncAIVoiceSamplePreloading(nextTrigger);
  });
  activeVoiceSamplePreload = trackedRun;
  void activeVoiceSamplePreload.catch(() => {});
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function stopCurrent() {
  const generationController = activeGenerationController;
  if (generationController) networkRequests.cancel(generationController);
  activeGenerationController = null;
  const stop = stopActivePlayer;
  stopActivePlayer = null;
  if (stop) {
    stop();
  } else if (currentPlayer) {
    // Native expo-audio's remove() only unregisters the player; it does not
    // pause the underlying AVPlayer/ExoPlayer, so pause explicitly first.
    try { currentPlayer.pause(); } catch {}
    try { currentPlayer.remove(); } catch {}
    currentPlayer = null;
  }
  // Also stop any active device TTS session.
  try { speechLib().stop(); } catch {}
  releaseAudioFocus(focusToken);
  focusToken = null;
}

function beginPlayback(key: string): number | null {
  if (activePlaybackKey === key) {
    stopCurrent();
    activePlaybackKey = null;
    epoch++;
    return null;
  }

  stopCurrent();
  activePlaybackKey = key;
  focusToken = claimAudioFocus(stopPlayback);
  return ++epoch;
}

function finishPlayback(key: string, playbackEpoch: number) {
  if (epoch === playbackEpoch && activePlaybackKey === key) {
    activePlaybackKey = null;
    releaseAudioFocus(focusToken);
    focusToken = null;
  }
}

// ── Device TTS (free users) ───────────────────────────────────────────────────

/**
 * Detect the BCP-47 locale to use for device TTS based on the text content.
 * Uses Unicode script ranges so English words are always read with an English
 * voice even if the app UI language is set to Japanese (or any other language).
 */
function detectLocale(text: string): string {
  // Japanese: hiragana (U+3040–309F) or katakana (U+30A0–30FF)
  if (/[぀-ヿ]/.test(text)) return 'ja-JP';
  // Korean: Hangul syllables (U+AC00–D7AF) and Hangul Jamo (U+1100–11FF)
  if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'ko-KR';
  // CJK Unified Ideographs — without kana already caught above, treat as Chinese
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh-CN';
  // Arabic script
  if (/[؀-ۿ]/.test(text)) return 'ar';
  // Default to English for Latin-based scripts
  return 'en-US';
}

function speakFree(text: string, locale: string, options: TTSPlaybackOptions = {}): Promise<void> {
  const playbackKey = `device:${locale}:${text}`;
  const playbackEpoch = beginPlayback(playbackKey);
  if (playbackEpoch == null) return Promise.resolve();
  options.onPhaseChange?.('ready');

  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      options.onPhaseChange?.('idle');
      finishPlayback(playbackKey, playbackEpoch);
      resolve();
    };

    // Try with the full locale first; if the device doesn't have that voice,
    // fall back to the bare language subtag (e.g. 'ja' instead of 'ja-JP').
    function attempt(l: string, retried: boolean) {
      try {
        speechLib().speak(text, {
          language:  l,
          onStart:   () => options.onPhaseChange?.('playing'),
          onDone:    finish,
          onStopped: finish,
          onError: (e) => {
            if (playbackEpoch !== epoch) { reject(new Error('cancelled')); return; }
            if (!retried) {
              const base = l.split('-')[0];
              if (base !== l) { attempt(base, true); return; }
            }
            finishPlayback(playbackKey, playbackEpoch);
            options.onPhaseChange?.('failed');
            options.onPhaseChange?.('idle');
            reject(e instanceof Error ? e : new Error(String(e)));
          },
        });
      } catch (e) {
        if (playbackEpoch !== epoch) { reject(new Error('cancelled')); return; }
        if (!retried) {
          const base = l.split('-')[0];
          if (base !== l) { attempt(base, true); return; }
        }
        finishPlayback(playbackKey, playbackEpoch);
        options.onPhaseChange?.('failed');
        options.onPhaseChange?.('idle');
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
    attempt(locale, false);
  });
}

// ── OpenAI TTS (Pro users) ────────────────────────────────────────────────────

async function speakWithAI(
  text: string,
  voice: AIVoice = activeAIVoice,
  options: TTSPlaybackOptions = {},
  sampleVersion?: string,
  promo?: PromoSpeechRequest,
): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();
  const buttonPressAtMs = options.buttonPressedAtMs ?? performance.now();
  let loadingIndicatorDisplayed = false;
  let networkLoadingStartedAtMs: number | null = null;
  let reportedPhase: TTSPlaybackPhase = 'idle';
  const reportPhase = (phase: TTSPlaybackPhase) => {
    if (reportedPhase === phase) return;
    reportedPhase = phase;
    options.onPhaseChange?.(phase);
  };

  const playbackKey = `ai:${voice}:${sampleVersion ?? 'card'}:${text}`;
  const myEpoch = beginPlayback(playbackKey);
  if (myEpoch == null) return;
  reportPhase('checking-cache');

  if (__DEV__) {
    console.log('[TTS playback stages]', {
      source: 'word-card',
      phase: 'button-press',
      buttonPressMs: 0,
      textLength: text.length,
    });
  }

  try {
    // ── Fetch audio (or hit local file cache) ────────────────────────────────
    const audioLoadStartedAtMs = performance.now();
    const {
      uri: fileUri,
      source: cacheSource,
      cacheLookupDurationMs,
      networkDurationMs,
      requestDeduplicated,
    } = await fetchAndCacheAudio(text, voice, {
      loadingIndicatorAvailable: Boolean(options.onPhaseChange),
      onNetworkRequired: () => {
        networkLoadingStartedAtMs = performance.now();
        loadingIndicatorDisplayed = Boolean(options.onPhaseChange);
        reportPhase('generating-or-downloading');
      },
      bypassCache: isLocalAiVoiceScenarioActive() && sampleVersion === undefined && promo === undefined,
      sampleVersion,
      ...(promo ? { promo } : {}),
    });
    const audioLoadCompletedAtMs = performance.now();
    reportPhase('ready');
    if (__DEV__) {
      console.log('[TTS playback stages]', {
        source: 'word-card',
        phase: 'audio-load-complete',
        cacheSource,
        sinceButtonPressMs: Math.round(audioLoadCompletedAtMs - buttonPressAtMs),
        audioLoadDurationMs: Math.round(audioLoadCompletedAtMs - audioLoadStartedAtMs),
        cacheLookupDurationMs,
        networkGenerationDownloadDurationMs: networkDurationMs,
        inFlightRequestReused: Boolean(requestDeduplicated),
        loadingIndicatorDisplayed,
      });
    }

    // If another speak call arrived while we were fetching, bail out.
    if (myEpoch !== epoch) throw new Error('cancelled');

    // ── Prepare audio session ───────────────────────────────────────────────
    // Always re-apply: iOS resets the audio session after backgrounding or when
    // another app takes audio focus, making subsequent playback silent/missing.
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
    } catch {}

    if (myEpoch !== epoch) throw new Error('cancelled');

    // ── Create player and play ──────────────────────────────────────────────
    // The server has already removed the silent tail. A short status interval
    // now only minimizes native completion-event delivery latency.
    const player = createAudioPlayer({ uri: fileUri }, { updateInterval: 50 });
    currentPlayer = player;
    const audioTiming = timingByFileUri.get(fileUri);
    const safeStartSeconds = safeAudibleStartSeconds(audioTiming);

    return await new Promise<void>((resolve, reject) => {
      let settled = false;
      let lastStatus: AudioStatus | null = null;
      let loggedStart = false;
      let loggedAudibleStart = false;
      let loggedFirstProgress = false;
      let reportedPlaying = false;
      let startInFlight = false;
      let playbackCommandAtMs: number | null = null;

      const finish = (
        err?: Error,
        stopNativePlayback = false,
        completionReason: 'audible-end' | 'native-end' | 'stopped' = 'native-end',
      ) => {
        if (settled) return;
        settled = true;
        sub.remove();
        if (stopNativePlayback) {
          try { player.pause(); } catch {}
        }
        try { player.remove(); } catch {}
        if (currentPlayer === player) currentPlayer = null;
        if (stopActivePlayer === stop) stopActivePlayer = null;
        releaseAudioFocus(focusToken);
        focusToken = null;
        reportPhase('idle');
        if (__DEV__ && !err && lastStatus) {
          console.log('[TTS playback timing]', {
            source: 'word-card',
            phase: 'complete',
            completionReason,
            detectedAudibleStartMs: audioTiming?.audibleStartMs,
            playbackPositionMs: Math.round(lastStatus.currentTime * 1000),
            reportedDurationMs: Math.round(lastStatus.duration * 1000),
            detectedAudibleEndMs: audioTiming?.audibleEndMs ?? Math.round(lastStatus.duration * 1000),
            beforeTrim: audioTiming ? {
              durationMs: audioTiming.originalDurationMs,
              detectedAudibleStartMs: audioTiming.originalAudibleStartMs,
              detectedAudibleEndMs: audioTiming.originalAudibleEndMs,
            } : undefined,
            afterTrim: audioTiming ? {
              durationMs: audioTiming.durationMs,
              detectedAudibleStartMs: audioTiming.audibleStartMs,
              detectedAudibleEndMs: audioTiming.audibleEndMs,
            } : undefined,
          });
        }
        err ? reject(err) : resolve();
      };

      const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        lastStatus = status;
        if (status.isLoaded && playbackCommandAtMs == null) void startPlayer();
        if (status.playing && !reportedPlaying) {
          reportedPlaying = true;
          reportPhase('playing');
        }
        if (__DEV__ && !loggedFirstProgress && playbackCommandAtMs != null && status.currentTime > 0) {
          loggedFirstProgress = true;
          console.log('[TTS playback stages]', {
            source: 'word-card',
            phase: 'first-playback-progress',
            cacheSource,
            sinceButtonPressMs: Math.round(performance.now() - buttonPressAtMs),
            sincePlayCommandMs: Math.round(performance.now() - playbackCommandAtMs),
            playbackPositionMs: Math.round(status.currentTime * 1000),
            expectedAudibleStartMs: audioTiming?.audibleStartMs,
          });
        }
        if (__DEV__ && !loggedStart && status.duration > 0) {
          loggedStart = true;
          console.log('[TTS playback timing]', {
            source: 'word-card',
            phase: 'start',
            detectedAudibleStartMs: audioTiming?.audibleStartMs,
            safePlaybackStartMs: Math.round(safeStartSeconds * 1000),
            playbackPositionMs: Math.round(status.currentTime * 1000),
            reportedDurationMs: Math.round(status.duration * 1000),
            detectedAudibleEndMs: audioTiming?.audibleEndMs ?? Math.round(status.duration * 1000),
            beforeTrim: audioTiming ? {
              durationMs: audioTiming.originalDurationMs,
              detectedAudibleStartMs: audioTiming.originalAudibleStartMs,
              detectedAudibleEndMs: audioTiming.originalAudibleEndMs,
            } : undefined,
            afterTrim: audioTiming ? {
              durationMs: audioTiming.durationMs,
              detectedAudibleStartMs: audioTiming.audibleStartMs,
              detectedAudibleEndMs: audioTiming.audibleEndMs,
            } : undefined,
          });
        }
        if (
          __DEV__ &&
          !loggedAudibleStart &&
          playbackCommandAtMs != null &&
          audioTiming?.audibleStartMs != null &&
          status.currentTime * 1000 >= audioTiming.audibleStartMs
        ) {
          loggedAudibleStart = true;
          const now = performance.now();
          console.log('[TTS playback stages]', {
            source: 'word-card',
            phase: 'audible-start-observed',
            cacheSource,
            actualAudibleStartSinceButtonMs: Math.round(now - buttonPressAtMs),
            actualAudibleStartSincePlayCommandMs: Math.round(now - playbackCommandAtMs),
            playbackPositionMs: Math.round(status.currentTime * 1000),
            detectedAudibleStartMs: audioTiming.audibleStartMs,
          });
        }
        if (hasReachedAISpeechAudibleEnd(status.currentTime, audioTiming)) {
          // Stop the decoded file's inaudible remainder and resolve immediately
          // from the position measured by the native player.
          finish(undefined, true, 'audible-end');
        } else if (status.didJustFinish) {
          finish(undefined, false, 'native-end');
        }
      });
      const stop = () => finish(new Error('cancelled'), true, 'stopped');
      stopActivePlayer = stop;

      const startPlayer = async () => {
        if (settled || startInFlight || playbackCommandAtMs != null) return;
        startInFlight = true;
        const playerReadyAtMs = performance.now();
        try {
          const seekStartedAtMs = performance.now();
          if (safeStartSeconds > 0) {
            await player.seekTo(safeStartSeconds, 0, 0);
          }
          const seekCompletedAtMs = performance.now();
          if (settled || myEpoch !== epoch) return;
          playbackCommandAtMs = performance.now();
          player.play();
          if (__DEV__) {
            console.log('[TTS playback stages]', {
              source: 'word-card',
              phase: 'playback-command',
              cacheSource,
              playerReadySinceButtonMs: Math.round(playerReadyAtMs - buttonPressAtMs),
              playerCreationAndLoadMs: Math.round(playerReadyAtMs - audioLoadCompletedAtMs),
              seekDurationMs: Math.round(seekCompletedAtMs - seekStartedAtMs),
              seekCompletedSinceButtonMs: Math.round(seekCompletedAtMs - buttonPressAtMs),
              playbackCommandSinceButtonMs: Math.round(playbackCommandAtMs - buttonPressAtMs),
              detectedAudibleStartMs: audioTiming?.audibleStartMs,
              safePlaybackStartMs: Math.round(safeStartSeconds * 1000),
              detectedAudibleEndMs: audioTiming?.audibleEndMs,
            });
          }
        } catch (e) {
          finish(e instanceof Error ? e : new Error(String(e)));
        } finally {
          startInFlight = false;
        }
      };

      if (player.currentStatus.isLoaded) void startPlayer();
    });
  } catch (error) {
    reportPhase('failed');
    if (__DEV__) console.warn('[TTS playback diagnostic]', {
      source: 'word-card',
      phase: error instanceof Error && (error.name === 'AbortError' || error.message === 'cancelled')
        ? 'cancelled' : 'failed',
      cacheSource: loadingIndicatorDisplayed ? 'network' : 'unresolved',
      loadingIndicatorDisplayed,
      networkGenerationDownloadDurationMs: networkLoadingStartedAtMs == null
        ? undefined : Math.round(performance.now() - networkLoadingStartedAtMs),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  } finally {
    reportPhase('idle');
    finishPlayback(playbackKey, myEpoch);
  }
}

// ── Custom audio (Basic plan, user-attached file) ─────────────────────────────

/**
 * Play a user-attached audio file at the given speed and volume.
 * Integrates with the same stop/cancel machinery as speakFree / speakWithAI.
 */
export async function speakCustom(
  uri: string,
  speed: number,
  volume: number,
  options: TTSPlaybackOptions = {},
): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();

  const playbackKey = `custom:${uri}:${speed}:${volume}`;
  const myEpoch = beginPlayback(playbackKey);
  if (myEpoch == null) return;
  options.onPhaseChange?.('checking-cache');

  try {
    try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}

    if (myEpoch !== epoch) throw new Error('cancelled');
    options.onPhaseChange?.('ready');

    const player = createAudioPlayer({ uri });
    player.volume = Math.min(volume, 1.0);
    player.setPlaybackRate(speed, 'medium');
    currentPlayer = player;

    return await new Promise<void>((resolve, reject) => {
      let settled = false;
      let reportedPlaying = false;

      const finish = (err?: Error, stopping = false) => {
        if (settled) return;
        settled = true;
        sub.remove();
        if (stopping) {
          // Silence the old side now, but do not destroy its native player in
          // the card-tap stack. `remove()` can synchronously wait on AVPlayer;
          // deferring it lets the native-driver flip start immediately.
          try { player.pause(); } catch {}
        }
        if (stopping) deferAudioPlayerRemoval(player);
        else try { player.remove(); } catch {}
        if (currentPlayer === player) currentPlayer = null;
        if (stopActivePlayer === stop) stopActivePlayer = null;
        releaseAudioFocus(focusToken);
        focusToken = null;
        options.onPhaseChange?.('idle');
        err ? reject(err) : resolve();
      };

      const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        // Native status delivery can already be queued when pause/remove begins.
        // Neither that callback nor a superseded playback epoch may revive UI
        // state after the card has flipped or changed.
        if (settled || myEpoch !== epoch) return;
        if (status.playing && !reportedPlaying) {
          reportedPlaying = true;
          options.onPhaseChange?.('playing');
        }
        if (status.didJustFinish) finish();
      });
      const stop = () => finish(new Error('cancelled'), true);
      stopActivePlayer = stop;

      try { player.play(); } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); }
    });
  } catch (error) {
    options.onPhaseChange?.('failed');
    throw error;
  } finally {
    options.onPhaseChange?.('idle');
    finishPlayback(playbackKey, myEpoch);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Speak the word side of a card. Uses custom audio when the card has one,
 * otherwise falls back to standard TTS. Shared by all playback modes so
 * the priority logic lives in one place.
 */
export function speakWordCard(
  card: { audioUri?: string; audioSpeed?: number; audioVolume?: number; word: string; wordLang?: string },
  canUseAIVoice: boolean,
  options?: TTSPlaybackOptions,
): Promise<void> {
  // The same predicate the card's voice button draws its icon from, so the icon
  // and the audio can never disagree about which one this word plays.
  if (resolveCardVoiceSource(card, 'word') === 'custom') {
    // Registered audio wins outright: no generation, no device engine, no
    // network. `speakCustom` only opens the local file.
    return speakCustom(card.audioUri!, card.audioSpeed ?? 1.0, card.audioVolume ?? 1.0, options);
  }
  return speak(card.word, canUseAIVoice, card.wordLang, options);
}

/**
 * Speak `text` using the appropriate engine:
 * - With High-Quality AI Voice → OpenAI voice (auto-detects language from text)
 * - Without it → device TTS; locale is inferred from the text content via
 *   detectLocale() so each card side is always spoken in its own language,
 *   regardless of the app's UI language setting.
 *
 * The flag is the AI Voice *capability*, not "is subscribed": AI Voice is a
 * Premium feature, so Basic reaches the device engine here just as Free does.
 * Basic's own voice feature is the card's attached audio, handled above.
 */
export function speak(
  text: string,
  canUseAIVoice: boolean,
  forcedLocale?: string,
  options?: TTSPlaybackOptions,
): Promise<void> {
  if (canUseAIVoice) return speakWithAI(text, activeAIVoice, options);
  return speakFree(text, forcedLocale ?? detectLocale(text), options);
}

/** Update the voice used by every subsequent subscriber AI playback request. */
export function setAIVoicePreference(voice: AIVoice): void {
  if (voice === activeAIVoice) return;
  activeAIVoice = voice;
  stopPlayback();
}

/** Play a one-off subscriber preview without changing the saved preference. */
export function previewAIVoice(
  voice: AIVoice,
  options?: TTSPlaybackOptions,
): Promise<void> {
  const sample = getAIVoiceSample(voice);
  return speakWithAI(sample.text, voice, options, sample.contentVersion);
}

/**
 * Play one of the two promotional previews in the Upgrade Plan sheet.
 *
 * Available on every plan, including Free and while the subscription is still
 * loading, because the Worker route needs no entitlement. It reuses the same
 * persistent file cache as every other AI clip, so a second play — and a play
 * with no network — is served from disk. It changes nothing about word-card
 * voice, which still goes through `speak()` and stays gated.
 */
export function speakPromoSample(
  sample: PromoSampleId,
  langCode: string | undefined,
  options?: TTSPlaybackOptions,
): Promise<void> {
  const lang = resolvePromoLang(langCode);
  return speakWithAI(
    promoSampleText(sample, lang),
    PROMO_PREVIEW_VOICE,
    options,
    PROMO_SAMPLE_VERSION,
    { sample, langCode: lang },
  );
}

/** Stop any active playback immediately (e.g. on component unmount). */
export function stopPlayback(): void {
  stopCurrent();
  activePlaybackKey = null;
  epoch++; // Abort any in-flight fetch that hasn't created a player yet.
}
