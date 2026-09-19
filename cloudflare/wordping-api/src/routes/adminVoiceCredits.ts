import { EntitlementServiceError, forceRefreshEntitlement } from '../entitlements';
import { errorResponse, jsonResponse } from '../http';
import { resetVoiceCreditLedger } from '../lifetimeCredits';
import { log } from '../log';
import type { GuardContext } from '../pipeline';
import { adminVoiceCreditsResetSchema } from '../schemas';

async function sameSecret(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

/**
 * Tester-only reset for Basic's ledger.
 *
 * `deviceId` is the RevenueCat App User ID reported by the target device. The
 * endpoint resolves its canonical RevenueCat subscriber before selecting the
 * Durable Object, so an alias cannot reset a different or duplicate ledger.
 */
export async function handleAdminVoiceCreditsReset(context: GuardContext): Promise<Response> {
  const { request, env, resolved, response } = context;
  if (env.ENABLE_ADMIN_LEDGER_RESET !== '1' || !env.ADMIN_RESET_SECRET?.trim()) {
    return errorResponse(response, 'not_found', 404);
  }
  if (request.method !== 'POST') {
    return errorResponse(response, 'method_not_allowed', 405, {}, { Allow: 'POST, OPTIONS' });
  }
  const prefix = 'Bearer ';
  const authorization = request.headers.get('Authorization') ?? '';
  const supplied = authorization.startsWith(prefix) ? authorization.slice(prefix.length) : '';
  if (!await sameSecret(supplied, env.ADMIN_RESET_SECRET.trim())) {
    return errorResponse(response, 'unauthorized', 401);
  }
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return errorResponse(response, 'unsupported_media_type', 415);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return errorResponse(response, 'invalid_request', 400);
  }
  const parsed = adminVoiceCreditsResetSchema.safeParse(input);
  if (!parsed.success) return errorResponse(response, 'invalid_request', 400);

  let ledgerId: string;
  try {
    const entitlement = await forceRefreshEntitlement(
      env, resolved, parsed.data.deviceId, response.requestId,
    );
    ledgerId = entitlement.voiceCreditLedgerId;
  } catch (error) {
    if (error instanceof EntitlementServiceError) {
      return errorResponse(response, 'entitlement_verification_failed', 503,
        { reason: error.reason }, { 'Retry-After': '30' });
    }
    throw error;
  }

  if (!await resetVoiceCreditLedger(env, ledgerId)) {
    return errorResponse(response, 'entitlement_verification_failed', 503,
      { reason: 'credit_ledger' }, { 'Retry-After': '30' });
  }
  log('warn', 'admin_voice_credit_ledger_reset', response.requestId, {});
  return jsonResponse(response, { ok: true });
}
