import { moodLogSchema, moodPeriodSchema } from '$lib/schemas/mood';
import type { moodLogs } from '$lib/server/db/schema';
import {
	addDaysToDateString,
	getISODayOfWeek,
	getStartOfMonth,
	getStartOfQuarter,
	getStartOfWeek,
	getTodayString
} from '$lib/utils/date';
import { getMoodChartColor, getMoodScore, resolveMoodLabel } from '$lib/utils/mood';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

type MoodPeriod = 'week' | 'month' | 'quarter';

export function getSelectedPeriod(value: string | null): MoodPeriod {
	const parsed = moodPeriodSchema.safeParse(value ?? 'week');
	return parsed.success ? parsed.data : 'week';
}

export function getMoodRangeStart(today: string, period: MoodPeriod): string {
	if (period === 'month') return getStartOfMonth(today);
	if (period === 'quarter') return getStartOfQuarter(today);
	return getStartOfWeek(today);
}

export async function buildMoodForm(todayMoodLog?: typeof moodLogs.$inferSelect | null) {
	const today = getTodayString();
	return superValidate(
		{
			date: todayMoodLog?.date ?? today,
			mood: todayMoodLog?.mood ?? '',
			customMood: todayMoodLog?.customMood ?? '',
			notes: todayMoodLog?.notes ?? ''
		},
		zod4(moodLogSchema)
	);
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function buildWeekdayAvg(
	entries: { date: string; mood: string }[]
): { day: string; avgScore: number | null; count: number }[] {
	const weekdayScores: number[][] = Array.from({ length: 7 }, () => []);

	for (const entry of entries) {
		// Mon=0…Sun=6
		const dayIndex = getISODayOfWeek(entry.date);
		weekdayScores[dayIndex].push(getMoodScore(entry.mood));
	}

	return WEEKDAY_LABELS.map((day, index) => ({
		day,
		avgScore:
			weekdayScores[index].length > 0
				? Number(
						(weekdayScores[index].reduce((s, v) => s + v, 0) / weekdayScores[index].length).toFixed(
							1
						)
					)
				: null,
		count: weekdayScores[index].length
	}));
}

/** The mood tab's data when there are no logs to show (or the mood tab isn't active). */
export function buildEmptyMood(selectedPeriod: MoodPeriod, rangeLabel: string, totalDays: number) {
	return {
		selectedPeriod,
		rangeLabel,
		trendPoints: [] as {
			date: string;
			score: number;
			resolvedMood: string;
			mood: string;
			isCustom: boolean;
			fill: string;
		}[],
		rollingAvgPoints: [] as { date: string; rollingAvg: number }[],
		distribution: [] as { mood: string; count: number; fill: string; percentage: number }[],
		weekdayAvg: buildWeekdayAvg([]),
		calendarLogs: [] as { date: string; score: number; resolvedMood: string; fill: string }[],
		todayLog: null as {
			date: string;
			mood: string;
			resolvedMood: string;
			notes: string | null;
		} | null,
		summary: {
			loggedDays: 0,
			totalDays,
			coveragePercentage: 0,
			currentStreak: 0,
			mostFrequentMood: null as string | null,
			averageScore: null as number | null
		}
	};
}

type MoodLog = typeof moodLogs.$inferSelect;

/** Trend, rolling average, distribution, weekday averages and streak for the mood tab. */
export function summarizeMood({
	selectedPeriod,
	rangeLabel,
	moodEntries,
	calendarEntries,
	moodRangeDates,
	todayLog
}: {
	selectedPeriod: MoodPeriod;
	rangeLabel: string;
	moodEntries: MoodLog[];
	calendarEntries: MoodLog[];
	moodRangeDates: string[];
	todayLog: MoodLog | null;
}) {
	const trendPoints = moodEntries.map((entry) => ({
		date: entry.date,
		score: getMoodScore(entry.mood),
		resolvedMood: resolveMoodLabel(entry.mood, entry.customMood),
		mood: entry.mood,
		isCustom: entry.mood === 'custom',
		fill: getMoodChartColor(entry.mood)
	}));

	// Rolling 7-day average: average over available logged points only (no interpolation)
	const rollingAvgPoints: { date: string; rollingAvg: number }[] = [];
	let windowStartIndex = 0;
	let windowScoreSum = 0;

	for (let pointIndex = 0; pointIndex < trendPoints.length; pointIndex += 1) {
		const point = trendPoints[pointIndex];
		const windowStart = addDaysToDateString(point.date, -6);

		while (trendPoints[windowStartIndex] && trendPoints[windowStartIndex].date < windowStart) {
			windowScoreSum -= trendPoints[windowStartIndex].score;
			windowStartIndex += 1;
		}

		windowScoreSum += point.score;
		const windowLength = pointIndex - windowStartIndex + 1;
		const avg = windowScoreSum / windowLength;

		rollingAvgPoints.push({ date: point.date, rollingAvg: Number(avg.toFixed(1)) });
	}

	const distributionMap = new Map<string, { count: number; fill: string }>();
	for (const entry of moodEntries) {
		const resolvedMood = resolveMoodLabel(entry.mood, entry.customMood);
		const existing = distributionMap.get(resolvedMood);
		if (existing) {
			existing.count += 1;
		} else {
			distributionMap.set(resolvedMood, { count: 1, fill: getMoodChartColor(entry.mood) });
		}
	}

	const distribution = Array.from(distributionMap.entries())
		.map(([mood, value]) => ({
			mood,
			count: value.count,
			fill: value.fill,
			percentage: moodEntries.length > 0 ? Math.round((value.count / moodEntries.length) * 100) : 0
		}))
		.sort((a, b) => b.count - a.count);

	const weekdayAvg = buildWeekdayAvg(moodEntries);

	const calendarLogs = calendarEntries.map((entry) => ({
		date: entry.date,
		score: getMoodScore(entry.mood),
		resolvedMood: resolveMoodLabel(entry.mood, entry.customMood),
		fill: getMoodChartColor(entry.mood)
	}));

	const moodDates = new Set(moodEntries.map((e) => e.date));
	let currentStreak = 0;
	for (let i = moodRangeDates.length - 1; i >= 0; i -= 1) {
		if (!moodDates.has(moodRangeDates[i])) break;
		currentStreak += 1;
	}

	const totalScore = trendPoints.reduce((sum, p) => sum + p.score, 0);
	const averageScore =
		trendPoints.length > 0 ? Number((totalScore / trendPoints.length).toFixed(1)) : null;

	return {
		selectedPeriod,
		rangeLabel,
		trendPoints,
		rollingAvgPoints,
		distribution,
		weekdayAvg,
		calendarLogs,
		todayLog: todayLog
			? {
					date: todayLog.date,
					mood: todayLog.mood,
					resolvedMood: resolveMoodLabel(todayLog.mood, todayLog.customMood),
					notes: todayLog.notes
				}
			: null,
		summary: {
			loggedDays: moodEntries.length,
			totalDays: moodRangeDates.length,
			coveragePercentage:
				moodRangeDates.length > 0
					? Math.round((moodEntries.length / moodRangeDates.length) * 100)
					: 0,
			currentStreak,
			mostFrequentMood: distribution[0]?.mood ?? null,
			averageScore
		}
	};
}
