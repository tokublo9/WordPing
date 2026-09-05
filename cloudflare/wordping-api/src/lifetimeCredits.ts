import type { Env } from './env';
import { log, redactError } from './log';
import { VOICE_LIFETIME_CREDITS } from './planLimits';

/**
 * The one-time High-Quality AI Voice grant that comes with Basic.
 *
 * Deliberately NOT the monthly quota in monthlyQuota.ts, and deliberately not
 * expressed with `monthKey` or `monthResetsAt`. This balance is granted once and
 * never refills: not at a month boundary, not on renewal, not on cancellation
 * and resubscription, not on restore, reinstall, or a new device.
 *
 * WHAT MAKES THAT HOLD is where it is stored. The ledger is a Durable Object
 * named from the salted hash of RevenueCat's canonical original App User ID —
 * not the current device alias. The verified subscriber record resolves every
 * restore/alias to that identity, so local data is irrelevant: wiping the app
 * cannot hand out a second grant. There is no TTL on the stored value, so it
 * also cannot expire.
 *
 * WHY A DURABLE OBJECT rather than KV, which every other counter here uses: KV
 * has no atomic read-modify-write, and monthlyQuota.ts accepts a small overshoot
 * because its counter resets every month and the per-minute limiter bounds how
 * far it can drift. Neither is true here. An overshoot on a balance that never
 * resets is permanent, and a lost update on the grant itself would issue 200
 * credits twice.
 *
 * ── The reservation lifecycle ────────────────────────────────────────────────
 *
 * A credit is not simply decremented after a generation succeeds. Doing that
 * would let N simultaneous requests all observe the same remaining balance and
 * all proceed, generating past zero — the exact failure a lifetime balance
 * cannot absorb. Instead:
 *
 *   reserve  — atomically claims one credit *before* OpenAI is called. Refused
 *              when nothing is available, so nothing is generated.
 *   commit   — the generation succeeded; the reservation becomes a spend.
 *   release  — the generation failed or was cancelled; the claim is returned
 *              and no credit is spent.
 *
 * Availability is `remaining - outstanding reservations`, so a request in
 * flight already holds its credit and a concurrent one cannot claim it too.
 *
 * ABANDONED RESERVATIONS. A Worker that dies mid-generation never commits or
 * releases. Reservations therefore expire: any older than
 * RESERVATION_TTL_MS is dropped at the start of every operation, which returns
 * the credit. The TTL is comfortably longer than the speech timeout, so it can
 * never expire a generation that is still legitimately running.
 *
 * IDEMPOTENCY. Every operation is keyed by a caller-supplied key derived from
 * the request's own content, so a retry or a duplicate of the same request
 * reserves and commits the *same* claim rather than a second one. Recent
 * commits are remembered briefly for the same reason: a retry arriving after a
 * commit must not be charged twice. That memory is short — long enough to cover
 * a retry, short enough that genuinely regenerating the same word later is
 * charged again.
 */

export const BASIC_LIFETIME_VOICE_CREDITS = VOICE_LIFETIME_CREDITS.basic ?? 0;

/**
 * How long a claim survives without a commit or release.
 *
 * Longer than OPENAI_SPEECH_TIMEOUT_MS (50s default) with room to spare, so an
 * in-flight generation is never robbed of the credit it is holding.
 */
export const RESERVATION_TTL_MS = 3 * 60_000;

/**
 * How long a commit is remembered for retry de-duplication.
 *
 * Covers a client retry of the same request. Not a permanent record: the same
 * word generated again next week is a new generation and is charged.
 */
export const COMMIT_DEDUP_TTL_MS = 10 * 60_000;

/** Features that spend the lifetime balance. Previews and promos never do. */
export const LIFETIME_CREDIT_FEATURES = ['voice_card'] as const;

export function isLifetimeCreditFeature(feature: string): boolean {
  return (LIFETIME_CREDIT_FEATURES as readonly string[]).includes(feature);
}

export interface LedgerState {
  /** True once the one-time grant has been issued. Never returns to false. */
  granted: boolean;
  /** Credits not yet spent. Reservations are held against this, not deducted. */
  remaining: number;
  /** Idempotency key → reservedAt. Claims awaiting commit or release. */
  reservations: Record<string, number>;
  /** Idempotency key → committedAt. Short-lived retry de-duplication. */
  recentCommits: Record<string, number>;
}

export interface ReserveResult {
  ok: boolean;
  /** Unspent credits, reservations not deducted. */
  remaining: number;
  /** Available to claim right now: remaining minus outstanding reservations. */
  available: number;
  /** The key already held a claim or a recent commit; nothing new was taken. */
  duplicate: boolean;
}

export type LedgerOp = 'reserve' | 'commit' | 'release' | 'peek';

const BALANCE_KEY = 'balance';

function pruned(state: LedgerState, now: number): LedgerState {
  const reservations: Record<string, number> = {};
  for (const [key, at] of Object.entries(state.reservations)) {
    // An abandoned claim returns its credit. This is the only recovery path a
    // Worker that died mid-generation ever gets.
    if (now - at < RESERVATION_TTL_MS) reservations[key] = at;
  }
  const recentCommits: Record<string, number> = {};
  for (const [key, at] of Object.entries(state.recentCommits)) {
    if (now - at < COMMIT_DEDUP_TTL_MS) recentCommits[key] = at;
  }
  return { ...state, reservations, recentCommits };
}

function initialState(): LedgerState {
  // First sight of this subscriber is the grant. An existing Basic user who
  // predates the benefit receives it the first time they generate, and
  // `granted` makes that unrepeatable.
  return {
    granted: true,
    remaining: BASIC_LIFETIME_VOICE_CREDITS,
    reservations: {},
    recentCommits: {},
  };
}

/**
 * The ledger's whole decision table, as a pure function.
 *
 * Separated from the Durable Object so every rule below is testable without a
 * runtime, and so the object itself is only responsible for serialising access
 * to it and persisting the result.
 */
export function applyLedgerOp(
  state: LedgerState,
  op: LedgerOp,
  key: string,
  now: number,
): { next: LedgerState; result: ReserveResult } {
  const current = pruned(state, now);
  const outstanding = Object.keys(current.reservations).length;
  const available = current.remaining - outstanding;
  const describe = (next: LedgerState, ok: boolean, duplicate = false): {
    next: LedgerState; result: ReserveResult;
  } => ({
    next,
    result: {
      ok,
      remaining: next.remaining,
      available: next.remaining - Object.keys(next.reservations).length,
      duplicate,
    },
  });

  if (op === 'peek') return describe(current, available > 0);

  if (op === 'reserve') {
    // Already charged, or already holding a claim: the same request arriving
    // twice must not take a second credit. Allowed to proceed either way.
    if (current.recentCommits[key] !== undefined) return describe(current, true, true);
    if (current.reservations[key] !== undefined) return describe(current, true, true);
    if (available <= 0) return describe(current, false);
    return describe(
      { ...current, reservations: { ...current.reservations, [key]: now } },
      true,
    );
  }

  if (op === 'release') {
    if (current.reservations[key] === undefined) return describe(current, true, true);
    const reservations = { ...current.reservations };
    delete reservations[key];
    // No decrement: a failed generation costs nothing.
    return describe({ ...current, reservations }, true);
  }

  // commit
  if (current.recentCommits[key] !== undefined) {
    // A retry of an already-committed request. Idempotent, never double-charged.
    return describe(current, true, true);
  }
  const reservations = { ...current.reservations };
  const held = reservations[key] !== undefined;
  delete reservations[key];
  // Charged even when the claim had expired: the audio was generated and
  // delivered, so letting an expired reservation mean "free" would make a slow
  // generation the cheapest way to get one.
  const remaining = Math.max(0, current.remaining - 1);
  return describe({
    ...current,
    remaining,
    reservations,
    recentCommits: { ...current.recentCommits, [key]: now },
  }, true, !held);
}

/**
 * One instance per subscriber identity.
 *
 * Cloudflare routes every request for a given name to the same object, and
 * `blockConcurrencyWhile` guarantees no other event is delivered while the
 * read-modify-write below is in flight. That is what makes two simultaneous
 * reservations impossible to interleave.
 */
export class VoiceCreditLedger {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const op = url.pathname.slice(1) as LedgerOp;
    const key = url.searchParams.get('key') ?? '';

    if (op !== 'reserve' && op !== 'commit' && op !== 'release' && op !== 'peek') {
      return new Response('unknown op', { status: 400 });
    }

    const result = await this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<LedgerState>(BALANCE_KEY);
      const before = stored ?? initialState();
      const { next, result: applied } = applyLedgerOp(before, op, key, Date.now());
      // Written on every op that changed anything, including the initial grant.
      if (stored === undefined || JSON.stringify(next) !== JSON.stringify(before)) {
        await this.state.storage.put(BALANCE_KEY, next);
      }
      return applied;
    });

    return Response.json(result);
  }
}

async function call(
  env: Env,
  hashedAppUserId: string,
  op: LedgerOp,
  key: string,
): Promise<ReserveResult | null> {
  const id = env.VOICE_CREDITS.idFromName(hashedAppUserId);
  const response = await env.VOICE_CREDITS.get(id).fetch(
    `https://ledger/${op}?key=${encodeURIComponent(key)}`,
    { method: 'POST' },
  );
  if (!response.ok) return null;
  return (await response.json()) as ReserveResult;
}

/**
 * Claim one credit before generating.
 *
 * Returns null when the ledger could not be reached. The caller fails closed —
 * see `pipeline.ts`. Never returns a claim it did not actually take.
 */
export async function reserveVoiceCredit(
  env: Env,
  hashedAppUserId: string,
  idempotencyKey: string,
  requestId: string,
): Promise<ReserveResult | null> {
  try {
    const result = await call(env, hashedAppUserId, 'reserve', idempotencyKey);
    if (result !== null) {
      log('info', 'voice_credit_reserved', requestId, {
        ok: result.ok, available: result.available, duplicate: result.duplicate,
      });
    }
    return result;
  } catch (error: unknown) {
    log('error', 'voice_credit_reserve_failed', requestId, redactError(error));
    return null;
  }
}

/**
 * Turn a claim into a spend, after the generation succeeded.
 *
 * A failure here is logged loudly and reported to the caller rather than
 * swallowed: an uncommitted claim expires and returns the credit, which would
 * mean a generation that was delivered but never charged.
 */
export async function commitVoiceCredit(
  env: Env,
  hashedAppUserId: string,
  idempotencyKey: string,
  requestId: string,
): Promise<ReserveResult | null> {
  try {
    const result = await call(env, hashedAppUserId, 'commit', idempotencyKey);
    if (result === null || !result.ok) {
      log('error', 'voice_credit_commit_failed', requestId, { reason: 'ledger_error' });
      return null;
    }
    log('info', 'voice_credit_committed', requestId, { remaining: result.remaining });
    return result;
  } catch (error: unknown) {
    log('error', 'voice_credit_commit_failed', requestId, redactError(error));
    return null;
  }
}

/** Read or initialize Basic's lifetime balance without reserving a credit. */
export async function peekVoiceCreditBalance(
  env: Env,
  hashedAppUserId: string,
  requestId: string,
): Promise<ReserveResult | null> {
  try {
    const result = await call(env, hashedAppUserId, 'peek', '');
    if (result !== null) {
      log('info', 'voice_credit_balance_read', requestId, {
        remaining: result.remaining,
        available: result.available,
      });
    }
    return result;
  } catch (error: unknown) {
    log('error', 'voice_credit_balance_read_failed', requestId, redactError(error));
    return null;
  }
}

/**
 * Return a claim without spending it, after a failed or cancelled generation.
 *
 * Best effort: a dropped release costs the user nothing permanently, because
 * the reservation expires on its own within RESERVATION_TTL_MS.
 */
export async function releaseVoiceCredit(
  env: Env,
  hashedAppUserId: string,
  idempotencyKey: string,
  requestId: string,
): Promise<void> {
  try {
    await call(env, hashedAppUserId, 'release', idempotencyKey);
    log('info', 'voice_credit_released', requestId, {});
  } catch (error: unknown) {
    log('warn', 'voice_credit_release_failed', requestId, redactError(error));
  }
}
