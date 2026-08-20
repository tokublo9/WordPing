const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('the development offset is source-controlled in one dedicated file', () => {
  const offset = read('src/dev/timeOffset.ts');
  const activeDeclarations = offset.match(/^export const DEV_TIME_OFFSET_MS\s*=/gmu) ?? [];

  assert.equal(activeDeclarations.length, 1);
  assert.match(offset, /^export const DEV_TIME_OFFSET_MS = [^;]+;$/mu);
  assert.match(offset, /Expo may need to be restarted/u);
  for (const label of ['+1 hour', '+1 day', '+3 days', '+7 days']) {
    assert.match(offset, new RegExp(`// \\${label}:`, 'u'));
  }
});

test('the clock has a production guard and no runtime controls or UI', () => {
  const clock = read('src/lib/appClock.ts');
  const settings = read('src/components/SettingsModal.tsx');

  assert.match(clock, /runtimeIsDevelopment/u);
  assert.match(clock, /isDevelopment \? developmentOffsetMs : 0/u);
  assert.doesNotMatch(clock, /setDevelopmentOffset|resetDevelopmentOffset|useSyncExternalStore/u);
  assert.doesNotMatch(settings, /Time Travel|timeTravel|DEV_TIME_OFFSET|appClock/u);
});

test('visibility and grading-time comparisons use appNow without offsetting persisted grades', () => {
  const useCards = read('src/features/cards/useCards.ts');
  const folders = read('src/screens/FolderListScreen/FolderListScreen.tsx');
  const visibility = read('src/features/cards/visibility.ts');
  const gradingScreen = read('src/components/TestModeScreen.tsx');

  assert.match(useCards, /now: appNow\(\)/u);
  assert.match(useCards, /const now = appNow\(\);/u);
  assert.match(folders, /const now = appNow\(\);/u);
  assert.match(visibility, /now: number = appNow\(\)/u);
  assert.match(gradingScreen, /const now = appNow\(\);[\s\S]*?testNextReview <= now/u);
  assert.match(gradingScreen, /now: Date\.now\(\),[\s\S]*?syncTestResults/u);
  assert.doesNotMatch([useCards, folders, visibility].join('\n'), /Date\.now\(/u);
});

test('the development offset is never persisted', () => {
  const persistence = read('src/app/useAppPersistence.ts');
  const database = read('src/lib/db.ts');

  assert.doesNotMatch(persistence, /DEV_TIME_OFFSET|timeOffset|time_offset/u);
  assert.doesNotMatch(database, /DEV_TIME_OFFSET|timeOffset|time_offset/u);
});
