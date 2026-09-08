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

  // Visibility and the result counts read the shared clock; it is passed
  // positionally now rather than as a `now:` option, so both call sites are
  // named instead of matching the old keyword form.
  assert.match(useCards, /cardsForVisibility\(displayedAllFolderCards, appNow\(\)\)/u);
  assert.match(useCards, /countCardsByResult\(displayedAllFolderCards, appNow\(\)\)/u);
  assert.match(useCards, /const now = appNow\(\);/u);
  assert.match(folders, /const now = appNow\(\);/u);
  assert.match(visibility, /now: number = appNow\(\)/u);
  // The due/waiting rule reads the same clock, and the test queue asks it
  // rather than comparing timestamps a second time.
  assert.match(read('src/features/cards/testSchedule.ts'), /now: number = appNow\(\)/u);
  assert.match(gradingScreen, /const now = appNow\(\);[\s\S]*?isCardDueForTest\(c, now\)/u);
  // Grading *writes* absolute timestamps, and deliberately uses the real clock
  // rather than appNow(): the development offset must never reach
  // reviewHistory, testNextReview, hiddenUntil or the study log, where it would
  // outlive the offset being switched off. Reading is offset; writing is not.
  assert.match(
    gradingScreen,
    /const answeredAt = Date\.now\(\);\s*const outcome = gradeCard\(card, kind, \{\s*now: answeredAt,\s*syncTestResults/u,
  );
  // And that one real timestamp is what reaches every sink, so they cannot
  // disagree about when the answer happened.
  assert.match(gradingScreen, /recordAnswer\(log, answeredAt\)/u);
  assert.match(gradingScreen, /onAnswerRecorded\?\.\(answeredAt\);/u);
  assert.doesNotMatch([useCards, folders, visibility].join('\n'), /Date\.now\(/u);
});

test('the development offset is never persisted', () => {
  const persistence = read('src/app/useAppPersistence.ts');
  const database = read('src/lib/db.ts');

  assert.doesNotMatch(persistence, /DEV_TIME_OFFSET|timeOffset|time_offset/u);
  assert.doesNotMatch(database, /DEV_TIME_OFFSET|timeOffset|time_offset/u);
});
