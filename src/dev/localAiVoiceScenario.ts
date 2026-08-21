export const BASIC_MONTHLY_LIMIT_SCENARIO = 'basic_monthly_limit' as const;
export type LocalAiVoiceTestScenario = typeof BASIC_MONTHLY_LIMIT_SCENARIO;

export const LOCAL_AI_VOICE_APP_USER_ID = '$RCAnonymousID:wordping-local-basic-limit';

const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
]);

let scenarioRequest: Promise<LocalAiVoiceTestScenario | null> | null = null;
let activeScenario: LocalAiVoiceTestScenario | null = null;

function localWorkerBaseUrl(): string | null {
  if (!__DEV__) return null;
  const raw = process.env.EXPO_PUBLIC_WORDPING_API_BASE_URL ?? '';
  try {
    const url = new URL(raw);
    return LOCAL_HOSTS.has(url.hostname.toLowerCase()) ? url.origin : null;
  } catch {
    return null;
  }
}

async function probeLocalWorker(baseUrl: string): Promise<LocalAiVoiceTestScenario | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${baseUrl}/v1/health`, { signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    const safeLocalWorker = body.localAiVoiceTestScenario === BASIC_MONTHLY_LIMIT_SCENARIO
      && body.entitlement === 'mock-basic'
      && body.upstreamsMocked === true
      && body.storage === 'isolated-local-kv';
    return safeLocalWorker ? BASIC_MONTHLY_LIMIT_SCENARIO : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detects the loopback Worker's local test contract. Production builds return
 * before reading the URL, and a non-loopback API can never activate the mock.
 */
export function getLocalAiVoiceTestScenario(): Promise<LocalAiVoiceTestScenario | null> {
  const baseUrl = localWorkerBaseUrl();
  if (!baseUrl) return Promise.resolve(null);
  scenarioRequest ??= probeLocalWorker(baseUrl).then(scenario => {
    activeScenario = scenario;
    return scenario;
  });
  return scenarioRequest;
}

/** Synchronous read for cache/preload code after subscription detection. */
export function isBasicMonthlyLimitScenarioActive(): boolean {
  return __DEV__ && activeScenario === BASIC_MONTHLY_LIMIT_SCENARIO;
}
