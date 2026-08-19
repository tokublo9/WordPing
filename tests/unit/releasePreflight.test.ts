import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkAppConfig,
  checkEasProduction,
  checkWranglerConfig,
  hasBlockingIssues,
  isPlaceholder,
  type EasConfig,
} from '../../src/lib/releasePreflight';

/**
 * These checks exist because none of the failures below break a build, a
 * typecheck or a unit test — they only surface once real users have the app.
 */

// A realistic deployed Worker URL. Anything containing "example" is treated as
// a placeholder, which is intentional — see the isPlaceholder test below.
const GOOD_URL = 'https://wordping-api.wordping-daiki.workers.dev';

function eas(env: Record<string, string>): EasConfig {
  return { build: { production: { env } } };
}

const VALID_ENV = {
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_abcdefghijklmnop',
  EXPO_PUBLIC_WORDPING_API_BASE_URL: GOOD_URL,
};

function messages(issues: { message: string }[]): string {
  return issues.map(issue => issue.message).join(' | ');
}

test('a fully configured production profile passes', () => {
  const issues = checkEasProduction(eas(VALID_ENV));
  assert.deepEqual(issues, []);
  assert.equal(hasBlockingIssues(issues), false);
});

test('a placeholder RevenueCat key blocks release', () => {
  // The exact value that shipped in eas.json before this audit.
  const issues = checkEasProduction(eas({
    ...VALID_ENV,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_REPLACE_WITH_PRODUCTION_IOS_KEY',
  }));
  assert.equal(hasBlockingIssues(issues), true);
  assert.match(messages(issues), /placeholder/u);
});

test('a RevenueCat Test Store key blocks release', () => {
  // configureRevenueCat() refuses a test_ key in a non-dev build, so shipping
  // one disables every purchase and every entitlement.
  const issues = checkEasProduction(eas({
    ...VALID_ENV,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'test_fLEoATmCLXIwIwewgvKndTEIPXG',
  }));
  assert.equal(hasBlockingIssues(issues), true);
  assert.match(messages(issues), /Test Store/u);
});

test('a missing API base URL blocks release', () => {
  // EAS builds do not upload the gitignored .env, so an unset variable here
  // means every AI request fails in production.
  const { EXPO_PUBLIC_WORDPING_API_BASE_URL: _omitted, ...withoutUrl } = VALID_ENV;
  const issues = checkEasProduction(eas(withoutUrl));
  assert.equal(hasBlockingIssues(issues), true);
  assert.match(messages(issues), /EXPO_PUBLIC_WORDPING_API_BASE_URL is missing/u);
});

test('a localhost or plain-http API base URL blocks release', () => {
  for (const url of ['http://127.0.0.1:8787', 'http://localhost:8787', 'http://wordping-api.wordping-daiki.workers.dev']) {
    const issues = checkEasProduction(eas({ ...VALID_ENV, EXPO_PUBLIC_WORDPING_API_BASE_URL: url }));
    assert.equal(hasBlockingIssues(issues), true, `${url} should block release`);
  }
});

test('a server-side secret in a client variable blocks release', () => {
  for (const [key, value] of [
    ['EXPO_PUBLIC_OPENAI_API_KEY', 'sk-proj-abc123'],
    ['EXPO_PUBLIC_REVENUECAT_SECRET_API_KEY', 'sk_abc123'],
    ['EXPO_PUBLIC_RATE_LIMIT_SALT', 'some-salt'],
  ]) {
    const issues = checkEasProduction(eas({ ...VALID_ENV, [key!]: value! }));
    assert.equal(hasBlockingIssues(issues), true, `${key} should block release`);
  }
});

test('a secret-shaped value blocks release even under an innocent name', () => {
  const issues = checkEasProduction(eas({ ...VALID_ENV, EXPO_PUBLIC_HELPER: 'sk-proj-leaked' }));
  assert.equal(hasBlockingIssues(issues), true);
});

test('a missing production profile blocks release', () => {
  assert.equal(hasBlockingIssues(checkEasProduction({})), true);
  assert.equal(hasBlockingIssues(checkEasProduction({ build: {} })), true);
});

test('app config requires real identifiers', () => {
  assert.deepEqual(
    checkAppConfig({
      expo: {
        version: '1.0.0',
        ios: { bundleIdentifier: 'com.daiki0219.wordping', buildNumber: '1' },
        android: { package: 'com.daiki0219.wordping', versionCode: 1 },
      },
    }),
    [],
  );

  assert.equal(hasBlockingIssues(checkAppConfig({ expo: { version: '1.0.0' } })), true);
  assert.equal(
    hasBlockingIssues(checkAppConfig({
      expo: {
        version: '1.0.0',
        ios: { bundleIdentifier: 'com.example.REPLACE_ME' },
        android: { package: 'com.daiki0219.wordping' },
      },
    })),
    true,
  );
});

test('a placeholder KV namespace id blocks release', () => {
  // Without a real namespace the Worker loses rate limits, kill switches and
  // the entitlement cache all at once.
  const issues = checkWranglerConfig('[[kv_namespaces]]\nid = "REPLACE_WITH_KV_NAMESPACE_ID"\n');
  assert.equal(hasBlockingIssues(issues), true);
});

test('a placeholder KV preview id is only a warning', () => {
  const issues = checkWranglerConfig(
    '[[kv_namespaces]]\nid = "a2e62680a8d9438db17c0480206c42c0"\npreview_id = "REPLACE_WITH_KV_PREVIEW_NAMESPACE_ID"\n',
  );
  assert.equal(hasBlockingIssues(issues), false);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.severity, 'warning');
});

test('a secret committed into wrangler.toml blocks release', () => {
  for (const secret of ['OPENAI_API_KEY', 'REVENUECAT_SECRET_API_KEY', 'RATE_LIMIT_SALT']) {
    const issues = checkWranglerConfig(`id = "real-id"\n${secret} = "leaked"\n`);
    assert.equal(hasBlockingIssues(issues), true, `${secret} should block release`);
  }
});

test('placeholder detection covers the common spellings', () => {
  for (const value of ['REPLACE_ME', 'your-key-here', 'CHANGEME', 'TODO', 'sk-xxx', 'example.com']) {
    assert.equal(isPlaceholder(value), true, `${value} should read as a placeholder`);
  }
  for (const value of ['appl_abcdefghijk', 'https://wordping-api.wordping-daiki.workers.dev', 'a2e62680a8d9438db17c0480206c42c0']) {
    assert.equal(isPlaceholder(value), false, `${value} should read as real`);
  }
});
