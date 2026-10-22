import { getPersonVisitStatus } from '#lib/server/visits.js';
import { DEFAULT_DASHBOARD_GOALS } from '#lib/utils/dashboard-goals.js';
import {
	addDaysToDateString,
	calendarDaysBetween,
	formatDateMedium,
	formatMonthDay,
	formatTime12Hour,
	formatTimestampMedium,
	formatTimestampShort,
	formatTodayLabel,
	getISODayOfWeek,
	getTodayString
} from '#lib/utils/date.js';
import { createMarkdownExcerpt } from '#lib/utils/markdown.js';
import type { VisitStatusThresholds } from '#lib/utils/visit-status.js';
import { getWorkoutLabel } from '#lib/utils/workout.js';

import type { QueryData } from './queries';

/** Pure helpers that shape the dashboard query results into the page's data. */

type ActivityItem = {
	type: 'journal' | 'workout' | 'meditation' | 'task' | 'visit';
	id: string;
	href: string;
	title: string;
	meta: string;
	timestamp: Date;
};

type VisitHealthBucket = 'critical' | 'overdue' | 'healthy' | 'noVisits';

type VisitHealthResult = {
	counts: Record<VisitHealthBucket, number> & { total: number };
	names: Record<VisitHealthBucket, string[]>;
};

const STATUS_KEY_MAP: Record<string, VisitHealthBucket> = {
	red: 'critical',
	yellow: 'overdue',
	green: 'healthy',
	scheduled: 'healthy',
	none: 'noVisits'
};

function getDayLabel(date: string, today: string, tomorrow: string): string {
	if (date === today) return 'Today';
	if (date === tomorrow) return 'Tomorrow';
	return formatDateMedium(date);
}

type UpcomingVisitRow = { personId: string; personName: string; date: string };
type UpcomingFollowUpRow = { personId: string; personName: string; followUpDate: string | null };
export type UpcomingScheduledOnlyRow = {
	personId: string;
	personName: string;
	scheduledVisitDate: string;
};

export function buildUpcomingVisits(
	byDateRaw: UpcomingVisitRow[],
	byFollowUpRaw: UpcomingFollowUpRow[],
	byScheduledOnlyRaw: UpcomingScheduledOnlyRow[],
	today: string
): { dayLabel: string; names: string[]; isToday: boolean }[] {
	const tomorrow = addDaysToDateString(today, 1);
	// Outer key: date string. Inner key: personId → personName (O(1) dedup).
	const map = new Map<string, Map<string, string>>();

	for (const v of byDateRaw) {
		const inner = map.get(v.date) ?? new Map<string, string>();
		inner.set(v.personId, v.personName);
		map.set(v.date, inner);
	}

	for (const v of byFollowUpRaw) {
		if (!v.followUpDate) continue;
		const inner = map.get(v.followUpDate) ?? new Map<string, string>();
		inner.set(v.personId, v.personName);
		map.set(v.followUpDate, inner);
	}

	for (const v of byScheduledOnlyRaw) {
		const inner = map.get(v.scheduledVisitDate) ?? new Map<string, string>();
		inner.set(v.personId, v.personName);
		map.set(v.scheduledVisitDate, inner);
	}

	return Array.from(map.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, inner]) => ({
			dayLabel: getDayLabel(date, today, tomorrow),
			names: Array.from(inner.values()).sort((a, b) => a.localeCompare(b)),
			isToday: date === today
		}));
}

export function buildVisitHealth(
	peopleRaw: { id: string; name: string; isExempt: boolean; scheduledVisitDate: string | null }[],
	visitsMap: Map<string, { date: string; followUpDate: string | null }>,
	today: string,
	visitStatusThresholds: VisitStatusThresholds
): VisitHealthResult {
	const counts: Record<VisitHealthBucket, number> & { total: number } = {
		critical: 0,
		overdue: 0,
		healthy: 0,
		noVisits: 0,
		total: 0
	};
	const names: Record<VisitHealthBucket, string[]> = {
		critical: [],
		overdue: [],
		healthy: [],
		noVisits: []
	};
	for (const person of peopleRaw) {
		const { status } = getPersonVisitStatus(
			person,
			visitsMap.get(person.id),
			today,
			visitStatusThresholds
		);
		const key = STATUS_KEY_MAP[status];
		if (key) {
			counts[key]++;
			counts.total++;
			names[key].push(person.name);
		}
	}
	return { counts, names };
}

export function buildCountByDateMap(rows: { date: string; count: number }[]): Map<string, number> {
	return new Map(rows.map((r) => [r.date, Number(r.count || 0)]));
}

export function sumCountsByDate(countByDate: Map<string, number>, dates: string[]): number {
	return dates.reduce((total, date) => total + (countByDate.get(date) ?? 0), 0);
}

export function buildMeditationCountByDate(
	sessions: { completedAt: Date }[],
	startOfLastWeekDate: string,
	endOfThisWeekDate: string
): Map<string, number> {
	const map = new Map<string, number>();
	for (const session of sessions) {
		const localDate = getTodayString(session.completedAt);
		if (localDate < startOfLastWeekDate || localDate >= endOfThisWeekDate) continue;
		map.set(localDate, (map.get(localDate) ?? 0) + 1);
	}
	return map;
}

export function buildAgendaCompletionTrend(
	entries: { date: string; completed: boolean }[],
	startOfThisWeekDate: string
): { weekLabel: string; completionPct: number }[] {
	return Array.from({ length: 8 }, (_, i) => {
		const weekStart = addDaysToDateString(startOfThisWeekDate, -(7 - i) * 7);
		const weekEnd = addDaysToDateString(weekStart, 7);
		const entriesInWeek = entries.filter((e) => e.date >= weekStart && e.date < weekEnd);
		const total = entriesInWeek.length;
		const completed = entriesInWeek.filter((e) => e.completed).length;
		return {
			weekLabel: formatMonthDay(weekStart),
			completionPct: total > 0 ? Math.round((completed / total) * 100) : 0
		};
	});
}

export function buildTaskStats(
	completionRaw: { title: string; completedAt: Date | null }[],
	openHighPriorityResult: { count: number }[],
	openTotalResult: { count: number }[],
	openHighPriorityTitlesRaw: { title: string }[],
	openTotalTitlesRaw: { title: string }[],
	thisWeekDates: string[],
	lastWeekDates: string[]
) {
	const thisWeekDateSet = new Set(thisWeekDates);
	const lastWeekDateSet = new Set(lastWeekDates);
	let completedThisWeek = 0;
	let completedLastWeek = 0;
	const completedThisWeekTitles: string[] = [];
	for (const row of completionRaw) {
		if (row.completedAt === null) continue;
		const localDate = getTodayString(row.completedAt);
		if (thisWeekDateSet.has(localDate)) {
			completedThisWeek++;
			if (completedThisWeekTitles.length < 5) completedThisWeekTitles.push(row.title);
		} else if (lastWeekDateSet.has(localDate)) {
			completedLastWeek++;
		}
	}
	return {
		completedThisWeek,
		completedLastWeek,
		completedThisWeekTitles,
		openHighPriority: Number(openHighPriorityResult[0]?.count || 0),
		openHighPriorityTitles: openHighPriorityTitlesRaw.map((r) => r.title),
		openTotal: Number(openTotalResult[0]?.count || 0),
		openTotalTitles: openTotalTitlesRaw.map((r) => r.title)
	};
}

export function buildActivityFeed(
	data: Pick<
		QueryData,
		| 'recentJournalRaw'
		| 'recentWorkoutRaw'
		| 'recentMeditationRaw'
		| 'recentTaskRaw'
		| 'recentVisitRaw'
	>
): ActivityItem[] {
	return [
		...data.recentJournalRaw.map((e) => ({
			type: 'journal' as const,
			id: e.id,
			href: `/journal/${e.id}`,
			title: createMarkdownExcerpt(e.content, 80),
			meta: formatTimestampShort(e.createdAt),
			timestamp: e.createdAt
		})),
		...data.recentWorkoutRaw.map((w) => ({
			type: 'workout' as const,
			id: w.id,
			href: '/fitness',
			title: `${getWorkoutLabel(w.type)} Workout`,
			meta: [
				formatDateMedium(w.date),
				w.time ? `@ ${formatTime12Hour(w.time)}` : '',
				w.durationMinutes ? `· ${w.durationMinutes} min` : ''
			]
				.filter(Boolean)
				.join(' '),
			timestamp: w.createdAt
		})),
		...data.recentMeditationRaw.map((s) => ({
			type: 'meditation' as const,
			id: s.id,
			href: '/meditation',
			title: s.routine?.title ?? 'Meditation',
			meta: [
				formatTimestampMedium(s.completedAt),
				s.routine?.durationMinutes ? `· ${s.routine.durationMinutes} min` : ''
			]
				.filter(Boolean)
				.join(' '),
			timestamp: s.completedAt
		})),
		...data.recentTaskRaw
			.filter((t): t is typeof t & { completedAt: Date } => t.completedAt !== null)
			.map((t) => ({
				type: 'task' as const,
				id: t.id,
				href: '/tasks',
				title: t.title,
				meta: formatTimestampShort(t.completedAt),
				timestamp: t.completedAt
			})),
		...data.recentVisitRaw.map((v) => ({
			type: 'visit' as const,
			id: v.id,
			href: '/visits',
			title: `Visit with ${v.person.name}`,
			meta: formatDateMedium(v.date),
			timestamp: v.createdAt
		}))
	]
		.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
		.slice(0, 10);
}

export function buildTodayAgendaSummary(
	entries: QueryData['agendaEntriesForTrend'],
	today: string
) {
	const todayEntries = entries
		.filter((e) => e.date === today)
		.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	return {
		completed: todayEntries.filter((e) => e.completed).length,
		total: todayEntries.length,
		items: todayEntries.map((e) => ({ id: e.id, title: e.title, completed: e.completed }))
	};
}

export function buildDaysSinceLastWorkout(
	workouts: { date: string }[],
	today: string
): number | null {
	const lastWorkoutDate = workouts.reduce<string | null>(
		(latest, w) => (!latest || w.date > latest ? w.date : latest),
		null
	);
	return lastWorkoutDate ? calendarDaysBetween(lastWorkoutDate, today) : null;
}

export function emptyDashboardReturn() {
	return {
		todayLabel: formatTodayLabel(),
		today: getTodayString(),
		todayDowIndex: getISODayOfWeek(getTodayString()),
		stats: {
			journalThisWeek: 0,
			journalLastWeek: 0,
			meditationThisWeek: 0,
			meditationLastWeek: 0,
			workoutsThisWeek: 0,
			workoutsLastWeek: 0,
			workoutsCompletedMonth: 0
		},
		taskStats: {
			completedThisWeek: 0,
			completedLastWeek: 0,
			completedThisWeekTitles: [] as string[],
			openHighPriority: 0,
			openHighPriorityTitles: [] as string[],
			openTotal: 0,
			openTotalTitles: [] as string[]
		},
		dueSoonTasks: [] as { id: string; title: string; dueDate: string }[],
		agendaCompletionTrend: [] as { weekLabel: string; completionPct: number }[],
		workoutTypeBreakdown: [] as { type: string; count: number }[],
		visitHealthCounts: { critical: 0, overdue: 0, healthy: 0, noVisits: 0, total: 0 },
		visitHealthNames: {
			critical: [] as string[],
			overdue: [] as string[],
			healthy: [] as string[],
			noVisits: [] as string[]
		},
		upcomingVisits: [] as { dayLabel: string; names: string[]; isToday: boolean }[],
		recentActivity: [] as ActivityItem[],
		agendaItemStats: [] as {
			title: string;
			completionPct: number;
			prevCompletionPct: number;
			dowCompletionPct: number[];
			last4Days: number;
		}[],
		daysSinceLastWorkout: null as number | null,
		todayAgendaSummary: {
			completed: 0,
			total: 0,
			items: [] as { id: string; title: string; completed: boolean }[]
		},
		dashboardGoals: DEFAULT_DASHBOARD_GOALS
	};
}
