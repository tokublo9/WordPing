const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const SCREEN = 'src/components/TestModeScreen.tsx';
const ANALYTICS = 'src/components/StudyAnalytics.tsx';
const LOG = 'src/features/study/studyLog.ts';

test('an answer is recorded only after a result is chosen', () => {
  const screen = read(SCREEN);
  const advance = screen.slice(
    screen.indexOf('const advance = useCallback'),
    screen.indexOf('// ── Layout'),
  );

  // Inside the grading path, after the outcome has been applied — so nothing
  // counts until the user has actually answered.
  assert.ok(advance.length > 0);
  assert.match(advance, /onAnswerRecorded\?\.\(answeredAt\);/u);
  assert.ok(
    advance.indexOf('const outcome = gradeCard(') < advance.indexOf('onAnswerRecorded?.('),
    'the answer is recorded after it is graded, not before',
  );
  // The double-tap guard sits above it, so one card cannot be counted twice
  // within a pass; a later pass clears the guard and counts it again.
  assert.ok(
    advance.indexOf('gradedIdsRef.current.has(card.id)') < advance.indexOf('onAnswerRecorded?.('),
  );

  // Nothing else in the screen reports an answer: not opening the mode, not
  // turning a card over, not leaving part-way through.
  assert.equal((screen.match(/onAnswerRecorded\?\./gu) ?? []).length, 1);
  const flip = screen.slice(screen.indexOf('const doToggleFlip'), screen.indexOf('const advance'));
  assert.doesNotMatch(flip, /onAnswerRecorded/u);
});

test('the recorded time is the real clock, never the development offset', () => {
  const screen = read(SCREEN);
  // The same timestamp the grade is written with, so a card's result and the
  // day it was answered on can never disagree.
  assert.match(screen, /const answeredAt = Date\.now\(\);/u);
  assert.match(screen, /const outcome = gradeCard\(card, kind, \{\s*now: answeredAt,/u);
  assert.match(screen, /<StudyAnalytics log=\{sessionStudyLog\} now=\{Date\.now\(\)/u);
  assert.match(read('App.tsx'), /onAnswerRecorded=\{answeredAt => setStudyLog\(log => recordAnswer\(log, answeredAt\)\)\}/u);
});

test('the study record is kept apart from the vocabulary, and read back defensively', () => {
  const log = read(LOG);
  const bootstrap = read('src/app/useAppBootstrap.ts');
  const persistence = read('src/app/useAppPersistence.ts');

  // A tally per local day, not a scan of the cards: a deleted card, a cleared
  // result and a word answered five times all count correctly.
  assert.match(log, /export type StudyLog = Readonly<Record<string, number>>;/u);
  assert.doesNotMatch(log, /WordCard|testLevel|reviewHistory/u);

  // Local calendar fields, so a day is the user's day.
  assert.match(log, /date\.getFullYear\(\)/u);
  assert.match(log, /date\.getMonth\(\)/u);
  assert.match(log, /date\.getDate\(\)/u);
  assert.doesNotMatch(log, /toISOString|getUTC/u);

  // Loaded once, pruned on the way in, and written back on every change.
  assert.match(bootstrap, /AsyncStorage\.getItem\(STUDY_LOG_KEY\)/u);
  assert.match(bootstrap, /setStudyLog\(pruneStudyLog\(parseStudyLog\(rawStudyLog\), Date\.now\(\)\)\)/u);
  assert.match(
    persistence,
    /if \(!hasLoaded\.current\) return;\s*AsyncStorage\.setItem\(STUDY_LOG_KEY, serializeStudyLog\(studyLog\)\)/u,
  );
  assert.match(read('src/constants.ts'), /export const STUDY_LOG_KEY = 'wordping_study_log';/u);
});

test('the analytics screen reads the log and writes nothing', () => {
  const analytics = read(ANALYTICS);

  assert.match(analytics, /dailyActivity\(log, now\)/u);
  assert.match(analytics, /studyStreak\(log, now\)/u);
  // A summary, not a control: nothing to press, and nothing stored.
  assert.doesNotMatch(analytics, /TouchableOpacity|onPress|AsyncStorage|setState|useState/u);

  // The streak reads as a sentence, and has something to say at zero.
  assert.match(analytics, /t\('study_streak'\)\.replace\('\{n\}', String\(streak\)\)/u);
  assert.match(analytics, /t\('study_streak_none'\)/u);
  assert.match(analytics, /t\('study_progress_title'\)/u);
  assert.match(analytics, /const todayCount = activity\[activity\.length - 1\]\?\.count \?\? 0;/u);
  assert.match(analytics, /\{todayCount\}/u);
  assert.match(analytics, /t\('study_answered_today'\)/u);

  // Today is picked out of the series rather than drawn as a different thing.
  assert.match(analytics, /backgroundColor: isToday\s*\? themeColor/u);
  // A quiet day still gets a bar, so the month is not silently compressed.
  assert.match(analytics, /count > 0 \? themeColor \+ '66' : pal\.border/u);
  assert.match(analytics, /Math\.max\(BAR_MIN_HEIGHT,/u);

  const i18n = read('src/i18n.ts');
  assert.match(i18n, /study_streak:\s*'\{n\}-day streak',/u);
  assert.match(i18n, /study_streak:\s*'\{n\}日連続',/u);
  assert.match(i18n, /study_activity_title:\s*'Last \{n\} days',/u);
  assert.match(i18n, /study_activity_title:\s*'直近\{n\}日',/u);
  assert.match(i18n, /study_progress_title:\s*'Your progress',/u);
  assert.match(i18n, /study_answered_today:\s*'words answered today',/u);
});
