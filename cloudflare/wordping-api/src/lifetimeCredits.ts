import type { Env } from './env';
import { DEFAULT_LIMITS } from './config';
import { log, redactError } from './log';
import { VOICE_LIFETIME_CREDITS } from './planLimits';
import { applyAudioDuration, applyVoiceQuota, describePremiumVoiceUsage, type VoiceQuotaState } from './monthlyQuota';

/**
 * Basic's lifetime AI voice allowance is 10 distinct card fronts. The card
 * ledger stores salted card hashes under the verified subscriber's canonical
 * identity, so edits, retries, renewal and reinstall do not allocate a new
 * slot. A legacy request ledger remains for older app versions that omit cardId.
 *
 * A Durable Object serializes reserve/commit/release. A card's slot is reserved
 * before OpenAI is called and granted only after success. Failed generations
 * release the reservation; abandoned reservations expire after the speech
 * timeout. This prevents concurrent requests from granting more than 10 cards.
 */

export const BASIC_LIFETIME_VOICE_CREDITS = VOICE_LIFETIME_CREDITS.basic ?? 0;

/**
 * How long a claim survives without a commit or release.
 *
 * Longer than OPENAI_SPEECH_TIMEOUT_MS (50s default) with room to spare, so an
 * in-flight generation is never robbed of the credit it is holding.
 */
export const RESERVATION_TTL_MS = 3 * 60_000;

/** Legacy request ledger retry window; card grants are stored permanently. */
export const COMMIT_DEDUP_TTL_MS = 10 * 60_000;

/** Features that spend the lifetime balance. Previews and promos never do. */
export const LIFETIME_CREDIT_FEATURES = ['voice_card'] as const;

export function isLifetimeCreditFeature(feature: string): boolean {
  return (LIFETIME_CREDIT_FEATURES as readonly string[]).includes(feature);
}

export interface LedgerState {
  /** True once the one-time grant has been issued. Never returns to false. */
  granted: boolean;
  /** Missing on ledgers created when the Basic grant was 200. */
  grantSize?: number;
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
const CARD_BALANCE_KEY = 'card_balance_v2';
const PREMIUM_VOICE_QUOTA_KEY = 'premium_voice_quota_v1';

export interface CardBalanceState {
  /** Hashed card identities are kept for the lifetime of the subscription. */
  grantedCards: Record<string, true>;
  reservations: Record<string, { cardKey: string; at: number }>;
}

export function applyCardOp(
  before: CardBalanceState,
  op: 'cardReserve' | 'cardCommit' | 'cardRelease' | 'cardPeek',
  requestKey: string,
  cardKey: string,
  now: number,
): { next: CardBalanceState; result: ReserveResult } {
  const reservations = Object.fromEntries(
    Object.entries(before.reservations).filter(([, claim]) => now - claim.at < RESERVATION_TTL_MS),
  );
  const current = { grantedCards: before.grantedCards, reservations };
  const remaining = Math.max(0, BASIC_LIFETIME_VOICE_CREDITS - Object.keys(current.grantedCards).length);
  const pending = new Set(Object.values(reservations)
    .filter(claim => !current.grantedCards[claim.cardKey])
    .map(claim => claim.cardKey));
  const describe = (next: CardBalanceState, ok: boolean, duplicate = false) => ({
    next,
    result: {
      ok,
      remaining: Math.max(0, BASIC_LIFETIME_VOICE_CREDITS - Object.keys(next.grantedCards).length),
      available: Math.max(0, BASIC_LIFETIME_VOICE_CREDITS - Object.keys(next.grantedCards).length
        - new Set(Object.values(next.reservations)
          .filter(claim => !next.grantedCards[claim.cardKey])
          .map(claim => claim.cardKey)).size),
      duplicate,
    },
  });
  if (op === 'cardPeek') return describe(current, remaining > 0);
  if (op === 'cardReserve') {
    if (current.grantedCards[cardKey]) return describe(current, true, true);
    if (current.reservations[requestKey]) return describe(current, true, true);
    if (remaining - pending.size <= 0 && !pending.has(cardKey)) return describe(current, false);
    return describe({ ...current, reservations: {
      ...reservations, [requestKey]: { cardKey, at: now },
    } }, true, pending.has(cardKey));
  }
  if (op === 'cardRelease') {
    delete reservations[requestKey];
    return describe(current, true);
  }
  if (current.grantedCards[cardKey]) return describe(current, true, true);
  if (!reservations[requestKey] || remaining <= 0) return describe(current, false);
  const grantedCards = { ...current.grantedCards, [cardKey]: true as const };
  for (const [key, claim] of Object.entries(reservations)) {
    if (claim.cardKey === cardKey) delete reservations[key];
  }
  return describe({ grantedCards, reservations }, true);
}

function pruned(state: LedgerState, now: number): LedgerState {
  const previousGrant = state.grantSize ?? 200;
  const spent = Math.max(0, previousGrant - state.remaining);
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
  return {
    ...state,
    grantSize: BASIC_LIFETIME_VOICE_CREDITS,
    remaining: Math.max(0, BASIC_LIFETIME_VOICE_CREDITS - spent),
    reservations,
    recentCommits,
  };
}

function initialState(): LedgerState {
  // First sight of this subscriber is the grant. An existing Basic user who
  // predates the benefit receives it the first time they generate, and
  // `granted` makes that unrepeatable.
  return {
    granted: true,
    grantSize: BASIC_LIFETIME_VOICE_CREDITS,
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
    const op = url.pathname.slice(1);
    const key = url.searchParams.get('key') ?? '';
    if (op === 'adminReset') {
      await this.state.blockConcurrencyWhile(async () => {
        await this.state.storage.delete(CARD_BALANCE_KEY);
        await this.state.storage.delete(BALANCE_KEY);
      });
      return Response.json({ ok: true });
    }
    if (op === 'quotaStatus') {
      const dayLimit = Number(url.searchParams.get('day'));
      if (!Number.isInteger(dayLimit) || dayLimit < 0
        || dayLimit > DEFAULT_LIMITS.voice_card.premium.maxRequestsPerDay) {
        return new Response('invalid day limit', { status: 400 });
      }
      const usage = await this.state.blockConcurrencyWhile(async () => {
        const before = await this.state.storage.get<VoiceQuotaState>(PREMIUM_VOICE_QUOTA_KEY);
        return describePremiumVoiceUsage(before, Date.now(), dayLimit);
      });
      return Response.json(usage);
    }
    if (op === 'quotaReserve' || op === 'quotaPeek') {
      const characters = Number(url.searchParams.get('characters') ?? '0');
      const override = {
        maxRequestsPerMinute: Number(url.searchParams.get('minute')),
        maxRequestsPerDay: Number(url.searchParams.get('day')),
        maxCharsPerDay: Number(url.searchParams.get('chars')),
      };
      if (!Number.isInteger(characters) || characters < 0 || characters > 500
        || Object.values(override).some(value => !Number.isInteger(value) || value < 0)) {
        return new Response('invalid characters', { status: 400 });
      }
      const decision = await this.state.blockConcurrencyWhile(async () => {
        const before = await this.state.storage.get<VoiceQuotaState>(PREMIUM_VOICE_QUOTA_KEY);
        const applied = applyVoiceQuota(before, Date.now(), characters, op === 'quotaReserve', override);
        if (op === 'quotaReserve' && applied.decision.allowed) {
          await this.state.storage.put(PREMIUM_VOICE_QUOTA_KEY, applied.next);
        }
        return applied.decision;
      });
      return Response.json(decision);
    }
    if (op === 'quotaAudioCommit' || op === 'quotaAudioPeek') {
      const durationMs = op === 'quotaAudioPeek' ? 0 : Number(url.searchParams.get('durationMs'));
      const tier = url.searchParams.get('tier');
      if ((tier !== 'basic' && tier !== 'premium') || !Number.isInteger(durationMs)
        || durationMs < (op === 'quotaAudioPeek' ? 0 : 1) || durationMs > 10 * 60_000) {
        return new Response('invalid duration', { status: 400 });
      }
      const decision = await this.state.blockConcurrencyWhile(async () => {
        const before = await this.state.storage.get<VoiceQuotaState>(PREMIUM_VOICE_QUOTA_KEY);
        const applied = applyAudioDuration(before, Date.now(), durationMs, tier);
        if (op === 'quotaAudioCommit') await this.state.storage.put(PREMIUM_VOICE_QUOTA_KEY, applied.next);
        return applied.decision;
      });
      return Response.json(decision);
    }
    if (op === 'cardReserve' || op === 'cardCommit' || op === 'cardRelease' || op === 'cardPeek') {
      const cardKey = url.searchParams.get('card') ?? '';
      if (op !== 'cardPeek' && (!key || !cardKey)) return new Response('missing card key', { status: 400 });
      const result = await this.state.blockConcurrencyWhile(async () => {
        const stored = await this.state.storage.get<CardBalanceState>(CARD_BALANCE_KEY);
        const before = stored ?? { grantedCards: {}, reservations: {} };
        const applied = applyCardOp(before, op, key, cardKey, Date.now());
        if (!stored || JSON.stringify(applied.next) !== JSON.stringify(before)) {
          await this.state.storage.put(CARD_BALANCE_KEY, applied.next);
        }
        return applied.result;
      });
      return Response.json(result);
    }

    if (op !== 'reserve' && op !== 'commit' && op !== 'release' && op !== 'peek') {
      return new Response('unknown op', { status: 400 });
    }

    const result = await this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<LedgerState>(BALANCE_KEY);
      const before = stored ?? initialState();
      const { next, result: applied } = applyLedgerOp(before, op as LedgerOp, key, Date.now());
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
  op: LedgerOp | 'cardReserve' | 'cardCommit' | 'cardRelease' | 'cardPeek',
  key: string,
  cardKey?: string,
): Promise<ReserveResult | null> {
  const id = env.VOICE_CREDITS.idFromName(hashedAppUserId);
  const response = await env.VOICE_CREDITS.get(id).fetch(
    `https://ledger/${op}?key=${encodeURIComponent(key)}${cardKey ? `&card=${encodeURIComponent(cardKey)}` : ''}`,
    { method: 'POST' },
  );
  if (!response.ok) return null;
  return (await response.json()) as ReserveResult;
}

export async function reserveCardVoice(
  env: Env, subscriberId: string, requestKey: string, cardKey: string,
): Promise<ReserveResult | null> {
  try { return await call(env, subscriberId, 'cardReserve', requestKey, cardKey); }
  catch { return null; }
}

export async function commitCardVoice(
  env: Env, subscriberId: string, requestKey: string, cardKey: string,
): Promise<ReserveResult | null> {
  try { return await call(env, subscriberId, 'cardCommit', requestKey, cardKey); }
  catch { return null; }
}

export async function releaseCardVoice(
  env: Env, subscriberId: string, requestKey: string, cardKey: string,
): Promise<void> {
  try { await call(env, subscriberId, 'cardRelease', requestKey, cardKey); }
  catch { /* Reservation expires; a failed request never spends a card. */ }
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
  mode: 'cards' | 'legacy' = 'legacy',
): Promise<ReserveResult | null> {
  try {
    const result = await call(env, hashedAppUserId, mode === 'cards' ? 'cardPeek' : 'peek', '');
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

/** Removes Basic's card and legacy balances for an authenticated tester reset. */
export async function resetVoiceCreditLedger(
  env: Env,
  hashedAppUserId: string,
): Promise<boolean> {
  try {
    const id = env.VOICE_CREDITS.idFromName(hashedAppUserId);
    const response = await env.VOICE_CREDITS.get(id).fetch(
      'https://ledger/adminReset',
      { method: 'POST' },
    );
    return response.ok;
  } catch {
    return false;
  }
}
