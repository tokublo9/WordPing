const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScriptModule(path, imports = {}) {
  const source = fs.readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const testRequire = specifier => {
    if (Object.prototype.hasOwnProperty.call(imports, specifier)) return imports[specifier];
    return require(specifier);
  };
  new Function('exports', 'module', 'require', output)(module.exports, module, testRequire);
  return module.exports;
}

const { analyzeWavBestEffort, trimWavTrailingSilence } = loadTypeScriptModule(
  'supabase/functions/openai/wavSilence.ts',
);
const {
  AUDIBLE_START_PREROLL_MS,
  hasReachedAISpeechAudibleEnd,
  safeAudibleStartSeconds,
  withSafeAudibleStartMs,
} = loadTypeScriptModule('src/lib/audioTiming.ts');
const { readSpeechTiming } = loadTypeScriptModule('src/lib/openaiGateway.ts', {
  './aiVoices': { DEFAULT_AI_VOICE: 'marin', isAIVoice: () => true },
  './supabase': { requireSupabaseSession: async () => null, supabase: null },
});
const { fetchOpenAISpeech } = loadTypeScriptModule(
  'supabase/functions/openai/speechUpstream.ts',
);
const {
  DeduplicatedRequestRegistry,
  isSupportedCachedWav,
  normalizeTTSRequest,
  serializeTTSCacheKey,
} = loadTypeScriptModule(
  'src/lib/ttsRequest.ts',
);
const { isTTSNetworkLoading } = loadTypeScriptModule('src/lib/ttsPlaybackState.ts');
const {
  ControlledTTSPreloadQueue,
  isAIPronunciationPreloadEligible,
} = loadTypeScriptModule('src/lib/ttsPreloadQueue.ts');
const ttsRequestModule = loadTypeScriptModule('src/lib/ttsRequest.ts');
const {
  AI_VOICE_SAMPLES,
  AI_VOICE_SAMPLE_CONTENT_VERSION,
  AI_VOICE_SAMPLE_PRELOAD_CONCURRENCY,
  isAIVoiceSamplePreloadEligible,
} = loadTypeScriptModule('src/lib/aiVoiceSamples.ts', {
  './ttsRequest': ttsRequestModule,
  './aiVoices': {
    AI_VOICES: ['cedar', 'fable', 'alloy', 'ash', 'coral', 'nova', 'marin', 'shimmer'],
    getAIVoiceLabel: voice => voice[0].toUpperCase() + voice.slice(1),
  },
});

function pcm16Wav(segments) {
  const sampleRate = 24_000;
  const frameCount = segments.reduce(
    (sum, segment) => sum + Math.round(segment.durationMs * sampleRate / 1000),
    0,
  );
  const audio = new ArrayBuffer(44 + frameCount * 2);
  const bytes = new Uint8Array(audio);
  const view = new DataView(audio);
  const fourCC = (offset, value) => {
    for (let index = 0; index < 4; index++) bytes[offset + index] = value.charCodeAt(index);
  };

  fourCC(0, 'RIFF');
  view.setUint32(4, audio.byteLength - 8, true);
  fourCC(8, 'WAVE');
  fourCC(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  fourCC(36, 'data');
  view.setUint32(40, frameCount * 2, true);

  let frame = 0;
  for (const segment of segments) {
    const frames = Math.round(segment.durationMs * sampleRate / 1000);
    for (let offset = 0; offset < frames; offset++, frame++) {
      const sample = segment.amplitude === 0
        ? 0
        : Math.round(Math.sin(2 * Math.PI * 440 * frame / sampleRate) * segment.amplitude);
      view.setInt16(44 + frame * 2, sample, true);
    }
  }
  return audio;
}

function analyze(segments) {
  const result = trimWavTrailingSilence(pcm16Wav(segments));
  assert.ok(result);
  return result;
}

function wavWithExtraChunk(audio) {
  const original = new Uint8Array(audio);
  const chunkPayloadSize = 3;
  const insertedSize = 8 + chunkPayloadSize + 1;
  const output = new ArrayBuffer(audio.byteLength + insertedSize);
  const bytes = new Uint8Array(output);
  const view = new DataView(output);
  bytes.set(original.subarray(0, 36), 0);
  bytes.set([0x4a, 0x55, 0x4e, 0x4b], 36); // JUNK
  view.setUint32(40, chunkPayloadSize, true);
  bytes.set([1, 2, 3], 44);
  bytes[47] = 0; // Required padding for an odd-sized chunk.
  bytes.set(original.subarray(36), 48);
  view.setUint32(4, output.byteLength - 8, true);
  return output;
}

test('squalling preserves the low-energy initial s with protective preroll', () => {
  const result = analyze([
    { durationMs: 800, amplitude: 0 },
    { durationMs: 120, amplitude: 52 },
    { durationMs: 700, amplitude: 10_000 },
    { durationMs: 300, amplitude: 0 },
  ]);
  assert.equal(result.after.audibleStartMs, 800);
  assert.equal(safeAudibleStartSeconds(result.after) * 1000, 800 - AUDIBLE_START_PREROLL_MS);
});

test('word beginning with s retains its quiet fricative', () => {
  const result = analyze([
    { durationMs: 110, amplitude: 0 },
    { durationMs: 100, amplitude: 58 },
    { durationMs: 600, amplitude: 9_000 },
  ]);
  assert.equal(result.after.audibleStartMs, 110);
  assert.equal(safeAudibleStartSeconds(result.after), 0.03);
});

test('word beginning with f starts from zero when frication is already present', () => {
  const result = analyze([
    { durationMs: 120, amplitude: 180 },
    { durationMs: 600, amplitude: 9_000 },
  ]);
  assert.equal(result.after.audibleStartMs, 0);
  assert.equal(safeAudibleStartSeconds(result.after), 0);
});

test('word beginning with th preserves a low-energy initial consonant', () => {
  const result = analyze([
    { durationMs: 140, amplitude: 0 },
    { durationMs: 100, amplitude: 52 },
    { durationMs: 600, amplitude: 8_000 },
  ]);
  assert.equal(result.after.audibleStartMs, 140);
  assert.equal(safeAudibleStartSeconds(result.after), 0.06);
});

test('audio with no leading silence starts from position zero', () => {
  const result = analyze([{ durationMs: 700, amplitude: 9_000 }]);
  assert.equal(result.after.audibleStartMs, 0);
  assert.equal(safeAudibleStartSeconds(result.after), 0);
});

test('audio with substantial leading silence seeks close to speech', () => {
  const result = analyze([
    { durationMs: 600, amplitude: 0 },
    { durationMs: 700, amplitude: 9_000 },
  ]);
  assert.equal(result.after.audibleStartMs, 600);
  assert.equal(safeAudibleStartSeconds(result.after), 0.52);
  assert.equal(withSafeAudibleStartMs(result.after).safeStartMs, 520);
});

test('long sentence keeps internal pauses and audible-end completion', () => {
  const result = analyze([
    { durationMs: 1_000, amplitude: 9_000 },
    { durationMs: 1_000, amplitude: 0 },
    { durationMs: 1_000, amplitude: 9_000 },
    { durationMs: 300, amplitude: 0 },
  ]);
  assert.equal(result.after.audibleStartMs, 0);
  assert.equal(result.after.audibleEndMs, 3_000);
  assert.equal(result.after.durationMs, 3_040);
  assert.equal(hasReachedAISpeechAudibleEnd(2.99, result.after), false);
  assert.equal(hasReachedAISpeechAudibleEnd(3, result.after), true);
});

test('missing or unreliable audibleStartMs safely falls back to zero', () => {
  assert.equal(safeAudibleStartSeconds(undefined), 0);
  assert.equal(safeAudibleStartSeconds({ durationMs: 1_000, audibleEndMs: 800 }), 0);
  assert.equal(safeAudibleStartSeconds({ durationMs: 1_000, audibleStartMs: 900, audibleEndMs: 800 }), 0);
});

test('WAV parser skips an extra odd-sized chunk and respects its padding', () => {
  const source = pcm16Wav([
    { durationMs: 100, amplitude: 0 },
    { durationMs: 500, amplitude: 8_000 },
    { durationMs: 300, amplitude: 0 },
  ]);
  const result = trimWavTrailingSilence(wavWithExtraChunk(source));
  assert.ok(result);
  assert.equal(result.before.audibleStartMs, 100);
  assert.equal(result.before.audibleEndMs, 600);
});

test('malformed, truncated, and empty WAV data fail analysis safely', () => {
  assert.equal(trimWavTrailingSilence(new ArrayBuffer(0)), null);
  const valid = pcm16Wav([{ durationMs: 100, amplitude: 8_000 }]);
  assert.equal(trimWavTrailingSilence(valid.slice(0, valid.byteLength - 1)), null);
  assert.equal(trimWavTrailingSilence(pcm16Wav([])), null);
});

test('unsupported WAV sample format fails analysis safely', () => {
  const unsupported = pcm16Wav([{ durationMs: 100, amplitude: 8_000 }]);
  new DataView(unsupported).setUint16(20, 3, true); // IEEE float instead of PCM.
  assert.equal(trimWavTrailingSilence(unsupported), null);
});

test('successful audio survives an unexpected timing-analysis exception unchanged', () => {
  const audio = pcm16Wav([{ durationMs: 100, amplitude: 8_000 }]);
  const result = analyzeWavBestEffort(audio, () => {
    throw new RangeError('simulated analyzer failure');
  });
  assert.equal(result.audio, audio);
  assert.equal(result.timing, null);
  assert.equal(result.failure.name, 'RangeError');
  assert.equal(result.failure.stage, 'pcm_analysis');
});

test('client falls back when timing headers are missing or inconsistent', () => {
  assert.equal(readSpeechTiming(new Response(new Uint8Array([1]))), null);
  const invalid = new Response(new Uint8Array([1]), {
    headers: {
      'X-WordPing-Audio-Original-Duration-Ms': '1000',
      'X-WordPing-Audio-Original-Audible-End-Ms': '900',
      'X-WordPing-Audio-Duration-Ms': '500',
      'X-WordPing-Audio-Audible-End-Ms': '700',
      'X-WordPing-Audio-Trailing-Silence-Ms': '0',
    },
  });
  assert.equal(readSpeechTiming(invalid), null);
});

test('failed OpenAI response remains distinguishable from a successful audio response', async () => {
  const response = await fetchOpenAISpeech({
    apiKey: 'not-a-real-key',
    model: 'test-model',
    text: 'not logged',
    voice: 'marin',
    format: 'wav',
  }, async () => Response.json({ error: { type: 'server_error' } }, { status: 503 }));
  assert.equal(response.ok, false);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type'), /application\/json/);
});

test('TTS cache identity normalizes text and includes every audio-generation parameter', () => {
  const normalized = normalizeTTSRequest('  squalling\n  loudly  ', 'fable');
  assert.deepEqual(normalized, {
    text: 'squalling loudly',
    voice: 'fable',
    speed: 1,
    model: 'gpt-4o-mini-tts',
    format: 'wav',
  });
  const key = serializeTTSCacheKey(normalized);
  assert.deepEqual(JSON.parse(key), normalized);
  assert.notEqual(key, serializeTTSCacheKey({ ...normalized, speed: 0.9 }));
  assert.notEqual(key, serializeTTSCacheKey({ ...normalized, voice: 'marin' }));
  assert.notEqual(key, serializeTTSCacheKey({ ...normalized, format: 'mp3' }));
});

test('disk-cache validation accepts supported WAV files including extra chunks', () => {
  const valid = pcm16Wav([{ durationMs: 200, amplitude: 8_000 }]);
  assert.equal(isSupportedCachedWav(new Uint8Array(valid)), true);
  assert.equal(isSupportedCachedWav(new Uint8Array(wavWithExtraChunk(valid))), true);
});

test('disk-cache validation rejects missing, corrupted, truncated, and incompatible audio', () => {
  assert.equal(isSupportedCachedWav(new Uint8Array()), false);
  assert.equal(isSupportedCachedWav(new Uint8Array([1, 2, 3, 4])), false);
  const truncated = pcm16Wav([{ durationMs: 200, amplitude: 8_000 }]);
  assert.equal(isSupportedCachedWav(new Uint8Array(truncated.slice(0, truncated.byteLength - 1))), false);
  const unsupported = pcm16Wav([{ durationMs: 200, amplitude: 8_000 }]);
  new DataView(unsupported).setUint16(20, 3, true);
  assert.equal(isSupportedCachedWav(new Uint8Array(unsupported)), false);
});

test('only real generation or downloading displays the loading indicator', () => {
  assert.equal(isTTSNetworkLoading('checking-cache'), false);
  assert.equal(isTTSNetworkLoading('ready'), false);
  assert.equal(isTTSNetworkLoading('playing'), false);
  assert.equal(isTTSNetworkLoading('failed'), false);
  assert.equal(isTTSNetworkLoading('idle'), false);
  assert.equal(isTTSNetworkLoading('generating-or-downloading'), true);
});

test('Word List and Flip cards share one voice playback hook and button renderer', () => {
  const listCard = fs.readFileSync('src/components/SwipeableCard.tsx', 'utf8');
  const flipCard = fs.readFileSync('src/components/FlipCardBrowser.tsx', 'utf8');
  for (const source of [listCard, flipCard]) {
    assert.ok(source.includes('useWordCardVoicePlayback'));
    assert.ok(source.includes('WordCardVoiceButton'));
  }
});

test('concurrent identical TTS work is deduplicated', async () => {
  const requests = new DeduplicatedRequestRegistry();
  let calls = 0;
  let release;
  const factory = () => {
    calls++;
    return new Promise(resolve => { release = resolve; });
  };
  const first = requests.run('same-request', factory);
  const second = requests.run('same-request', factory);
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(first.promise, second.promise);
  assert.equal(calls, 0);
  await Promise.resolve();
  assert.equal(calls, 1);
  release('audio');
  assert.deepEqual(await Promise.all([first.promise, second.promise]), ['audio', 'audio']);
});

test('cancelled TTS work can be retried without the old request deleting the retry', async () => {
  const requests = new DeduplicatedRequestRegistry();
  let calls = 0;
  const factory = signal => new Promise((resolve, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
    if (calls === 2) resolve('retry-audio');
  });
  const first = requests.run('same-request', factory);
  await Promise.resolve();
  requests.cancel(first.controller);
  const retry = requests.run('same-request', factory);
  assert.equal(retry.deduplicated, false);
  await assert.rejects(first.promise, error => error.name === 'AbortError');
  assert.equal(await retry.promise, 'retry-audio');
  assert.equal(calls, 2);
});

test('failed network work is removed so a later tap can retry', async () => {
  const requests = new DeduplicatedRequestRegistry();
  let calls = 0;
  const first = requests.run('retryable-request', async () => {
    calls++;
    throw new Error('service_unavailable');
  });
  await assert.rejects(first.promise, /service_unavailable/);
  await Promise.resolve();
  const retry = requests.run('retryable-request', async () => {
    calls++;
    return 'audio';
  });
  assert.equal(retry.deduplicated, false);
  assert.equal(await retry.promise, 'audio');
  assert.equal(calls, 2);
});

test('AI preload eligibility allows Basic and Premium access but excludes Free, empty, and custom audio', () => {
  const eligible = { text: 'squalling', hasCustomAudio: false };
  assert.equal(isAIPronunciationPreloadEligible({ ...eligible, hasAIAccess: true }), true); // Basic
  assert.equal(isAIPronunciationPreloadEligible({ ...eligible, hasAIAccess: true }), true); // Premium
  assert.equal(isAIPronunciationPreloadEligible({ ...eligible, hasAIAccess: false }), false); // Free
  assert.equal(isAIPronunciationPreloadEligible({ hasAIAccess: true, text: '   ' }), false);
  assert.equal(isAIPronunciationPreloadEligible({ ...eligible, hasAIAccess: true, hasCustomAudio: true }), false);
});

test('Natural AI Voice preload is entitlement-gated and contains exactly eight fixed samples', () => {
  assert.equal(isAIVoiceSamplePreloadEligible('basic'), true);
  assert.equal(isAIVoiceSamplePreloadEligible('premium'), true);
  assert.equal(isAIVoiceSamplePreloadEligible('free'), false);
  assert.equal(AI_VOICE_SAMPLES.length, 8);
  assert.equal(new Set(AI_VOICE_SAMPLES.map(sample => sample.voice)).size, 8);
  assert.ok(AI_VOICE_SAMPLES.every(sample => sample.contentVersion === AI_VOICE_SAMPLE_CONTENT_VERSION));
});

test('client and Edge Function keep the fixed sample version, voices, and copy synchronized', () => {
  const edgeSource = fs.readFileSync('supabase/functions/openai/index.ts', 'utf8');
  assert.match(edgeSource, new RegExp(`VOICE_SAMPLE_VERSION = '${AI_VOICE_SAMPLE_CONTENT_VERSION}'`));
  for (const sample of AI_VOICE_SAMPLES) {
    assert.ok(edgeSource.includes(`${sample.voice}: '${sample.text}'`));
  }
  assert.ok(edgeSource.includes("action === 'speech_sample'"));
});

test('shared voice sample metadata and cache RPCs remain service-role only', () => {
  const migration = fs.readFileSync(
    'supabase/migrations/20260803000001_shared_voice_samples.sql',
    'utf8',
  );
  assert.ok(migration.includes('ALTER TABLE public.voice_sample_generations ENABLE ROW LEVEL SECURITY'));
  assert.ok(migration.includes('REVOKE ALL ON public.voice_sample_generations FROM PUBLIC, anon, authenticated'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.claim_voice_sample_generation(text) TO service_role'));
});

test('voice sample cache identity includes text, voice, model, speed, format, and content version', () => {
  const sample = AI_VOICE_SAMPLES[0];
  const base = normalizeTTSRequest(sample.text, sample.voice, sample.contentVersion);
  const baseKey = serializeTTSCacheKey(base);
  for (const changed of [
    { ...base, text: `${base.text}!` },
    { ...base, voice: 'fable' },
    { ...base, model: 'future-model' },
    { ...base, speed: 0.9 },
    { ...base, format: 'future-format' },
    { ...base, contentVersion: 'natural-ai-voice-v2' },
  ]) {
    assert.notEqual(serializeTTSCacheKey(changed), baseKey);
  }
});

test('eight voice samples are preloaded with conservative concurrency two', async () => {
  assert.equal(AI_VOICE_SAMPLE_PRELOAD_CONCURRENCY, 2);
  const queue = new ControlledTTSPreloadQueue(AI_VOICE_SAMPLE_PRELOAD_CONCURRENCY);
  let active = 0;
  let maximumActive = 0;
  const jobs = AI_VOICE_SAMPLES.map(sample => queue.enqueue(
    sample.voice,
    'voice-sample-owner',
    async () => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
    },
  ).promise);
  await Promise.all(jobs);
  assert.equal(maximumActive, 2);
});

test('background preload queue limits rapid registrations to conservative concurrency', async () => {
  const queue = new ControlledTTSPreloadQueue(1);
  const releases = [];
  let active = 0;
  let maximumActive = 0;
  const task = () => new Promise(resolve => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    releases.push(() => { active--; resolve(); });
  });

  const first = queue.enqueue('word-one', 'card-one', task);
  const second = queue.enqueue('word-two', 'card-two', task);
  const third = queue.enqueue('word-three', 'card-three', task);
  await Promise.resolve();
  assert.equal(active, 1);
  assert.equal(maximumActive, 1);
  releases.shift()();
  await first.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(active, 1);
  releases.shift()();
  await second.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(active, 1);
  releases.shift()();
  await third.promise;
  assert.equal(maximumActive, 1);
});

test('duplicate registrations share one queued or running preload Promise', async () => {
  const queue = new ControlledTTSPreloadQueue(1);
  let calls = 0;
  let release;
  const first = queue.enqueue('same-normalized-key', 'card-one', () => new Promise(resolve => {
    calls++;
    release = resolve;
  }));
  const duplicate = queue.enqueue('same-normalized-key', 'card-two', async () => {
    calls++;
  });
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.promise, first.promise);
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  await Promise.all([first.promise, duplicate.promise]);
  assert.equal(calls, 1);
});

test('deleting an entry cancels queued preload and discards ownership of running preload', async () => {
  const queue = new ControlledTTSPreloadQueue(1);
  let releaseRunning;
  let queuedCalls = 0;
  const running = queue.enqueue('running-key', 'running-card', () => new Promise(resolve => {
    releaseRunning = resolve;
  }));
  const queued = queue.enqueue('queued-key', 'queued-card', async () => { queuedCalls++; });
  await Promise.resolve();

  assert.deepEqual(queue.cancelOwner('queued-card'), { queuedCancelled: 1, runningDiscarded: 0 });
  assert.deepEqual(queue.cancelOwner('running-card'), { queuedCancelled: 0, runningDiscarded: 1 });
  assert.equal(queue.hasOwners('running-key'), false);
  await queued.promise;
  assert.equal(queuedCalls, 0);
  releaseRunning();
  await running.promise;
});
