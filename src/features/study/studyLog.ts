/**
 * What the user actually did, day by day.
 *
 * A card's own state cannot answer this. It carries the *latest* result and
 * nothing before it; a Perfect answer deletes the card outright with "Sync with
 * test results" on; clearing a word's results wipes its history; and a word
 * answered five times looks exactly like a word answered once. So answers are
 * counted here, as they happen, and never derived from the vocabulary
 * afterwards.
 *
 * The record is a tally per local calendar day rather than a list of events:
 * a day and a number is all either reading needs, repeated answers do not grow
 * the record, and it stays small enough to write on every answer.
 *
 * Days are the user's own days. A day key is built from local calendar fields,
 * so an answer at 23:59 and one at 00:01 are on different days for the person
 * who gave them, wherever they are and whichever way the clocks went.
 */

/** `YYYY-MM-DD` in local time, mapped to the number of answers given that day. */
export type StudyLog = Readonly<Record<string, number>>;

/**
 * Minimum history kept for the chart and recent records.
 *
 * An active streak is retained in full even when it is longer than this window.
 */
export const STUDY_LOG_RETENTION_DAYS = 400;

/** How many days the activity chart covers. */
export const STUDY_ACTIVITY_DAYS = 30;

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * The local calendar day a timestamp falls in.
 *
 * Built from `getFullYear`/`getMonth`/`getDate` rather than from an ISO string,
 * which would be UTC and would put a late evening answer on tomorrow for anyone
 * east of Greenwich.
 */
export function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The key `offset` days before the day `timestamp` falls in.
 *
 * Steps by calendar date rather than by 24 hours, so a daylight-saving change —
 * where a local day is 23 or 25 hours long — cannot skip or repeat a day.
 */
export function shiftDayKey(timestamp: number, offset: number): string {
  const date = new Date(timestamp);
  return localDayKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset).getTime(),
  );
}

/**
 * Reads a stored log, keeping only what is unmistakably a day and a count.
 *
 * Anything else — a malformed key, a negative, a fraction, a string, a value
 * from a future format — is dropped rather than trusted. The screen this feeds
 * is a summary; a broken entry must cost the user a bar, never a crash.
 */
export function parseStudyLog(raw: string | null | undefined): StudyLog {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const log: Record<string, number> = {};
  for (const [day, count] of Object.entries(parsed as Record<string, unknown>)) {
    if (!DAY_KEY_PATTERN.test(day)) continue;
    if (typeof count !== 'number' || !Number.isFinite(count)) continue;
    const whole = Math.floor(count);
    if (whole <= 0) continue;
    log[day] = whole;
  }
  return log;
}

export function serializeStudyLog(log: StudyLog): string {
  return JSON.stringify(log);
}

/**
 * One answer, on the day it was given.
 *
 * Returns a new log; the caller decides when to write it. Called once per
 * graded card — never for opening Test Mode, turning a card over, or leaving
 * part-way through.
 */
export function recordAnswer(log: StudyLog, answeredAt: number): StudyLog {
  const day = localDayKey(answeredAt);
  return { ...log, [day]: (log[day] ?? 0) + 1 };
}

/**
 * Drops stale days beyond the retention window while preserving an active streak.
 *
 * A fixed cutoff alone would eventually under-report a dedicated user's streak.
 * Keeping the contiguous run from today (or yesterday while today is still in
 * progress) makes the compact daily totals exact for both things the UI reads:
 * recent activity and the current streak.
 */
export function pruneStudyLog(
  log: StudyLog,
  now: number,
  retentionDays: number = STUDY_LOG_RETENTION_DAYS,
): StudyLog {
  const oldest = shiftDayKey(now, -(retentionDays - 1));
  const pruned: Record<string, number> = {};
  for (const [day, count] of Object.entries(log)) {
    // Day keys are fixed-width, so a string comparison is a date comparison.
    if (day >= oldest) pruned[day] = count;
  }

  const today = localDayKey(now);
  let offset = (log[today] ?? 0) > 0 ? 0 : -1;
  let remainingRecordedDays = Object.keys(log).length;
  while (remainingRecordedDays > 0) {
    const day = shiftDayKey(now, offset);
    const count = log[day] ?? 0;
    if (count <= 0) break;
    pruned[day] = count;
    offset -= 1;
    remainingRecordedDays -= 1;
  }
  return pruned;
}

/**
 * Consecutive study days, counting back from today.
 *
 * A day counts when at least one answer was given on it. Today not having an
 * answer *yet* does not end a streak — the day is not over — so the count runs
 * from yesterday in that case. It takes a whole calendar day with no answer at
 * all to break it, which is the moment the walk below stops.
 */
export function studyStreak(log: StudyLog, now: number): number {
  const today = localDayKey(now);
  // Start on today when it has an answer, otherwise on yesterday: today is
  // still in progress and cannot count against the user.
  let offset = (log[today] ?? 0) > 0 ? 0 : -1;
  let streak = 0;
  // A streak cannot be longer than the number of recorded days. The bound also
  // guarantees termination for malformed stored data without capping a real
  // streak at an arbitrary number of days.
  const recordedDays = Object.keys(log).length;
  while (streak < recordedDays) {
    const day = shiftDayKey(now, offset);
    if ((log[day] ?? 0) <= 0) break;
    streak += 1;
    offset -= 1;
  }
  return streak;
}

export interface StudyDay {
  /** `YYYY-MM-DD`, local. */
  day: string;
  /** Answers given that day, `0` for a day with none. */
  count: number;
  isToday: boolean;
}

/**
 * The last `days` calendar days, oldest first.
 *
 * Every day is present, including the ones with nothing on them: a gap is part
 * of the picture, and a chart that omitted quiet days would silently compress
 * time and misreport how much was done.
 */
export function dailyActivity(
  log: StudyLog,
  now: number,
  days: number = STUDY_ACTIVITY_DAYS,
): StudyDay[] {
  const today = localDayKey(now);
  const activity: StudyDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = shiftDayKey(now, -offset);
    activity.push({ day, count: log[day] ?? 0, isToday: day === today });
  }
  return activity;
}

/** The busiest day in a window, used to scale the chart. `0` when nothing was done. */
export function peakDailyCount(activity: readonly StudyDay[]): number {
  let peak = 0;
  for (const entry of activity) if (entry.count > peak) peak = entry.count;
  return peak;
}

/** Total answers across a window, for the summary line above the chart. */
export function totalAnswers(activity: readonly StudyDay[]): number {
  let total = 0;
  for (const entry of activity) total += entry.count;
  return total;
}
