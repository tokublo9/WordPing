import { VOICE_LIFETIME_CREDITS } from './planLimits';

export interface VoiceCreditBalance {
  tier: 'basic' | 'premium';
  /** Basic's one-time grant; null means Premium is unmetered. */
  grant: number | null;
  /** Successfully unspent Basic credits; null for Premium. */
  remaining: number | null;
  /** Credits not currently held by in-flight reservations; null for Premium. */
  available: number | null;
}

type Listener = (balance: VoiceCreditBalance | null) => void;

let current: VoiceCreditBalance | null = null;
const listeners = new Set<Listener>();

export function getVoiceCreditBalance(): VoiceCreditBalance | null {
  return current;
}

export function publishVoiceCreditBalance(balance: VoiceCreditBalance | null): void {
  // Two bounded workers can commit in order but finish downloading their
  // responses in the opposite order. A lifetime balance never increases, so
  // an older success header must not overwrite a newer, lower count.
  if (current?.tier === 'basic' && balance?.tier === 'basic') {
    const remaining = Math.min(current.remaining ?? balance.remaining ?? 0, balance.remaining ?? 0);
    current = {
      ...balance,
      remaining,
      available: Math.min(balance.available ?? remaining, remaining),
    };
  } else {
    current = balance;
  }
  for (const listener of [...listeners]) listener(current);
}

export function parseVoiceCreditBalance(value: unknown): VoiceCreditBalance | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (item.tier === 'premium'
    && item.grant === null && item.remaining === null && item.available === null) {
    return { tier: 'premium', grant: null, remaining: null, available: null };
  }
  if (item.tier !== 'basic') return null;
  const { grant, remaining, available } = item;
  if (![grant, remaining, available].every(number => (
    typeof number === 'number' && Number.isInteger(number) && number >= 0
  ))) return null;
  return {
    tier: 'basic',
    grant: grant as number,
    remaining: remaining as number,
    available: available as number,
  };
}

export function publishVoiceCreditHeaders(headers: Headers): void {
  const rawRemaining = headers.get('X-WordPing-Voice-Credits-Remaining');
  const rawAvailable = headers.get('X-WordPing-Voice-Credits-Available');
  if (rawRemaining === null || rawAvailable === null) return;
  const remaining = Number(rawRemaining);
  const available = Number(rawAvailable);
  if (!Number.isInteger(remaining) || remaining < 0
    || !Number.isInteger(available) || available < 0) return;
  publishVoiceCreditBalance({
    tier: 'basic',
    grant: VOICE_LIFETIME_CREDITS.basic ?? 0,
    remaining,
    available,
  });
}

export function subscribeToVoiceCreditBalance(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A Basic queue may start only while the authoritative snapshot has room. */
export function canStartAutomaticVoiceGeneration(): boolean {
  // Outstanding reservations can temporarily make `available` zero while a
  // worker is still completing one of the remaining credits. The Durable
  // Object serializes that edge; only a truly spent balance stops the queue.
  return current?.tier !== 'basic' || current.remaining === null || current.remaining > 0;
}
