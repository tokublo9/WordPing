import type { Env } from './env';

/**
 * The local AI-voice harness.
 *
 * Mocks the entitlement as Premium — the tier that owns High-Quality AI Voice —
 * and mocks every upstream, so the whole voice path can be driven on a loopback
 * Worker with no RevenueCat secret, no OpenAI key and no spend.
 *
 * It used to seed the Basic monthly counter to 200 so the exhaustion response
 * could be exercised by hand. That seeding is gone: AI Voice is Premium and
 * Premium is sold as included, so no tier is metered and there is no exhaustion
 * response to reach. The quota machinery in monthlyQuota.ts is kept for the
 * plan that may want it again.
 */
export const LOCAL_AI_VOICE_SCENARIO = 'local_ai_voice' as const;
export type LocalAiVoiceTestScenario = typeof LOCAL_AI_VOICE_SCENARIO;

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
  return env.LOCAL_AI_VOICE_TEST_SCENARIO === LOCAL_AI_VOICE_SCENARIO
    ? LOCAL_AI_VOICE_SCENARIO
    : null;
}
