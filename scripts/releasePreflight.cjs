#!/usr/bin/env node
/**
 * Release gate. Run before every production build:
 *
 *   npm run preflight
 *
 * Exits non-zero when a configuration problem would ship a broken app. These
 * checks deliberately live outside `npm test`: the unit suite verifies code,
 * this verifies the deployment configuration, and the two fail for different
 * reasons and at different times.
 *
 * The check logic itself is in src/lib/releasePreflight.ts and is unit-tested
 * in tests/unit/releasePreflight.test.ts.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, '.test-build');

// Reuse the test project's compiler output so the checks run as real code
// rather than being duplicated in JavaScript here.
const compiled = path.join(buildDir, 'src/lib/releasePreflight.js');
if (!fs.existsSync(compiled)) {
  execFileSync('npx', ['tsc', '-p', 'tsconfig.test.json'], { cwd: root, stdio: 'inherit' });
}
const checks = require(compiled);

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

// Themes are not sold individually, so there are no per-theme StoreKit
// products to validate here. Paid themes are unlocked by the Basic/Premium
// subscription, which is covered by the RevenueCat key check below.
const issues = [
  ...checks.checkEasProduction(readJson('eas.json')),
  ...checks.checkAppConfig(readJson('app.json')),
  ...checks.checkWranglerConfig(
    fs.readFileSync(path.join(root, 'cloudflare/wordping-api/wrangler.toml'), 'utf8'),
  ),
];

const errors = issues.filter(issue => issue.severity === 'error');
const warnings = issues.filter(issue => issue.severity === 'warning');

if (issues.length === 0) {
  console.log('Release preflight: all checks passed.');
  process.exit(0);
}

for (const issue of warnings) {
  console.warn(`  WARN  ${issue.where}\n        ${issue.message}`);
}
for (const issue of errors) {
  console.error(`  FAIL  ${issue.where}\n        ${issue.message}`);
}

console.log(`\nRelease preflight: ${errors.length} blocking, ${warnings.length} warning.`);
if (errors.length > 0) {
  console.error('Fix the blocking items before building for production.');
  process.exit(1);
}
process.exit(0);
