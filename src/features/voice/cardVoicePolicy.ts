import type { PlanTier } from '../../lib/planLimits';
import type { AIErrorKind } from '../../lib/api/errors';
import { BASIC_VOICE_CARD_LIMIT } from '../../dev/basicVoiceCardLimit';

let plan: PlanTier = 'free';
let basicCards = new Set<string>();
let premiumBackVoice = false;

/** Basic keeps the first selected card IDs even after list reordering or deletion. */
export function allocateBasicVoiceCards(
  cards: readonly { id: string; folderId?: string }[],
  previous: readonly string[],
  limit = BASIC_VOICE_CARD_LIMIT,
  folderIds: readonly string[] = [],
): string[] {
  const selected = new Set(previous.slice(0, limit));
  const folderPosition = new Map(folderIds.map((id, index) => [id, index]));
  const ordered = cards.map((card, index) => ({ card, index }))
    .sort((a, b) => (folderPosition.get(a.card.folderId ?? '') ?? folderIds.length)
      - (folderPosition.get(b.card.folderId ?? '') ?? folderIds.length)
      || a.index - b.index);
  for (const { card } of ordered) {
    if (selected.size >= limit) break;
    selected.add(card.id);
  }
  return [...selected];
}

export function setCardVoicePolicy(value: {
  plan: PlanTier;
  basicCardIds: readonly string[];
  premiumBackVoice: boolean;
}): void {
  plan = value.plan;
  basicCards = new Set(value.basicCardIds);
  premiumBackVoice = value.premiumBackVoice;
}

export function mayUseAIVoiceForCard(cardId: string | undefined, side: 'word' | 'meaning'): boolean {
  if (plan === 'premium') return side === 'word' || premiumBackVoice;
  return plan === 'basic' && side === 'word' && Boolean(cardId && basicCards.has(cardId));
}

/** Basic's bounded card benefit does not show usage-limit alerts during playback. */
export function useDeviceVoiceAfterBasicLimit(tier: PlanTier, kind: AIErrorKind): boolean {
  return tier === 'basic' && (
    kind === 'voice_credits_exhausted'
    || kind === 'rate_limited'
    || kind === 'usage_limited'
    || kind === 'monthly_limit_reached'
  );
}
