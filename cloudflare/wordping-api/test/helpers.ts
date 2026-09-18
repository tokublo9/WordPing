import { vi } from 'vitest';
import type { Env } from '../src/env';
import { BASIC_LIFETIME_VOICE_CREDITS, applyCardOp, applyLedgerOp, type CardBalanceState, type LedgerOp, type LedgerState } from '../src/lifetimeCredits';
import { applyAudioDuration, applyVoiceQuota, describePremiumVoiceUsage, type VoiceQuotaState } from '../src/monthlyQuota';
import { APP_USER_ID_HEADER, INSTALL_ID_HEADER } from '../src/identity';

/**
 * In-memory KV double. Honours expirationTtl so cache-expiry behaviour can be
 * asserted, and records every write so tests can prove a counter moved.
 */
export class FakeKV {
  readonly store = new Map<string, { value: string | ArrayBuffer; expiresAt: number | null }>();
  now = Date.now();

  async get(key: string, options?: 'arrayBuffer' | { cacheTtl?: number }): Promise<unknown> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.store.delete(key);
      return null;
    }
    if (options === 'arrayBuffer') {
      return typeof entry.value === 'string' ? new TextEncoder().encode(entry.value).buffer : entry.value;
    }
    return typeof entry.value === 'string' ? entry.value : new TextDecoder().decode(entry.value);
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    const resolved = value instanceof ReadableStream
      ? await new Response(value).arrayBuffer()
      : value;
    this.store.set(key, {
      value: resolved,
      expiresAt: options?.expirationTtl ? this.now + options.expirationTtl * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Numeric counter helper for rate-limit assertions. */
  counter(prefix: string): number {
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix) && typeof entry.value === 'string') return Number(entry.value);
    }
    return 0;
  }

  keysStartingWith(prefix: string): string[] {
    return [...this.store.keys()].filter(key => key.startsWith(prefix));
  }
}


/**
 * In-memory stand-in for the VOICE_CREDITS Durable Object namespace.
 *
 * Drives the *real* ledger rules (`applyLedgerOp`) over a plain map, so the
 * route-level tests exercise the same reserve/commit/release decisions the
 * production object makes. Only the runtime is faked, not the logic — the
 * ledger's own concurrency and persistence behaviour is covered directly in
 * voiceCreditLedger.test.ts.
 */
export class FakeCreditLedger {
  readonly states = new Map<string, LedgerState>();
  readonly cardStates = new Map<string, CardBalanceState>();
  readonly quotaStates = new Map<string, VoiceQuotaState>();
  constructor(private readonly grant = BASIC_LIFETIME_VOICE_CREDITS) {}

  /** Seed a balance for a name, e.g. 0 to simulate an exhausted subscriber. */
  seed(name: string, remaining: number): void {
    this.states.set(name, { granted: true, grantSize: this.grant, remaining, reservations: {}, recentCommits: {} });
  }

  /** Unspent credits for a name, or the full grant if never touched. */
  remaining(name: string): number {
    return this.states.get(name)?.remaining ?? this.grant;
  }

  idFromName(name: string): string { return name; }

  get(name: string) {
    const states = this.states;
    const cardStates = this.cardStates;
    const grant = this.grant;
    return {
      fetch: async (url: string) => {
        const parsed = new URL(url);
        const op = parsed.pathname.slice(1);
        const key = parsed.searchParams.get('key') ?? '';
        if (op === 'quotaStatus') {
          const dayLimit = Number(parsed.searchParams.get('day'));
          return Response.json(describePremiumVoiceUsage(this.quotaStates.get(name), Date.now(), dayLimit));
        }
        if (op === 'quotaAudioCommit' || op === 'quotaAudioPeek') {
          const durationMs = op === 'quotaAudioPeek' ? 0 : Number(parsed.searchParams.get('durationMs'));
          const tier = parsed.searchParams.get('tier') === 'basic' ? 'basic' : 'premium';
          const applied = applyAudioDuration(this.quotaStates.get(name), Date.now(), durationMs, tier);
          if (op === 'quotaAudioCommit') this.quotaStates.set(name, applied.next);
          return Response.json(applied.decision);
        }
        if (op === 'quotaReserve' || op === 'quotaPeek') {
          const characters = Number(parsed.searchParams.get('characters') ?? '0');
          const override = {
            maxRequestsPerMinute: Number(parsed.searchParams.get('minute')),
            maxRequestsPerDay: Number(parsed.searchParams.get('day')),
            maxCharsPerDay: Number(parsed.searchParams.get('chars')),
          };
          const applied = applyVoiceQuota(this.quotaStates.get(name), Date.now(), characters, op === 'quotaReserve', override);
          if (op === 'quotaReserve' && applied.decision.allowed) this.quotaStates.set(name, applied.next);
          return Response.json(applied.decision);
        }
        if (op === 'cardReserve' || op === 'cardCommit' || op === 'cardRelease' || op === 'cardPeek') {
          const cardKey = parsed.searchParams.get('card') ?? '';
          const before = cardStates.get(name) ?? { grantedCards: {}, reservations: {} };
          const { next, result } = applyCardOp(before, op, key, cardKey, Date.now());
          cardStates.set(name, next);
          return Response.json(result);
        }
        const before = states.get(name) ?? {
          granted: true, grantSize: grant, remaining: grant, reservations: {}, recentCommits: {},
        };
        const { next, result } = applyLedgerOp(before, op as LedgerOp, key, Date.now());
        states.set(name, next);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    };
  }
}

export function makeEnv(
  overrides: Partial<Env> = {},
): Env & { WORDPING_KV: FakeKV; VOICE_CREDITS: FakeCreditLedger } {
  const kv = new FakeKV();
  const credits = new FakeCreditLedger();
  return {
    OPENAI_API_KEY: 'sk-test-openai-key',
    REVENUECAT_SECRET_API_KEY: 'sk-test-revenuecat-key',
    RATE_LIMIT_SALT: 'test-salt',
    ALLOWED_ORIGINS: 'http://localhost:8081',
    ENTITLEMENT_BASIC: 'basic',
    ENTITLEMENT_PREMIUM: 'premium',
    DEV_BYPASS_ENTITLEMENTS: '0',
    ...overrides,
    WORDPING_KV: (overrides.WORDPING_KV as unknown as FakeKV) ?? kv,
    VOICE_CREDITS: (overrides.VOICE_CREDITS as unknown as FakeCreditLedger) ?? credits,
  } as unknown as Env & { WORDPING_KV: FakeKV; VOICE_CREDITS: FakeCreditLedger };
}

export function makeCtx(): ExecutionContext {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) { pending.push(promise); },
    passThroughOnException() {},
    props: {},
    /** Test-only: lets a test await background KV writes. */
    async settle() { await Promise.all(pending); },
  };
  return ctx as unknown as ExecutionContext;
}

export async function settle(ctx: ExecutionContext): Promise<void> {
  await (ctx as unknown as { settle(): Promise<void> }).settle();
}

export interface RequestOptions {
  method?: string;
  contentType?: string | null;
  installId?: string | null;
  appUserId?: string | null;
  body?: unknown;
  rawBody?: string;
  origin?: string;
  headers?: Record<string, string>;
  host?: string;
}

export function makeRequest(path: string, options: RequestOptions = {}): Request {
  const headers = new Headers(options.headers ?? {});
  const contentType = options.contentType === undefined ? 'application/json' : options.contentType;
  if (contentType !== null) headers.set('Content-Type', contentType);

  const installId = options.installId === undefined ? 'install-0123456789abcdef' : options.installId;
  if (installId !== null) headers.set(INSTALL_ID_HEADER, installId);

  const appUserId = options.appUserId === undefined ? '$RCAnonymousID:abc123def456' : options.appUserId;
  if (appUserId !== null) headers.set(APP_USER_ID_HEADER, appUserId);

  if (options.origin) headers.set('Origin', options.origin);
  headers.set('CF-Connecting-IP', '203.0.113.9');

  const method = options.method ?? 'POST';
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));

  return new Request(`https://api.wordping.test${path}`.replace('api.wordping.test', options.host ?? 'api.wordping.test'), {
    method,
    headers,
    ...(body !== undefined && method !== 'GET' ? { body } : {}),
  });
}

/** A minimal but structurally valid RevenueCat subscriber payload. */
export function revenueCatSubscriber(entitlements: Record<string, string | null>): Response {
  return new Response(
    JSON.stringify({
      subscriber: {
        entitlements: Object.fromEntries(
          Object.entries(entitlements).map(([id, expires]) => [id, { expires_date: expires }]),
        ),
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

export const FUTURE_DATE = new Date(Date.now() + 86_400_000).toISOString();
export const PAST_DATE = new Date(Date.now() - 86_400_000).toISOString();

export interface FetchCall {
  url: string;
  init: RequestInit;
}

/**
 * Replaces global fetch with a router keyed on URL substring. Every call is
 * recorded so tests can assert what was (and was not) sent upstream.
 */
export function mockFetch(routes: { match: string; respond: () => Response | Promise<Response> }[]): {
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const route = routes.find(candidate => url.includes(candidate.match));
    if (!route) throw new Error(`unexpected fetch to ${url}`);
    return route.respond();
  });
  return { calls };
}

export function wavBody(durationMs = 10): Response {
  const sampleRate = 8_000;
  const samples = Math.ceil(sampleRate * durationMs / 1_000);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) bytes[offset + i] = value.charCodeAt(i);
  };
  ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true);
  ascii(8, 'WAVE'); ascii(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, samples * 2, true);
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(bytes.byteLength) },
  });
}

export function chatCompletion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
