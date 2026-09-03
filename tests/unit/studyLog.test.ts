import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDY_ACTIVITY_DAYS,
  dailyActivity,
  localDayKey,
  parseStudyLog,
  peakDailyCount,
  pruneStudyLog,
  recordAnswer,
  serializeStudyLog,
  shiftDayKey,
  studyStreak,
  totalAnswers,
  type StudyLog,
} from '../../src/features/study/studyLog';

/** Local noon, so a test never lands near a boundary by accident. */
function at(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

const TODAY = at(2026, 9, 3);

test('a day is the user\'s own calendar day, not a UTC one', () => {
  // Built from local fields, so both of these are the same local day whatever
  // the machine's offset is — and the two ends of a day are different days.
  assert.equal(localDayKey(at(2026, 9, 3, 0, 1)), '2026-09-03');
  assert.equal(localDayKey(at(2026, 9, 3, 23, 59)), '2026-09-03');
  assert.equal(localDayKey(at(2026, 9, 4, 0, 1)), '2026-09-04');
  // Zero-padded, so keys sort as dates.
  assert.equal(localDayKey(at(2026, 1, 5)), '2026-01-05');
});

test('stepping back a day steps the calendar, not 24 hours', () => {
  assert.equal(shiftDayKey(TODAY, -1), '2026-09-02');
  assert.equal(shiftDayKey(TODAY, 0), '2026-09-03');
  // Across a month end, a year end, and a leap day.
  assert.equal(shiftDayKey(at(2026, 3, 1), -1), '2026-02-28');
  assert.equal(shiftDayKey(at(2027, 1, 1), -1), '2026-12-31');
  assert.equal(shiftDayKey(at(2028, 3, 1), -1), '2028-02-29');
});

test('an answer is counted on the day it was given', () => {
  let log: StudyLog = {};
  log = recordAnswer(log, at(2026, 9, 3, 9));
  log = recordAnswer(log, at(2026, 9, 3, 22));
  log = recordAnswer(log, at(2026, 9, 2, 8));
  assert.deepEqual(log, { '2026-09-03': 2, '2026-09-02': 1 });
});

test('answering the same word again counts again', () => {
  // The log knows nothing about words, which is the point: five answers are
  // five answers, even if they were all the same card.
  let log: StudyLog = {};
  for (let i = 0; i < 5; i += 1) log = recordAnswer(log, at(2026, 9, 3, 10, i));
  assert.deepEqual(log, { '2026-09-03': 5 });
});

test('recording never mutates the log it was given', () => {
  const original: StudyLog = { '2026-09-02': 3 };
  const snapshot = JSON.stringify(original);
  recordAnswer(original, TODAY);
  assert.equal(JSON.stringify(original), snapshot);
});

test('a stored log survives a round trip, and a broken one costs only a bar', () => {
  const log: StudyLog = { '2026-09-03': 4, '2026-09-01': 1 };
  assert.deepEqual(parseStudyLog(serializeStudyLog(log)), log);

  assert.deepEqual(parseStudyLog(null), {});
  assert.deepEqual(parseStudyLog(''), {});
  assert.deepEqual(parseStudyLog('{broken'), {});
  assert.deepEqual(parseStudyLog('[]'), {});
  assert.deepEqual(parseStudyLog('"nope"'), {});
  // Entry by entry: a bad key or a bad count is dropped, the rest is kept.
  assert.deepEqual(
    parseStudyLog(JSON.stringify({
      '2026-09-03': 2,
      '2026-9-3': 5,
      'yesterday': 5,
      '2026-09-02': '5',
      '2026-09-01': -2,
      '2026-08-31': 0,
      '2026-08-30': 1.7,
      '2026-08-29': Number.NaN,
    })),
    { '2026-09-03': 2, '2026-08-30': 1 },
  );
});

test('a streak counts back from today, and today has not ended yet', () => {
  // Three days running, including today.
  assert.equal(studyStreak({
    '2026-09-03': 1, '2026-09-02': 4, '2026-09-01': 2,
  }, TODAY), 3);

  // Nothing today yet: the streak stands on yesterday, because the day the user
  // is in cannot be counted against them until it is over.
  assert.equal(studyStreak({ '2026-09-02': 4, '2026-09-01': 2 }, TODAY), 2);

  // A whole day missed breaks it: yesterday is empty and today is empty.
  assert.equal(studyStreak({ '2026-09-01': 9, '2026-08-31': 9 }, TODAY), 0);
  // ...but answering today starts a new one immediately.
  assert.equal(studyStreak({ '2026-09-03': 1, '2026-09-01': 9 }, TODAY), 1);

  assert.equal(studyStreak({}, TODAY), 0);
});

test('a long streak is counted in full, and terminates', () => {
  const log: Record<string, number> = {};
  for (let offset = 0; offset < 500; offset += 1) log[shiftDayKey(TODAY, -offset)] = 1;
  assert.equal(studyStreak(log, TODAY), 500);
  assert.equal(studyStreak(pruneStudyLog(log, TODAY), TODAY), 500);
});

test('the last thirty days are all present, in order, zeros included', () => {
  const activity = dailyActivity({ '2026-09-03': 5, '2026-08-20': 2 }, TODAY);

  assert.equal(activity.length, STUDY_ACTIVITY_DAYS);
  assert.equal(activity[0].day, shiftDayKey(TODAY, -(STUDY_ACTIVITY_DAYS - 1)));
  assert.equal(activity[activity.length - 1].day, '2026-09-03');
  // Oldest first, one day per step, nothing skipped.
  for (let i = 1; i < activity.length; i += 1) {
    assert.equal(activity[i].day, shiftDayKey(TODAY, -(STUDY_ACTIVITY_DAYS - 1 - i)));
    assert.ok(activity[i].day > activity[i - 1].day);
  }
  // Quiet days are days too.
  assert.equal(activity.filter(entry => entry.count === 0).length, STUDY_ACTIVITY_DAYS - 2);
  assert.equal(activity.find(entry => entry.day === '2026-08-20')?.count, 2);

  // Exactly one today, and it is the last bar.
  const todays = activity.filter(entry => entry.isToday);
  assert.equal(todays.length, 1);
  assert.equal(todays[0].day, '2026-09-03');
  assert.equal(activity[activity.length - 1].isToday, true);
});

test('a day outside the window is not shown, and does not distort the scale', () => {
  const activity = dailyActivity({ '2026-09-03': 3, '2026-01-01': 999 }, TODAY);
  assert.equal(activity.some(entry => entry.day === '2026-01-01'), false);
  assert.equal(peakDailyCount(activity), 3);
  assert.equal(totalAnswers(activity), 3);
});

test('an empty window scales to zero rather than to nothing', () => {
  const activity = dailyActivity({}, TODAY);
  assert.equal(peakDailyCount(activity), 0);
  assert.equal(totalAnswers(activity), 0);
  assert.equal(activity.length, STUDY_ACTIVITY_DAYS);
});

test('pruning keeps the retention window and drops what is behind it', () => {
  const log = {
    [shiftDayKey(TODAY, 0)]: 1,
    [shiftDayKey(TODAY, -399)]: 1,
    [shiftDayKey(TODAY, -400)]: 1,
    [shiftDayKey(TODAY, -800)]: 1,
  };
  const pruned = pruneStudyLog(log, TODAY);
  assert.equal(pruned[shiftDayKey(TODAY, 0)], 1);
  assert.equal(pruned[shiftDayKey(TODAY, -399)], 1);
  assert.equal(pruned[shiftDayKey(TODAY, -400)], undefined);
  assert.equal(pruned[shiftDayKey(TODAY, -800)], undefined);
  // A short window, to show the boundary is the window and not a constant.
  const short = pruneStudyLog(log, TODAY, 1);
  assert.deepEqual(Object.keys(short), [shiftDayKey(TODAY, 0)]);
});
