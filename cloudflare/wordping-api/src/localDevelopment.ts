import type { Env } from './env';
import { privacyHash } from './identity';
import { monthlyQuotaCounterKey } from './monthlyQuota';
import { monthlyCounterTtlSeconds } from './planLimits';

export const BASIC_MONTHLY_LIMIT_SCENARIO = 'basic_monthly_limit' as const;
export type LocalAiVoiceTestScenario = typeof BASIC_MONTHLY_LIMIT_SCENARIO;

const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
]);

export function isLocalWorkerRequest(request: Request): boolean {
  return LOCAL_HOSTS.has(new URL(request.url).hostname.toLowerCase());
}

/**
 * Returns a test scenario only when both the local-only variable and a
 * loopback Worker URL agree. A deployed Worker therefore ignores the value
 * even if somebody accidentally configures it there.
 */
export function resolveLocalAiVoiceTestScenario(
  request: Request,
  env: Env,
): LocalAiVoiceTestScenario | null {
  if (!isLocalWorkerRequest(request)) return null;
  return env.LOCAL_AI_VOICE_TEST_SCENARIO === BASIC_MONTHLY_LIMIT_SCENARIO
    ? BASIC_MONTHLY_LIMIT_SCENARIO
    : null;
}

/** Seeds the real monthly counter shape in the Worker's local KV namespace. */
export async function seedLocalBasicMonthlyLimit(
  env: Env,
  hashedAppUserId: string,
  now: number = Date.now(),
): Promise<string> {
  const key = monthlyQuotaCounterKey(now, hashedAppUserId);
  await env.WORDPING_KV.put(key, '200', {
    expirationTtl: monthlyCounterTtlSeconds(now),
  });
  return key;
}

/** A fixed identity helper used only by tests and local diagnostics. */
export async function localScenarioQuotaKey(
  env: Env,
  appUserId: string,
  now: number = Date.now(),
): Promise<string> {
  return monthlyQuotaCounterKey(now, await privacyHash(env, 'rcuser', appUserId));
}
