import { describe, expect, it } from 'vitest';
import {
  BASIC_LIFETIME_VOICE_CREDITS,
  RESERVATION_TTL_MS,
  VoiceCreditLedger,
  applyLedgerOp,
  type LedgerState,
  type ReserveResult,
} from '../src/lifetimeCredits';

/**
 * The real ledger, not a double.
 *
 * These drive `VoiceCreditLedger` itself — the class that ships — over a
 * storage layer that reproduces the two guarantees Cloudflare gives a Durable
 * Object: storage survives the instance, and `blockConcurrencyWhile` lets no
 * other event interleave with a read-modify-write.
 *
 * WHAT THIS CANNOT PROVE: that the real runtime honours those guarantees. It
 * proves the ledger is correct *given* them, which is the half that lives in
 * this repo. Cloudflare owns the other half.
 */

/** Storage that outlives the object, so a "restart" is a new instance over it. */
class FakeStorage {
  constructor(readonly map = new Map<string, unknown>()) {}
  async get<T>(key: string): Promise<T | undefined> {
    // Deep-copied on the way out, so a caller mutating the result cannot reach
    // back into storage — the real thing serialises.
    const value = this.map.get(key);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as T;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.map.set(key, JSON.parse(JSON.stringify(value)));
  }
}

/**
 * A state whose `blockConcurrencyWhile` genuinely serialises.
 *
 * Every callback is chained onto the previous one, so two concurrent `fetch`
 * calls cannot observe the same balance — which is exactly the property the
 * production object relies on and the FakeCreditLedger could not demonstrate.
 */
class FakeDurableObjectState {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(readonly storage: FakeStorage) {}
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T> {
    const next = this.chain.then(callback, callback);
    // Keep the chain alive even if one call rejects.
    this.chain = next.then(() => undefined, () => undefined);
    return next;
  }
}

function makeLedger(storage = new FakeStorage()) {
  const state = new FakeDurableObjectState(storage);
  const ledger = new VoiceCreditLedger(state as unknown as DurableObjectState);
  const call = async (op: string, key: string): Promise<ReserveResult> => {
    const response = await ledger.fetch(
      new Request(`https://ledger/${op}?key=${encodeURIComponent(key)}`, { method: 'POST' }),
    );
    return (await response.json()) as ReserveResult;
  };
  return { ledger, storage, call };
}

function storedState(storage: FakeStorage): LedgerState {
  return storage.map.get('balance') as LedgerState;
}

describe('the one-time grant', () => {
  it('issues exactly 200 on first sight and never again', async () => {
    const { call, storage } = makeLedger();

    const first = await call('reserve', 'req-1');
    expect(first.ok).toBe(true);
    expect(storedState(storage).granted).toBe(true);
    expect(first.remaining).toBe(BASIC_LIFETIME_VOICE_CREDITS);

    await call('commit', 'req-1');
    expect(storedState(storage).remaining).toBe(199);

    // Every later operation sees the same ledger — nothing re-grants.
    for (let index = 2; index <= 5; index++) {
      await call('reserve', `req-${index}`);
      await call('commit', `req-${index}`);
    }
    expect(storedState(storage).remaining).toBe(195);
    expect(storedState(storage).granted).toBe(true);
  });

  it('survives an instance restart — the balance is in storage, not memory', async () => {
    const storage = new FakeStorage();
    const first = makeLedger(storage);
    for (let index = 0; index < 3; index++) {
      await first.call('reserve', `r-${index}`);
      await first.call('commit', `r-${index}`);
    }
    expect(storedState(storage).remaining).toBe(197);

    // A brand-new object over the same storage: an eviction, a redeploy, or a
    // new device hitting the same subscriber identity.
    const restarted = makeLedger(storage);
    const after = await restarted.call('peek', '');
    expect(after.remaining).toBe(197);
    // And it does not re-grant on the way back up.
    await restarted.call('reserve', 'r-after');
    await restarted.call('commit', 'r-after');
    expect(storedState(storage).remaining).toBe(196);
  });
});

describe('simultaneous requests', () => {
  it('two racing requests with one credit left: exactly one wins', async () => {
    const storage = new FakeStorage();
    await storage.put('balance', {
      granted: true, remaining: 1, reservations: {}, recentCommits: {},
    } satisfies LedgerState);
    const { call } = makeLedger(storage);

    const [a, b] = await Promise.all([call('reserve', 'a'), call('reserve', 'b')]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a.ok, b.ok].filter(ok => !ok)).toHaveLength(1);
    // The winner holds the credit; nothing is available to anyone else.
    expect(Math.min(a.available, b.available)).toBe(0);
  });

  it('300 simultaneous attempts never generate more than 200 times', async () => {
    const { call, storage } = makeLedger();

    const attempts = Array.from({ length: 300 }, (_, index) => `req-${index}`);
    const reservations = await Promise.all(attempts.map(key => call('reserve', key)));
    const granted = reservations.filter(reservation => reservation.ok);

    // The whole point: the balance is a hard ceiling under concurrency.
    expect(granted).toHaveLength(BASIC_LIFETIME_VOICE_CREDITS);
    expect(reservations.filter(r => !r.ok)).toHaveLength(100);

    // Committing every winner spends the balance exactly, never past zero.
    await Promise.all(
      attempts
        .filter((_, index) => reservations[index]!.ok)
        .map(key => call('commit', key)),
    );
    expect(storedState(storage).remaining).toBe(0);
    // And nothing more can be reserved afterwards.
    expect((await call('reserve', 'one-more')).ok).toBe(false);
  });

  it('releases return credits so a later request can use them', async () => {
    const { call, storage } = makeLedger();

    const keys = Array.from({ length: 200 }, (_, index) => `r-${index}`);
    await Promise.all(keys.map(key => call('reserve', key)));
    expect((await call('reserve', 'blocked')).ok).toBe(false);

    // Half the generations fail and give their credits back.
    await Promise.all(keys.slice(0, 100).map(key => call('release', key)));
    expect((await call('reserve', 'now-allowed')).ok).toBe(true);
    // Nothing was spent by a release.
    expect(storedState(storage).remaining).toBe(BASIC_LIFETIME_VOICE_CREDITS);
  });
});

describe('the lifecycle', () => {
  it('reserve then commit spends exactly one', async () => {
    const { call, storage } = makeLedger();
    await call('reserve', 'k');
    expect(storedState(storage).remaining).toBe(200);
    expect(Object.keys(storedState(storage).reservations)).toEqual(['k']);

    await call('commit', 'k');
    expect(storedState(storage).remaining).toBe(199);
    expect(storedState(storage).reservations).toEqual({});
  });

  it('reserve then release spends nothing', async () => {
    const { call, storage } = makeLedger();
    await call('reserve', 'k');
    await call('release', 'k');
    expect(storedState(storage).remaining).toBe(BASIC_LIFETIME_VOICE_CREDITS);
    expect(storedState(storage).reservations).toEqual({});
    // The credit is genuinely back in circulation.
    expect((await call('peek', '')).available).toBe(BASIC_LIFETIME_VOICE_CREDITS);
  });
});

describe('duplicate and retried requests', () => {
  it('the same key cannot reserve twice', async () => {
    const { call, storage } = makeLedger();
    const first = await call('reserve', 'same');
    const second = await call('reserve', 'same');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    // One claim, not two.
    expect(Object.keys(storedState(storage).reservations)).toEqual(['same']);
    expect((await call('peek', '')).available).toBe(199);
  });

  it('the same key cannot be committed twice', async () => {
    const { call, storage } = makeLedger();
    await call('reserve', 'same');
    await call('commit', 'same');
    expect(storedState(storage).remaining).toBe(199);

    const retry = await call('commit', 'same');
    expect(retry.ok).toBe(true);
    expect(retry.duplicate).toBe(true);
    // Charged once, however many times the retry arrives.
    expect(storedState(storage).remaining).toBe(199);
  });

  it('a retry after a commit does not take a fresh credit', async () => {
    const { call, storage } = makeLedger();
    await call('reserve', 'same');
    await call('commit', 'same');

    const retryReserve = await call('reserve', 'same');
    expect(retryReserve.ok).toBe(true);
    expect(retryReserve.duplicate).toBe(true);
    expect(Object.keys(storedState(storage).reservations)).toEqual([]);
    expect(storedState(storage).remaining).toBe(199);
  });
});

describe('abandoned reservations', () => {
  it('expire and return the credit', () => {
    // Driven through the pure rule so the clock can be moved. A Worker that died
    // mid-generation leaves exactly this state.
    const now = 1_000_000;
    const abandoned: LedgerState = {
      granted: true,
      remaining: 1,
      reservations: { dead: now - RESERVATION_TTL_MS - 1 },
      recentCommits: {},
    };
    const { next, result } = applyLedgerOp(abandoned, 'reserve', 'fresh', now);
    expect(result.ok).toBe(true);
    expect(Object.keys(next.reservations)).toEqual(['fresh']);
  });

  it('do not expire while the generation is still running', () => {
    const now = 1_000_000;
    const running: LedgerState = {
      granted: true,
      remaining: 1,
      reservations: { live: now - 1_000 },
      recentCommits: {},
    };
    const { result } = applyLedgerOp(running, 'reserve', 'other', now);
    expect(result.ok).toBe(false);
  });

  it('a commit whose reservation expired still charges', () => {
    // The audio was delivered. Treating an expired claim as free would make a
    // slow generation the cheapest way to get one.
    const now = 1_000_000;
    const expired: LedgerState = {
      granted: true,
      remaining: 5,
      reservations: { slow: now - RESERVATION_TTL_MS - 1 },
      recentCommits: {},
    };
    const { next } = applyLedgerOp(expired, 'commit', 'slow', now);
    expect(next.remaining).toBe(4);
  });

  it('never drops below zero', () => {
    const now = 1_000_000;
    const empty: LedgerState = {
      granted: true, remaining: 0, reservations: {}, recentCommits: {},
    };
    const { next } = applyLedgerOp(empty, 'commit', 'k', now);
    expect(next.remaining).toBe(0);
  });
});
