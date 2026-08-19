import { vi } from 'vitest';
import type { Env } from '../src/env';
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

export function makeEnv(overrides: Partial<Env> = {}): Env & { WORDPING_KV: FakeKV } {
  const kv = new FakeKV();
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
  } as unknown as Env & { WORDPING_KV: FakeKV };
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

export function wavBody(): Response {
  const bytes = new Uint8Array(64).fill(1);
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
