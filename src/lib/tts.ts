import { Directory, File, Paths } from 'expo-file-system';
import { MAX_AI_INPUT_CHARS } from '../constants';
import {
  AI_VOICES,
  DEFAULT_AI_VOICE,
  RETIRED_AI_VOICES,
  type AIVoice,
} from './aiVoices';
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
  PROMO_SAMPLE_IDS,
  PROMO_SAMPLE_VERSION,
  promoSampleText,
  resolvePromoLang,
  type PromoSampleId,
} from './promoVoiceSamples';
import { bundledPromoAudio, bundledPromoAudioSet } from './promoVoiceAudio';
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
  getAISpeechTiming,
  isAISpeechTimingDiagnostics,
  requestAISpeech,
  type AISpeechTimingDiagnostics,
  type PromoSpeechRequest,
} from './openaiGateway';
import { isAIConsentGranted } from './aiConsent';
import { isAIEntitlementEligible } from './aiEntitlement';
import { claimAudioFocus, releaseAudioFocus } from './audioFocus';
import { Asset } from 'expo-asset';
import { deferAudioPlayerRemoval } from './audioPlayerCleanup';
import {
  DeduplicatedRequestRegistry,
  isSupportedCachedWav,
  normalizeTTSRequest,
  normalizedTTSText,
  serializeTTSCacheKey,
} from './ttsRequest';
import {
  ControlledTTSPreloadQueue,
  DEFAULT_TTS_PRELOAD_CONCURRENCY,
  isAIPronunciationPreloadEligible,
} from './ttsPreloadQueue';
import type { TTSPlaybackPhase } from './ttsPlaybackState';
import { isAIRequestError } from './api/errors';
import { canStartAutomaticVoiceGeneration } from './voiceCreditBalance';
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

interface CachedAudio {
  uri: string;
}

export interface TTSPlaybackOptions {
  onPhaseChange?: (phase: TTSPlaybackPhase) => void;
  /**
   * When AI generation is off, still play AI audio already on the device.
   *
   * Opt-in per call rather than global, because "no AI generation" and "no AI
   * audio" are not the same thing and only some callers mean the second. The
   * Upgrade Plan sheet's device-voice demo is the reason: it exists to
   * demonstrate what the *free* engine sounds like beside the AI one, so it
   * must speak through expo-speech even for a subscriber whose cache happens to
   * hold that word. Word-card playback sets it; that comparison does not.
   *
   * Ignored unless the plan is actually entitled to AI Voice — see `speak`.
   */
  allowCachedAIFallback?: boolean;
}

/**
 * A cache-only lookup found nothing.
 *
 * Its own sentinel rather than a generic failure because it is not one: no
 * request was made, nothing went wrong, and the caller simply moves on to the
 * device engine. `speakWithAI` recognises it and stays quiet instead of
 * reporting a failed playback the user would see flash on the card.
 */
const AI_CACHE_ONLY_MISS = 'ai_cache_only_miss';

function isAICacheOnlyMiss(error: unknown): boolean {
  return error instanceof Error && error.message === AI_CACHE_ONLY_MISS;
}

interface AudioCacheLookupOptions {
  onNetworkRequired?: () => void;
  trackAsActiveGeneration?: boolean;
  /** Local manual test only: traverse the real request path without deleting cached audio. */
  bypassCache?: boolean;
  /**
   * Serve from the local cache or not at all.
   *
   * Every validation above the network step still runs exactly as it does for a
   * normal play — same normalized request, same cache key, same file checks —
   * so a cache-only hit is the identical audio a generating call would have
   * returned. Only the generation itself is withheld.
   */
  cacheOnly?: boolean;
  sampleVersion?: string;
  /** Explicit card language; omitted to preserve automatic detection. */
  language?: string;
  /** Re-check card ownership after the network response, before writing disk. */
  shouldPersistNetworkResult?: () => boolean;
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
  const request = normalizeTTSRequest(text, voice, options.sampleVersion, options.language);
  if (!request.text) return Promise.reject(new Error('input_empty'));
  if (request.text.length > MAX_AI_INPUT_CHARS) return Promise.reject(new Error('input_too_long'));

  const key = serializeTTSCacheKey(request);

  // 1. Session-level memory index
  const indexed = fileUriIndex.get(key);
  if (indexed && !options.bypassCache) {
    const indexedFile = new File(indexed);
    if (await validateCachedAudioFile(indexedFile)) {
      return { uri: indexed };
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
    restoreCachedTiming(cachedFile);
    fileUriIndex.set(key, cachedFile.uri);
    return { uri: cachedFile.uri };
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
  if (!options.bypassCache && !request.contentVersion && !request.language
    && await validateCachedAudioFile(legacyFile)) {
    restoreCachedTiming(legacyFile);
    fileUriIndex.set(key, legacyFile.uri);
    return { uri: legacyFile.uri };
  }
  if (!options.bypassCache && !request.contentVersion && !request.language && legacyFile.exists) {
    if (__DEV__) console.warn('[TTS cache warning]', {
      cacheSource: 'disk', cacheStatus: 'invalid-or-unreadable', cacheKeyVersion: 'legacy',
    });
    invalidateCachedAudioFile(legacyFile);
  }

  // Every cache tier above has now been asked, with the full validation. There
  // is nothing on the device for this text, voice, language and version, and
  // this caller is not allowed to generate one — so stop here, before
  // `onNetworkRequired` and before anything that would spend a credit.
  if (options.cacheOnly) {
    return Promise.reject(new Error(AI_CACHE_ONLY_MISS));
  }

  // 3. Deduplicate concurrent requests for the same text+voice
  options.onNetworkRequired?.();
  const pending = networkRequests.run(key, async signal => {
      const ab = await requestAISpeech(
        request.text,
        voice,
        signal,
        request.format,
        options.promo ? 'speech_promo' : request.contentVersion ? 'speech_sample' : 'speech',
        request.contentVersion,
        options.promo,
        request.language,
      );
      if (options.shouldPersistNetworkResult?.() === false) {
        throw new Error('cancelled_stale_preload');
      }
      const timing = getAISpeechTiming(ab);
      const file = ttsCacheFile(key, voice);
      file.create({ overwrite: true });
      file.write(new Uint8Array(ab));
      validatedFileUris.add(file.uri);
      if (timing) {
        timingByFileUri.set(file.uri, timing);
        const timingFile = ttsTimingFile(file);
        timingFile.create({ overwrite: true });
        timingFile.write(JSON.stringify(withSafeAudibleStartMs(timing)));
      }
      fileUriIndex.set(key, file.uri);
      return { uri: file.uri };
  });
  const trackAsActiveGeneration = options.trackAsActiveGeneration !== false;
  if (trackAsActiveGeneration) activeGenerationController = pending.controller;
  return pending.promise
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
  language?: string;
  /** Newly saved/imported words jump ahead of a full-library sweep. */
  priority?: 'normal' | 'high';
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
  if (!canStartAutomaticVoiceGeneration()) return;

  const request = normalizeTTSRequest(options.text, options.voice, undefined, options.language);
  if (!request.text || request.text.length > MAX_AI_INPUT_CHARS || !options.entryId) return;
  const key = serializeTTSCacheKey(request);

  const queued = preloadQueue.enqueue(key, options.entryId, async () => {
    if (!canStartAutomaticVoiceGeneration()) return;

    try {
      while (true) {
        if (!preloadQueue.hasOwners(key) || !canStartAutomaticVoiceGeneration()) return;
        try {
          await fetchAndCacheAudio(request.text, request.voice, {
            trackAsActiveGeneration: false,
            language: request.language,
            shouldPersistNetworkResult: () => preloadQueue.hasOwners(key),
          });
          break;
        } catch (error) {
          // Honour the Worker's exact retry window. Rate limiting happens
          // before Basic reserves a credit, so waiting and retrying cannot
          // consume or strand the lifetime balance.
          if (isAIRequestError(error)
            && (error.kind === 'rate_limited' || error.kind === 'usage_limited')
            && error.retryAfterSeconds !== undefined) {
            await new Promise(resolve => setTimeout(
              resolve,
              Math.max(1, error.retryAfterSeconds!) * 1_000,
            ));
            continue;
          }
          throw error;
        }
      }
    } catch {
      // Best-effort only. The request registry removes failed work so a later
      // user tap retries through the normal path.
    }
  }, options.priority ?? 'normal');

  void queued.promise.catch(() => {});
}

export interface AIPronunciationLibraryEntry {
  id: string;
  text: string;
  hasCustomAudio?: boolean;
  language?: string;
}

export interface AIPronunciationLibraryPreloadOptions {
  entries: readonly AIPronunciationLibraryEntry[];
  voice: AIVoice;
  hasAIAccess: boolean;
  triggerReason: string;
  priority?: 'normal' | 'high';
}

/**
 * Queue pronunciation generation for a whole library at once — used when an entitlement
 * becomes active, so existing words are already cached before their first tap.
 *
 * Each entry goes through `preloadAIPronunciation`, so this inherits its cache hits,
 * in-flight deduplication and bounded queue: work overlaps only up to the shared
 * worker limit. Entries already on disk cost a cache
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

  for (const entry of options.entries) {
    preloadAIPronunciation({
      entryId: entry.id,
      text: entry.text,
      voice: options.voice,
      hasAIAccess: true,
      hasCustomAudio: entry.hasCustomAudio,
      language: entry.language,
      priority: options.priority,
    });
  }
}

/** Words released per event-loop turn, so a select-all delete cannot block a frame. */
const CACHE_RELEASE_CHUNK = 8;

export interface AIPronunciationCacheReleaseOptions {
  /** Cards that no longer own their queued preload work. */
  entryIds: readonly string[];
  /** Raw word texts whose cached clips may now be unreachable. */
  texts: readonly string[];
  /**
   * Normalized texts the library still contains. Two cards can normalize to the
   * same text and therefore share one cache file, so a text still in here keeps
   * its clips: deleting one of those cards must not silently cost the other a
   * regeneration.
   */
  retainedTexts: ReadonlySet<string>;
}

/**
 * Drop the clips a word owned once nothing else refers to them.
 *
 * Deliberately conservative in three ways. Queue ownership is released through
 * the same `cancelOwner` the delete path always used, which never aborts a
 * running request — manual playback may be sharing it. A key with a request in
 * flight is skipped outright, as is one that is playing right now. And a text
 * still present in `retainedTexts` is never touched. Over-retention costs disk;
 * over-deletion costs a paid regeneration, so every ambiguous case keeps the file.
 */
export function releaseAIPronunciationCache(
  options: AIPronunciationCacheReleaseOptions,
): void {
  for (const entryId of options.entryIds) cancelAIPronunciationPreload(entryId);

  const obsolete = [...new Set(options.texts.map(normalizedTTSText))]
    .filter(text => text.length > 0 && !options.retainedTexts.has(text));
  if (obsolete.length === 0) return;

  // Nothing awaits this: a release is bookkeeping behind a save or a delete that
  // has already happened, and must never hold either of them up.
  void releaseObsoleteClips(obsolete);
}

async function releaseObsoleteClips(texts: readonly string[]): Promise<void> {
  for (let index = 0; index < texts.length; index++) {
    // The file APIs are synchronous, so a large delete is chunked back to the
    // event loop rather than run as one long blocking sweep.
    if (index > 0 && index % CACHE_RELEASE_CHUNK === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    for (const voice of AI_VOICES) deleteCachedPronunciation(texts[index], voice);
  }
}

/**
 * One text in one voice. Voice previews are keyed with a `contentVersion` and
 * so hash differently — this can never reach them.
 */
function deleteCachedPronunciation(normalizedText: string, voice: AIVoice): boolean {
  const request = normalizeTTSRequest(normalizedText, voice);
  const key = serializeTTSCacheKey(request);
  if (networkRequests.has(key)) return false;
  if (isSpeakingCardText(voice, request.text)) return false;

  fileUriIndex.delete(key);
  const current = ttsCacheFile(key, voice);
  const existed = current.exists;
  invalidateCachedAudioFile(current);
  // The pre-normalization file is the same clip under the old key, so it goes
  // with it rather than being left behind as an orphan nothing can reach.
  const legacy = legacyTTSCacheFile(request.text, voice);
  const legacyExisted = legacy.exists;
  invalidateCachedAudioFile(legacy);
  return existed || legacyExisted;
}

/**
 * Drop the clips left behind by voices the app no longer offers.
 *
 * Nothing can reach these files again: the voice is not in `AI_VOICES`, so it
 * cannot be chosen, previewed, or fall out of `isAIVoice` as a stored value.
 * Selection is by the voice segment of the filename against `RETIRED_AI_VOICES`
 * — an allowlist of what may go, not a denylist of what must stay — so a Marin
 * or Cedar clip cannot be deleted however the name is shaped.
 */
export function purgeRetiredVoiceCaches(): void {
  void purgeRetiredVoiceCacheFiles();
}

async function purgeRetiredVoiceCacheFiles(): Promise<void> {
  try {
    const dir = new Directory(Paths.cache, TTS_CACHE_DIR);
    if (!dir.exists) return;
    const entries = dir.list();
    for (let index = 0; index < entries.length; index++) {
      if (index > 0 && index % CACHE_RELEASE_CHUNK === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const entry = entries[index];
      if (!isRetiredVoiceCacheName(entry.name)) continue;
      try {
        entry.delete();
      } catch {
        // A file the OS is holding is not worth failing a cleanup over.
      }
    }
  } catch {
    // Best effort. A cache that cannot be tidied still plays.
  }
}

/**
 * `<cacheVersion>_<voice>_<hash>.wav`, and the `.timing.json` sidecar built from
 * that name. The version segment is not checked, so files from an earlier cache
 * version are collected too.
 */
function isRetiredVoiceCacheName(name: string): boolean {
  const segments = name.split('_');
  return segments.length >= 3 && RETIRED_AI_VOICES.has(segments[1]);
}

/** Is this exact clip the one playing right now? Its file must stay put. */
function isSpeakingCardText(voice: AIVoice, normalizedText: string): boolean {
  const prefix = `ai:${voice}:card:`;
  if (activePlaybackKey === null || !activePlaybackKey.startsWith(prefix)) return false;
  return normalizedTTSText(activePlaybackKey.slice(prefix.length)) === normalizedText;
}

/** Stop associating queued/running preload work with a deleted card. */
export function cancelAIPronunciationPreload(entryId: string): void {
  if (!entryId) return;
  preloadQueue.cancelOwner(entryId);
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
    voiceSamplePreloadQueue.cancelOwner(VOICE_SAMPLE_PRELOAD_OWNER);
    return;
  }

  if (activeVoiceSamplePreload) {
    if (!wasEligible) pendingVoiceSamplePreloadTrigger = options;
    return;
  }

  const work = AI_VOICE_SAMPLES.map((sample, index) => {
    const request = normalizeTTSRequest(sample.text, sample.voice, sample.contentVersion);
    const key = serializeTTSCacheKey(request);
    if (failedVoiceSampleKeys.has(key)) return Promise.resolve();

    const queued = voiceSamplePreloadQueue.enqueue(key, VOICE_SAMPLE_PRELOAD_OWNER, async () => {
      if (!voiceSamplePreloadEligible) return;
      try {
        await fetchAndCacheAudio(sample.text, sample.voice, {
          trackAsActiveGeneration: false,
          sampleVersion: sample.contentVersion,
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
    return queued.promise;
  });

  const run = Promise.allSettled(work).then(() => undefined);
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

// ── OpenAI TTS (Basic and Premium users) ──────────────────────────────────────

async function speakWithAI(
  text: string,
  voice: AIVoice = activeAIVoice,
  options: TTSPlaybackOptions = {},
  sampleVersion?: string,
  promo?: PromoSpeechRequest,
  language?: string,
  /** Play what is already cached, or reject with the cache-only sentinel. */
  cacheOnly = false,
): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();
  let loadingIndicatorDisplayed = false;
  let networkLoadingStartedAtMs: number | null = null;
  let cacheOnlyMissed = false;
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

  try {
    // ── Fetch audio (or hit local file cache) ────────────────────────────────
    const { uri: fileUri } = await fetchAndCacheAudio(text, voice, {
      onNetworkRequired: () => {
        networkLoadingStartedAtMs = performance.now();
        loadingIndicatorDisplayed = Boolean(options.onPhaseChange);
        reportPhase('generating-or-downloading');
      },
      bypassCache: isLocalAiVoiceScenarioActive() && sampleVersion === undefined && promo === undefined,
      cacheOnly,
      sampleVersion,
      language,
      ...(promo ? { promo } : {}),
    });
    reportPhase('ready');

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
      let reportedPlaying = false;
      let startInFlight = false;
      let playbackCommandAtMs: number | null = null;

      const finish = (err?: Error, stopNativePlayback = false) => {
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
        err ? reject(err) : resolve();
      };

      const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (status.isLoaded && playbackCommandAtMs == null) void startPlayer();
        if (status.playing && !reportedPlaying) {
          reportedPlaying = true;
          reportPhase('playing');
        }
        if (hasReachedAISpeechAudibleEnd(status.currentTime, audioTiming)) {
          // Stop the decoded file's inaudible remainder and resolve immediately
          // from the position measured by the native player.
          finish(undefined, true);
        } else if (status.didJustFinish) {
          finish();
        }
      });
      const stop = () => finish(new Error('cancelled'), true);
      stopActivePlayer = stop;

      const startPlayer = async () => {
        if (settled || startInFlight || playbackCommandAtMs != null) return;
        startInFlight = true;
        try {
          if (safeStartSeconds > 0) {
            await player.seekTo(safeStartSeconds, 0, 0);
          }
          if (settled || myEpoch !== epoch) return;
          playbackCommandAtMs = performance.now();
          player.play();
        } catch (e) {
          finish(e instanceof Error ? e : new Error(String(e)));
        } finally {
          startInFlight = false;
        }
      };

      if (player.currentStatus.isLoaded) void startPlayer();
    });
  } catch (error) {
    // A cache-only miss is an answer, not a failure: nothing was requested and
    // the caller is about to speak the same word on the device engine. Reporting
    // 'failed' here would flash an error on the card on the way to working audio.
    if (isAICacheOnlyMiss(error)) {
      cacheOnlyMissed = true;
      throw error;
    }
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
    // The epoch is always released; the *phase* is not. On a cache-only miss
    // the caller speaks the same word on the device engine immediately, and
    // dropping to 'idle' in between would blink the card's voice indicator off
    // and straight back on. speakFree reports its own phases from here.
    if (!cacheOnlyMissed) reportPhase('idle');
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
   * - With High-Quality AI Voice → OpenAI voice (uses the card language when set)
 * - Without it → device TTS; locale is inferred from the text content via
 *   detectLocale() so each card side is always spoken in its own language,
 *   regardless of the app's UI language setting.
 *
   * The flag is the AI Voice *capability*, not merely "is subscribed": Basic
   * has its one-time lifetime balance and Premium is unmetered. Free reaches
   * the device engine; attached Custom Voice audio is handled above.
 */
export function speak(
  text: string,
  canUseAIVoice: boolean,
  forcedLocale?: string,
  options?: TTSPlaybackOptions,
): Promise<void> {
  if (canUseAIVoice) {
    return speakWithAI(text, activeAIVoice, options, undefined, undefined, forcedLocale);
  }

  // Generation is off, but audio already paid for and sitting on this device is
  // still theirs to play. This is the state a Basic subscriber lands in once the
  // 200 lifetime credits are gone: no new generation, and every word already
  // generated keeps its real voice instead of silently dropping to the device
  // engine. Playing a cached file reaches no network, so it can spend nothing.
  //
  // `isAIEntitlementEligible` is the entitlement itself, published by App from
  // the same RevenueCat state every other AI surface reads. It is what keeps
  // this from leaking: Free is not eligible and never reaches the cache, and
  // neither does a launch where the plan has not been resolved yet. An
  // ineligible plan cannot get here even with a cache full of a former
  // subscription's audio.
  if (options?.allowCachedAIFallback && isAIEntitlementEligible()) {
    return speakCachedAIOrDevice(text, forcedLocale, options);
  }
  return speakFree(text, forcedLocale ?? detectLocale(text), options);
}

/**
 * Play cached AI audio if this device has it, otherwise the device engine.
 *
 * The cache is asked *before* either engine is started, and deliberately so.
 * Both `speakFree` and `speakWithAI` claim the shared playback epoch under
 * their own key, and `beginPlayback` treats a repeat of the current key as
 * "stop" — that is how tapping a playing card a second time silences it.
 * Probing from inside `speakWithAI` and then falling through would leave the
 * device engine playing under one key while the next tap arrived under the
 * other, so the second tap restarted the word instead of stopping it. The probe
 * touches no playback state at all, so exactly one engine ever owns the epoch.
 *
 * The lookup is the ordinary one, with the same normalized request, the same
 * cache key and the same file validation, so a hit here is the same audio a
 * generating call would have played. It reaches no network, so it cannot spend
 * a credit; a hit also warms the session index, making the real lookup a moment
 * later a memory hit rather than a second disk read.
 */
async function speakCachedAIOrDevice(
  text: string,
  forcedLocale: string | undefined,
  options?: TTSPlaybackOptions,
): Promise<void> {
  // The probe is the one moment in this path that owns no playback state, so a
  // stop arriving during it has nothing to cancel. `stopPlayback` and every
  // `beginPlayback` bump the epoch, so comparing it across the await is what
  // stops a card the user has already silenced — or swiped away from — from
  // starting to speak once the lookup lands.
  const epochBeforeProbe = epoch;

  // Any answer other than a hit means device TTS. A lookup that cannot complete
  // is not evidence the audio exists, and a word the user asked to hear must
  // still be spoken.
  const cached = await fetchAndCacheAudio(text, activeAIVoice, {
    cacheOnly: true,
    language: forcedLocale,
  }).then(() => true).catch(() => false);

  if (epoch !== epochBeforeProbe) return;

  if (cached) {
    return speakWithAI(text, activeAIVoice, options, undefined, undefined, forcedLocale, true)
      // The file can still be evicted between the probe and the play. Losing
      // that race is a miss like any other, not a failure to report.
      .catch((error: unknown) => {
        if (!isAICacheOnlyMiss(error)) throw error;
        return speakFree(text, forcedLocale ?? detectLocale(text), options);
      });
  }
  return speakFree(text, forcedLocale ?? detectLocale(text), options);
}

/** Update the voice used by every subsequent subscriber AI playback request. */
export function setAIVoicePreference(voice: AIVoice): void {
  if (voice === activeAIVoice) return;
  activeAIVoice = voice;
  // A settings change can race the new-voice library sweep. Keep jobs already
  // normalized for the selected voice, but remove queued ownership for every
  // old voice so stale work cannot spend a Basic credit after the switch.
  preloadQueue.cancelMatching(key => {
    try {
      return (JSON.parse(key) as { voice?: unknown }).voice !== voice;
    } catch {
      return true;
    }
  });
  stopPlayback();
}

// ── Upgrade Plan promo previews ───────────────────────────────────────────────

/**
 * The network preloads for promo clips with no bundled asset.
 *
 * Only reachable for a language the generation script has not produced. Keyed by
 * the same cache key playback uses, so a preload and a tap for the same sample
 * are the same entry: the tap either finds the finished file or joins the
 * preload's in-flight request.
 */
const promoPreloadByKey = new Map<string, Promise<void>>();

function promoCacheKey(sample: PromoSampleId, lang: string): string {
  return serializeTTSCacheKey(
    normalizeTTSRequest(promoSampleText(sample, lang), PROMO_PREVIEW_VOICE, PROMO_SAMPLE_VERSION, lang),
  );
}

/**
 * Prepare the fixed Upgrade Plan promo clips before the user can tap one.
 *
 * Costs nothing and unlocks nothing on either path. The bundled clips are
 * already on the device, so preparing them is a local resolve and never a
 * request. The fallback path uses `/v1/voice/promo`, the one route that carries
 * no text, no identity and no entitlement — the Worker owns the words and looks
 * them up from a sample id — so it can never spend a Basic credit, touch
 * Premium's generation, or need data-sharing consent. Word-card voice is
 * untouched: it still goes through `speak()` and stays gated.
 *
 * Nothing here rejects to a caller, blocks startup, or holds a player. A failure
 * leaves the tap to behave exactly as it does today.
 */
export function preloadPromoVoiceSamples(langCode?: string): void {
  const lang = resolvePromoLang(langCode);

  // Bundled: nothing to fetch. In a release build the files are already in the
  // app bundle; in development Metro serves them, and resolving them now means
  // the first tap does not wait on that. Fire-and-forget, and a failure is the
  // player's problem later, not startup's.
  const bundled = bundledPromoAudioSet(lang);
  if (bundled.length > 0) {
    void Asset.loadAsync(bundled as number[]).catch(() => {});
    return;
  }

  for (const sample of PROMO_SAMPLE_IDS) {
    const key = promoCacheKey(sample, lang);
    if (promoPreloadByKey.has(key)) continue;
    const run = fetchAndCacheAudio(promoSampleText(sample, lang), PROMO_PREVIEW_VOICE, {
      loadingIndicatorAvailable: false,
      trackAsActiveGeneration: false,
      sampleVersion: PROMO_SAMPLE_VERSION,
      language: lang,
      promo: { sample, langCode: lang },
    })
      .then(() => undefined)
      .catch(() => {
        // Not remembered, so a language change or the next launch retries.
        promoPreloadByKey.delete(key);
      });
    promoPreloadByKey.set(key, run);
  }
}

/**
 * Play a bundled promotional clip.
 *
 * Deliberately a sibling of `speakCustom` rather than a branch inside
 * `speakWithAI`: it needs the player half and none of the fetch half, and it
 * shares every piece of the lifecycle that matters — `beginPlayback`'s epoch and
 * stop-on-repeat, the audio-focus token, `stopActivePlayer`, `currentPlayer`,
 * the deferred native removal and the same phase reporting. The source is a
 * `require()`d module id, which `expo-audio` accepts directly, so no URI is
 * resolved and no file is read by us.
 */
async function speakBundledPromo(
  source: number,
  sample: PromoSampleId,
  lang: string,
  options: TTSPlaybackOptions = {},
): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();

  // Same shape as the network path's key, so tapping the playing sample stops it
  // and tapping another supersedes it, exactly as before.
  const playbackKey = `ai:${PROMO_PREVIEW_VOICE}:${PROMO_SAMPLE_VERSION}:${sample}:${lang}`;
  const myEpoch = beginPlayback(playbackKey);
  if (myEpoch == null) return;
  options.onPhaseChange?.('checking-cache');

  try {
    // iOS resets the session after backgrounding or when another app takes
    // focus, so this is re-applied per play, as everywhere else.
    try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}
    if (myEpoch !== epoch) throw new Error('cancelled');
    options.onPhaseChange?.('ready');

    const player = createAudioPlayer(source, { updateInterval: 50 });
    currentPlayer = player;

    return await new Promise<void>((resolve, reject) => {
      let settled = false;
      let reportedPlaying = false;
      let commanded = false;

      const finish = (err?: Error, stopping = false) => {
        if (settled) return;
        settled = true;
        sub.remove();
        if (stopping) {
          try { player.pause(); } catch {}
          deferAudioPlayerRemoval(player);
        } else {
          try { player.remove(); } catch {}
        }
        if (currentPlayer === player) currentPlayer = null;
        if (stopActivePlayer === stop) stopActivePlayer = null;
        releaseAudioFocus(focusToken);
        focusToken = null;
        options.onPhaseChange?.('idle');
        err ? reject(err) : resolve();
      };

      const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (settled || myEpoch !== epoch) return;
        // Commanded from the loaded status rather than immediately, so play is
        // never issued at a player that has not opened the asset yet.
        if (status.isLoaded && !commanded) {
          commanded = true;
          try { player.play(); } catch (e) {
            finish(e instanceof Error ? e : new Error(String(e)));
          }
        }
        if (status.playing && !reportedPlaying) {
          reportedPlaying = true;
          options.onPhaseChange?.('playing');
        }
        if (status.didJustFinish) finish();
      });
      const stop = () => finish(new Error('cancelled'), true);
      stopActivePlayer = stop;
    });
  } catch (error) {
    options.onPhaseChange?.('failed');
    throw error;
  } finally {
    options.onPhaseChange?.('idle');
    finishPlayback(playbackKey, myEpoch);
  }
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
 * Play one of the fixed promotional previews in the Upgrade Plan sheet.
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

  // The normal path: the clip ships with the app, so this reaches no network,
  // generates nothing and spends nothing.
  const bundled = bundledPromoAudio(sample, lang);
  if (bundled !== null) return speakBundledPromo(bundled, sample, lang, options);

  // Fallback for a genuinely missing asset — before the generation script has
  // run, or a language it did not produce. Identical to the old behaviour, and
  // still free: `/v1/voice/promo` carries no text, no identity and no
  // entitlement. Worth a warning because it should not happen in a shipped
  // build; sample id and language code only, both build constants.
  if (__DEV__) console.warn('[promo voice] no bundled clip, using network route', { sample, lang });
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
