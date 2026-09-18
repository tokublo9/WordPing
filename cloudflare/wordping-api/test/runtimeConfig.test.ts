import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KILLSWITCH_KEY,
  LIMITS_KEY,
  loadRuntimeConfig,
} from '../src/runtimeConfig';
import { makeEnv } from './helpers';

afterEach(() => vi.useRealTimers());

describe('runtime config KV reads', () => {
  it('reuses the result until the refresh window ends', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T00:00:00Z'));
    const env = makeEnv();
    const reads = vi.spyOn(env.WORDPING_KV, 'get');

    const first = await loadRuntimeConfig(env, 'first');
    const second = await loadRuntimeConfig(env, 'second');
    expect(first).toBe(second);
    expect(reads.mock.calls.map(([key]) => key)).toEqual([KILLSWITCH_KEY, LIMITS_KEY]);

    await env.WORDPING_KV.put(KILLSWITCH_KEY, JSON.stringify({ voice_custom: true }));
    expect((await loadRuntimeConfig(env, 'third')).disabledFeatures.has('voice_custom')).toBe(false);
    expect(reads).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_001);
    expect((await loadRuntimeConfig(env, 'fourth')).disabledFeatures.has('voice_custom')).toBe(true);
    expect(reads).toHaveBeenCalledTimes(4);
  });

  it('retries after a KV read failure instead of caching fallback defaults', async () => {
    const env = makeEnv();
    await env.WORDPING_KV.put(KILLSWITCH_KEY, JSON.stringify({ voice_custom: true }));
    const reads = vi.spyOn(env.WORDPING_KV, 'get');
    reads.mockRejectedValueOnce(new Error('temporary KV failure'));

    expect((await loadRuntimeConfig(env, 'failed')).disabledFeatures.has('voice_custom')).toBe(false);
    expect((await loadRuntimeConfig(env, 'recovered')).disabledFeatures.has('voice_custom')).toBe(true);
    expect(reads).toHaveBeenCalledTimes(4);
  });

  it('does not share cached config across KV bindings', async () => {
    const firstEnv = makeEnv();
    const secondEnv = makeEnv();
    await secondEnv.WORDPING_KV.put(LIMITS_KEY, JSON.stringify({
      voice_card: { premium: { maxRequestsPerMinute: 0 } },
    }));

    const first = await loadRuntimeConfig(firstEnv, 'first');
    const second = await loadRuntimeConfig(secondEnv, 'second');
    expect(first.limitsFor('voice_card', 'premium').maxRequestsPerMinute).toBe(20);
    expect(second.limitsFor('voice_card', 'premium').maxRequestsPerMinute).toBe(0);
  });
});
