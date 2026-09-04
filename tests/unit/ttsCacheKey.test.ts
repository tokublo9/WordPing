import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DeduplicatedRequestRegistry,
  normalizeTTSRequest,
  normalizedTTSText,
  serializeTTSCacheKey,
} from '../../src/lib/ttsRequest';

// Three decisions read this one function: which file a clip is cached as,
// whether an edit changed the spoken word, and whether another card still needs
// a clip. They only agree because they all call it.

test('normalization collapses the differences a cache key must ignore', () => {
  assert.equal(normalizedTTSText('  hello  '), 'hello');
  assert.equal(normalizedTTSText('hello   world'), 'hello world');
  assert.equal(normalizedTTSText('hello\n\tworld'), 'hello world');
  assert.equal(normalizedTTSText(''), '');
  assert.equal(normalizedTTSText('   '), '', 'whitespace alone is not a word');
});

test('normalization is what the cache key is built from', () => {
  const padded = serializeTTSCacheKey(normalizeTTSRequest('  hello   world ', 'marin'));
  const plain = serializeTTSCacheKey(normalizeTTSRequest('hello world', 'marin'));
  assert.equal(padded, plain, 'a whitespace-only edit must not regenerate audio');
});

test('voice and content version each split the key', () => {
  const marin = serializeTTSCacheKey(normalizeTTSRequest('hello', 'marin'));
  const cedar = serializeTTSCacheKey(normalizeTTSRequest('hello', 'cedar'));
  assert.notEqual(marin, cedar, 'a voice change is a different clip');

  // Voice previews carry a contentVersion; word cards never do. That is what
  // keeps word-card cache cleanup from reaching a preview clip.
  const sample = serializeTTSCacheKey(normalizeTTSRequest('hello', 'marin', 'natural-ai-voice-v2'));
  assert.notEqual(marin, sample);
});

test('two cards with the same text share one key, which is why deletion counts references', () => {
  const first = serializeTTSCacheKey(normalizeTTSRequest('apple', 'marin'));
  const second = serializeTTSCacheKey(normalizeTTSRequest(' apple', 'marin'));
  assert.equal(first, second);
});

test('the request registry reports work that is still in the air', async () => {
  const registry = new DeduplicatedRequestRegistry<string>();
  assert.equal(registry.has('k'), false);

  let settle: (value: string) => void = () => {};
  const pending = registry.run('k', () => new Promise<string>(resolve => { settle = resolve; }));
  assert.equal(registry.has('k'), true, 'a cache release must leave this file alone');

  // The registry invokes the factory in a microtask, so `settle` is still the
  // placeholder until the event loop has turned once.
  await new Promise(resolve => setTimeout(resolve, 0));
  settle('done');
  await pending.promise;
  assert.equal(registry.has('k'), false, 'and may release it once nothing is using it');
});
