const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relative => fs.readFileSync(relative, 'utf8');

test('the app can adopt the local Basic scenario without initializing RevenueCat', () => {
  const scenario = read('src/dev/localAiVoiceScenario.ts');
  const subscription = read('src/hooks/useSubscription.ts');
  const client = read('src/lib/api/client.ts');

  assert.match(scenario, /if \(!__DEV__\) return null;/u);
  assert.match(scenario, /LOCAL_HOSTS\.has\(url\.hostname\.toLowerCase\(\)\)/u);
  assert.match(scenario, /body\.upstreamsMocked === true/u);
  assert.match(scenario, /body\.storage === 'isolated-local-kv'/u);

  const subscriptionScenario = subscription.indexOf('getLocalAiVoiceTestScenario()');
  const subscriptionRevenueCat = subscription.indexOf('configureRevenueCat()', subscriptionScenario);
  assert.ok(subscriptionScenario >= 0 && subscriptionRevenueCat > subscriptionScenario);
  assert.match(subscription, /setPlan\('basic'\)/u);
  assert.match(subscription, /setEntitlementSource\('local-development-scenario'\)/u);

  const clientScenario = client.indexOf('getLocalAiVoiceTestScenario()');
  const clientRevenueCat = client.indexOf('configureRevenueCat()', clientScenario);
  assert.ok(clientScenario >= 0 && clientRevenueCat > clientScenario);
  assert.match(client, /appUserId: LOCAL_AI_VOICE_APP_USER_ID/u);
});

test('manual playback bypasses reads without deleting audio and background preloads stay off', () => {
  const tts = read('src/lib/tts.ts');
  const app = read('App.tsx');

  assert.match(tts, /bypassCache: isBasicMonthlyLimitScenarioActive\(\)/u);
  assert.match(tts, /if \(indexed && !options\.bypassCache\)/u);
  assert.match(tts, /if \(!options\.bypassCache && await validateCachedAudioFile\(cachedFile\)\)/u);
  assert.doesNotMatch(tts, /bypassCache[\s\S]{0,180}(delete|invalidateCachedAudioFile)/u);
  assert.match(app, /if \(entitlementSource === 'local-development-scenario'\) return;[\s\S]{0,180}syncAIVoiceSamplePreloading/u);
  assert.match(app, /entitlementSource === 'local-development-scenario'[\s\S]{0,180}preloadedLibraryKeyRef\.current = null/u);
  assert.match(app, /entitlementSource !== 'local-development-scenario'/u);
});

test('the scenario is Worker-local configuration and creates no UI test control', () => {
  const workerEnv = read('cloudflare/wordping-api/src/env.ts');
  const workerLocal = read('cloudflare/wordping-api/src/localDevelopment.ts');
  const gitignore = read('.gitignore');
  const components = fs.readdirSync('src/components')
    .filter(name => name.endsWith('.tsx'))
    .map(name => read(path.join('src/components', name)))
    .join('\n');

  assert.match(workerEnv, /LOCAL_AI_VOICE_TEST_SCENARIO\?: string/u);
  assert.doesNotMatch(workerEnv, /EXPO_PUBLIC_LOCAL_AI_VOICE_TEST_SCENARIO/u);
  assert.match(workerLocal, /if \(!isLocalWorkerRequest\(request\)\) return null;/u);
  assert.doesNotMatch(components, /LOCAL_AI_VOICE_TEST_SCENARIO|basic_monthly_limit/u);
  assert.match(gitignore, /cloudflare\/\*\*\/\.dev\.vars/u);
  assert.match(gitignore, /\.env\.\*/u);
});

test('the launcher forces local bindings and disposable KV storage', () => {
  const script = read('cloudflare/wordping-api/scripts/dev-basic-monthly-limit.sh');
  assert.match(script, /mktemp -d/u);
  assert.match(script, /--local/u);
  assert.match(script, /--ip 127\.0\.0\.1/u);
  assert.match(script, /--persist-to "\$state_dir"/u);
  assert.match(script, /trap cleanup EXIT HUP INT TERM/u);
  assert.match(script, /rm -rf "\$state_dir"/u);
  assert.doesNotMatch(script, /--remote|wrangler deploy/u);
});
