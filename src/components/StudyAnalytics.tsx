import { StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { useLang } from '../i18n';
import {
  STUDY_ACTIVITY_DAYS,
  dailyActivity,
  peakDailyCount,
  studyStreak,
  totalAnswers,
  type StudyLog,
} from '../features/study/studyLog';

/**
 * What the user has done, shown when there is nothing left to test.
 *
 * It stands in for a message that only said "nothing here": the moment there is
 * no queue is exactly the moment a streak and a month of activity are worth
 * seeing, and the user is not being kept from anything by looking at them.
 *
 * It reads the study log and nothing else — no card, no result, no interval —
 * and it writes nothing at all.
 */

const CHART_HEIGHT = 64;
const BAR_MIN_HEIGHT = 2;

interface Props {
  log: StudyLog;
  /** The moment to read the log at. Passed in so the screen is testable. */
  now: number;
  pal: Palette;
  themeColor: string;
}

export function StudyAnalytics({ log, now, pal, themeColor }: Props) {
  const t = useLang();
  const activity = useMemo(() => dailyActivity(log, now), [log, now]);
  const streak = useMemo(() => studyStreak(log, now), [log, now]);
  const peak = peakDailyCount(activity);
  const total = totalAnswers(activity);
  const todayCount = activity[activity.length - 1]?.count ?? 0;

  return (
    <View style={styles.root}>
      <Text style={[styles.progressTitle, { color: pal.text }]} accessibilityRole="header">
        {t('study_progress_title')}
      </Text>

      <View style={[styles.summary, { backgroundColor: pal.card, borderColor: pal.border }]}>
        <View style={styles.summaryItem} accessible accessibilityRole="text">
          <Ionicons name="flame-outline" size={19} color={themeColor} />
          <Text style={[styles.streak, { color: pal.text }]}>
            {streak > 0
              ? t('study_streak').replace('{n}', String(streak))
              : t('study_streak_none')}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: pal.border }]} />
        <View
          style={styles.todayItem}
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('study_today_a11y').replace('{n}', String(todayCount))}
        >
          <Text style={[styles.todayCount, { color: themeColor }]}>{todayCount}</Text>
          <Text style={[styles.todayLabel, { color: pal.sub }]}>{t('study_answered_today')}</Text>
        </View>
      </View>

      <View style={styles.chartBlock}>
        <View style={styles.chartHeader}>
          <Text style={[styles.chartTitle, { color: pal.sub }]}>
            {t('study_activity_title').replace('{n}', String(STUDY_ACTIVITY_DAYS))}
          </Text>
        </View>

        {/* One bar per day, oldest on the left. A day with no answers keeps its
            place as a baseline stub: the gaps are part of the reading, and
            dropping them would quietly compress a month into a busier one. */}
        <View
          style={[styles.chart, { borderBottomColor: pal.border }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('study_activity_a11y')
            .replace('{n}', String(total))
            .replace('{d}', String(STUDY_ACTIVITY_DAYS))}
        >
          {activity.map(({ day, count, isToday }) => (
            <View key={day} style={styles.barSlot}>
              <View
                style={[
                  styles.bar,
                  {
                    height: peak === 0
                      ? BAR_MIN_HEIGHT
                      : Math.max(BAR_MIN_HEIGHT, Math.round((count / peak) * CHART_HEIGHT)),
                    // Today is the theme colour at full strength; the rest of the
                    // month is the same colour, quietened, so the shape reads as
                    // one series with one day picked out of it.
                    backgroundColor: isToday
                      ? themeColor
                      : count > 0 ? themeColor + '66' : pal.border,
                  },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Only the two ends are labelled. A tick under all thirty would be
            unreadable at this width, and the span is what the axis is for. */}
        <View style={styles.axis}>
          <Text style={[styles.axisLabel, { color: pal.sub }]}>
            {monthDay(activity[0]?.day)}
          </Text>
          <Text style={[styles.axisLabel, { color: pal.sub }]}>{t('study_today')}</Text>
        </View>
      </View>
    </View>
  );
}

/** `YYYY-MM-DD` as `MM/DD`, which is all the left edge of the axis needs. */
function monthDay(day: string | undefined): string {
  if (day === undefined) return '';
  const [, month, date] = day.split('-');
  return `${month}/${date}`;
}

const styles = StyleSheet.create({
  // No padding of its own: the screen that shows it already insets the block,
  // and doubling it would squeeze thirty bars into half the width.
  root: { width: '100%' },
  progressTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  summary: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginBottom: 36,
  },
  summaryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 8,
  },
  streak: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 34 },
  todayItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCount: { fontSize: 21, lineHeight: 23, fontWeight: '800' },
  todayLabel: { fontSize: 11, marginTop: 2 },
  chartBlock: { width: '100%' },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  chartTitle: { fontSize: 13, fontWeight: '600' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 2,
  },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisLabel: { fontSize: 11 },
});
