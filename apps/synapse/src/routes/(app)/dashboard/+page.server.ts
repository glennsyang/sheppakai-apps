import { getUser } from '#lib/server/actions/auth-guard.js';
import { getDashboardGoalsForUser } from '#lib/server/dashboard-goal-settings.js';
import { buildAgendaItemStats, buildDateRanges } from '#lib/server/dashboard/agenda-stats.js';
import {
	buildActivityFeed,
	buildAgendaCompletionTrend,
	buildCountByDateMap,
	buildDaysSinceLastWorkout,
	buildMeditationCountByDate,
	buildTaskStats,
	buildTodayAgendaSummary,
	buildUpcomingVisits,
	buildVisitHealth,
	emptyDashboardReturn,
	sumCountsByDate,
	type UpcomingScheduledOnlyRow
} from '#lib/server/dashboard/builders.js';
import { runDashboardQueries } from '#lib/server/dashboard/queries.js';
import { getDb } from '#lib/server/db/index.js';
import { logger } from '#lib/server/logger.js';
import { getVisitStatusThresholdsForUser } from '#lib/server/visit-status-settings.js';
import { formatTodayLabel, getISODayOfWeek, getTodayString } from '#lib/utils/date.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = getUser(locals);

	const today = getTodayString();
	const ranges = buildDateRanges(today);

	try {
		const db = getDb();
		const [data, visitStatusThresholds, dashboardGoals] = await Promise.all([
			runDashboardQueries(db, user.id, ranges),
			getVisitStatusThresholdsForUser(user.id, db),
			getDashboardGoalsForUser(user.id, db)
		]);

		const journalCountByDate = buildCountByDateMap(data.journalDateCounts);
		const workoutCountByDate = buildCountByDateMap(data.workoutDateCounts);
		const meditationCountByDate = buildMeditationCountByDate(
			data.meditationSessionsInRange,
			ranges.startOfLastWeekDate,
			ranges.endOfThisWeekDate
		);
		const latestVisitByPersonId = new Map(
			data.allVisitsRaw.map((v) => [v.personId, { date: v.date, followUpDate: v.followUpDate }])
		);
		const { counts: visitHealthCounts, names: visitHealthNames } = buildVisitHealth(
			data.allPeopleRaw,
			latestVisitByPersonId,
			today,
			visitStatusThresholds
		);

		return {
			todayLabel: formatTodayLabel(),
			today,
			todayDowIndex: getISODayOfWeek(today),
			stats: {
				journalThisWeek: sumCountsByDate(journalCountByDate, ranges.thisWeekDates),
				journalLastWeek: sumCountsByDate(journalCountByDate, ranges.lastWeekDates),
				meditationThisWeek: sumCountsByDate(meditationCountByDate, ranges.thisWeekDates),
				meditationLastWeek: sumCountsByDate(meditationCountByDate, ranges.lastWeekDates),
				workoutsThisWeek: sumCountsByDate(workoutCountByDate, ranges.thisWeekDates),
				workoutsLastWeek: sumCountsByDate(workoutCountByDate, ranges.lastWeekDates),
				workoutsCompletedMonth: Number(data.workoutCountMonth[0]?.count || 0)
			},
			taskStats: buildTaskStats(
				data.tasksCompletionRaw,
				data.openHighPriorityResult,
				data.openTotalResult,
				data.openHighPriorityTitlesRaw,
				data.openTotalTitlesRaw,
				ranges.thisWeekDates,
				ranges.lastWeekDates
			),
			// The query filters on dueDate, so it is never null here.
			dueSoonTasks: data.dueSoonTasksRaw.flatMap((t) =>
				t.dueDate ? [{ id: t.id, title: t.title, dueDate: t.dueDate }] : []
			),
			agendaCompletionTrend: buildAgendaCompletionTrend(
				data.agendaEntriesForTrend,
				ranges.startOfThisWeekDate
			),
			workoutTypeBreakdown: data.workoutTypeBreakdownRaw
				.map((r) => ({ type: r.type, count: Number(r.count || 0) }))
				.sort((a, b) => b.count - a.count),
			visitHealthCounts,
			visitHealthNames,
			upcomingVisits: buildUpcomingVisits(
				data.upcomingVisitsByDateRaw,
				data.upcomingFollowUpsByDateRaw,
				data.upcomingScheduledOnlyRaw.filter(
					(v): v is UpcomingScheduledOnlyRow => v.scheduledVisitDate !== null
				),
				today
			),
			recentActivity: buildActivityFeed(data),
			agendaItemStats: buildAgendaItemStats(data.agendaEntriesForTrend, ranges),
			daysSinceLastWorkout: buildDaysSinceLastWorkout(data.recentWorkoutRaw, today),
			todayAgendaSummary: buildTodayAgendaSummary(data.agendaEntriesForTrend, today),
			dashboardGoals
		};
	} catch (error) {
		logger.error('Failed to load dashboard data', error);
		return {
			...emptyDashboardReturn(),
			loadError: 'Failed to load dashboard data. Please try refreshing the page.'
		};
	}
};
