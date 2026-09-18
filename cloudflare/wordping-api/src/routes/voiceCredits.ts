import { BASIC_LIFETIME_VOICE_CREDITS, peekVoiceCreditBalance } from '../lifetimeCredits';
import { readPremiumVoiceUsage } from '../monthlyQuota';
import { errorResponse, jsonResponse } from '../http';
import { guard, type GuardContext } from '../pipeline';
import { voiceCreditsSchema } from '../schemas';

/**
 * POST /v1/voice/credits
 *
 * Confirms the current RevenueCat entitlement with a fresh server-side lookup,
 * then reads Basic's one-time card credits or Premium's daily/monthly AI Voice
 * counters. No user text is accepted and no credit or quota is reserved.
 */
export async function handleVoiceCredits(context: GuardContext): Promise<Response> {
  const result = await guard(context, {
    feature: 'voice_credits',
    schema: voiceCreditsSchema,
    forceFreshEntitlement: true,
    billableText: () => '',
  });
  if (!result.ok) return result.response;

  if (result.value.tier === 'premium') {
    const ledgerId = result.value.voiceCreditLedgerId;
    if (ledgerId === null) return errorResponse(context.response, 'missing_install_id', 400);
    const usage = await readPremiumVoiceUsage(
      context.env,
      ledgerId,
      context.runtime.limitsFor('voice_card', 'premium').maxRequestsPerDay,
    );
    if (usage === null) {
      return errorResponse(context.response, 'entitlement_verification_failed', 503,
        { reason: 'voice_quota_ledger' }, { 'Retry-After': '30' });
    }
    return jsonResponse(context.response, {
      tier: 'premium',
      grant: null,
      remaining: null,
      available: null,
      usage,
    });
  }

  const ledgerId = result.value.voiceCreditLedgerId;
  if (ledgerId === null) {
    return errorResponse(context.response, 'missing_install_id', 400);
  }
  const balance = await peekVoiceCreditBalance(
    context.env,
    ledgerId,
    context.response.requestId,
    result.value.body.mode === 'cards' ? 'cards' : 'legacy',
  );
  if (balance === null) {
    return errorResponse(
      context.response,
      'entitlement_verification_failed',
      503,
      { reason: 'credit_ledger' },
      { 'Retry-After': '30' },
    );
  }

  return jsonResponse(context.response, {
    tier: 'basic',
    grant: BASIC_LIFETIME_VOICE_CREDITS,
    remaining: balance.remaining,
    available: balance.available,
  });
}
