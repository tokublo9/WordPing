/**
 * Release configuration checks.
 *
 * These are the mistakes that do not fail a build, do not fail a typecheck, and
 * do not fail a unit test — they only fail once the app is in a user's hands.
 * A placeholder RevenueCat key ships an app where nobody can subscribe; a
 * missing API base URL ships an app where every AI feature is dead.
 *
 * Pure functions over already-parsed config, so `scripts/releasePreflight.cjs`
 * can run them against real files and the test suite can run them against
 * fixtures. Nothing here reads the filesystem or the network.
 */

export type Severity = 'error' | 'warning';

export interface PreflightIssue {
  severity: Severity;
  where: string;
  message: string;
}

/** Values that mean "somebody still has to fill this in". */
const PLACEHOLDER_PATTERN = /REPLACE|YOUR[_-]|CHANGEME|TODO|EXAMPLE|xxx/i;

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value);
}

export interface EasProfileEnv {
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?: string;
  EXPO_PUBLIC_WORDPING_API_BASE_URL?: string;
  [key: string]: string | undefined;
}

export interface EasConfig {
  build?: Record<string, { env?: EasProfileEnv } | undefined>;
}

/** Secrets that must never appear in a client-visible variable. */
const FORBIDDEN_CLIENT_KEYS = [
  'OPENAI_API_KEY',
  'REVENUECAT_SECRET_API_KEY',
  'RATE_LIMIT_SALT',
  'SERVICE_ROLE',
];

export function checkEasProduction(eas: EasConfig): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const where = 'eas.json → build.production.env';
  const env = eas.build?.production?.env;

  if (!env) {
    issues.push({ severity: 'error', where, message: 'production build profile has no env block' });
    return issues;
  }

  const rcKey = env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!rcKey) {
    issues.push({ severity: 'error', where, message: 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is missing — nobody can subscribe or restore' });
  } else if (isPlaceholder(rcKey)) {
    issues.push({ severity: 'error', where, message: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is still a placeholder (${rcKey}) — purchases and entitlements will not work` });
  } else if (rcKey.startsWith('test_')) {
    issues.push({ severity: 'error', where, message: 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is a RevenueCat Test Store key — configureRevenueCat() refuses it in a non-dev build, disabling all purchases' });
  } else if (!rcKey.startsWith('appl_')) {
    issues.push({ severity: 'warning', where, message: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY does not look like an Apple key (${rcKey.slice(0, 5)}…)` });
  }

  const apiUrl = env.EXPO_PUBLIC_WORDPING_API_BASE_URL;
  if (!apiUrl) {
    issues.push({ severity: 'error', where, message: 'EXPO_PUBLIC_WORDPING_API_BASE_URL is missing — EAS does not upload .env, so every AI request would fail' });
  } else if (isPlaceholder(apiUrl)) {
    issues.push({ severity: 'error', where, message: `EXPO_PUBLIC_WORDPING_API_BASE_URL is still a placeholder (${apiUrl})` });
  } else if (!apiUrl.startsWith('https://')) {
    issues.push({ severity: 'error', where, message: `EXPO_PUBLIC_WORDPING_API_BASE_URL must be https in production (got ${apiUrl})` });
  } else if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(apiUrl)) {
    issues.push({ severity: 'error', where, message: `EXPO_PUBLIC_WORDPING_API_BASE_URL points at a local dev server (${apiUrl})` });
  }

  for (const [key, value] of Object.entries(env)) {
    if (FORBIDDEN_CLIENT_KEYS.some(secret => key.toUpperCase().includes(secret))) {
      issues.push({ severity: 'error', where, message: `${key} is a server-side secret and must never be a build-time client variable` });
      continue;
    }
    if (typeof value === 'string' && /^sk[-_]/.test(value)) {
      issues.push({ severity: 'error', where, message: `${key} holds what looks like a secret key` });
    }
  }

  return issues;
}

export interface AppConfig {
  expo?: {
    version?: string;
    ios?: { bundleIdentifier?: string; buildNumber?: string };
    android?: { package?: string; versionCode?: number };
  };
}

export function checkAppConfig(app: AppConfig): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const where = 'app.json';
  const expo = app.expo;

  if (!expo?.version) {
    issues.push({ severity: 'error', where, message: 'expo.version is missing' });
  }
  if (!expo?.ios?.bundleIdentifier) {
    issues.push({ severity: 'error', where, message: 'ios.bundleIdentifier is missing' });
  } else if (isPlaceholder(expo.ios.bundleIdentifier)) {
    issues.push({ severity: 'error', where, message: `ios.bundleIdentifier is a placeholder (${expo.ios.bundleIdentifier})` });
  }
  if (!expo?.android?.package) {
    issues.push({ severity: 'error', where, message: 'android.package is missing' });
  } else if (isPlaceholder(expo.android.package)) {
    issues.push({ severity: 'error', where, message: `android.package is a placeholder (${expo.android.package})` });
  }

  return issues;
}

/**
 * The Worker's KV binding. `id` is what a deployed Worker uses; `preview_id`
 * only matters for `wrangler dev --remote`, so a placeholder there is a warning.
 */
export function checkWranglerConfig(toml: string): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const where = 'cloudflare/wordping-api/wrangler.toml';

  const id = /^\s*id\s*=\s*"([^"]*)"/m.exec(toml)?.[1];
  if (!id) {
    issues.push({ severity: 'error', where, message: 'KV namespace id is missing' });
  } else if (isPlaceholder(id)) {
    issues.push({ severity: 'error', where, message: 'KV namespace id is still a placeholder — rate limits, kill switches and the entitlement cache will all fail' });
  }

  const previewId = /^\s*preview_id\s*=\s*"([^"]*)"/m.exec(toml)?.[1];
  if (previewId && isPlaceholder(previewId)) {
    issues.push({ severity: 'warning', where, message: 'KV preview_id is a placeholder — only affects `wrangler dev --remote`' });
  }

  // Secrets must arrive via `wrangler secret put`, never from the committed file.
  for (const secret of ['OPENAI_API_KEY', 'REVENUECAT_SECRET_API_KEY', 'RATE_LIMIT_SALT']) {
    if (new RegExp(`^\\s*${secret}\\s*=`, 'm').test(toml)) {
      issues.push({ severity: 'error', where, message: `${secret} is declared in wrangler.toml — it must be a Worker secret, not committed config` });
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: readonly PreflightIssue[]): boolean {
  return issues.some(issue => issue.severity === 'error');
}
