import { and, desc, eq, gte, lt, lte, ne, sql } from 'drizzle-orm';

import type { getDb } from '#lib/server/db/index.js';
import {
	dailyAgendaEntries,
	journalEntries,
	meditationSessions,
	people,
	tasks,
	visits,
	workoutLogs
} from '#lib/server/db/schema/index.js';

import type { DashboardDateRanges } from './agenda-stats';

/** Every query the dashboard load needs, run in parallel. */
export async function runDashboardQueries(
	db: ReturnType<typeof getDb>,
	userId: string,
	r: DashboardDateRanges
) {
	const [
		journalDateCounts,
		workoutDateCounts,
		meditationSessionsInRange,
		workoutCountMonth,
		recentJournalRaw,
		recentWorkoutRaw,
		recentMeditationRaw,
		agendaEntriesForTrend,
		tasksCompletionRaw,
		openHighPriorityResult,
		openTotalResult,
		dueSoonTasksRaw,
		openHighPriorityTitlesRaw,
		openTotalTitlesRaw,
		workoutTypeBreakdownRaw,
		allPeopleRaw,
		allVisitsRaw,
		recentTaskRaw,
		recentVisitRaw,
		upcomingVisitsByDateRaw,
		upcomingFollowUpsByDateRaw,
		upcomingScheduledOnlyRaw
	] = await Promise.all([
		db
			.select({ date: journalEntries.date, count: sql<number>`count(*)` })
			.from(journalEntries)
			.where(
				and(
					eq(journalEntries.userId, userId),
					gte(journalEntries.date, r.startOfLastWeekDate),
					sql`${journalEntries.date} < ${r.endOfThisWeekDate}`
				)
			)
			.groupBy(journalEntries.date),
		db
			.select({ date: workoutLogs.date, count: sql<number>`count(*)` })
			.from(workoutLogs)
			.where(
				and(
					eq(workoutLogs.userId, userId),
					gte(workoutLogs.date, r.startOfLastWeekDate),
					sql`${workoutLogs.date} < ${r.endOfThisWeekDate}`
				)
			)
			.groupBy(workoutLogs.date),
		db
			.select({ completedAt: meditationSessions.completedAt })
			.from(meditationSessions)
			.where(
				and(
					eq(meditationSessions.userId, userId),
					gte(meditationSessions.completedAt, r.meditationRangeStart),
					lt(meditationSessions.completedAt, r.meditationRangeEnd)
				)
			),
		db
			.select({ count: sql<number>`count(*)` })
			.from(workoutLogs)
			.where(and(eq(workoutLogs.userId, userId), gte(workoutLogs.date, r.startOfMonthDate))),
		db.query.journalEntries.findMany({
			where: eq(journalEntries.userId, userId),
			orderBy: [desc(journalEntries.createdAt)],
			limit: 5
		}),
		db.query.workoutLogs.findMany({
			where: eq(workoutLogs.userId, userId),
			orderBy: [desc(workoutLogs.createdAt)],
			limit: 5
		}),
		db.query.meditationSessions.findMany({
			where: eq(meditationSessions.userId, userId),
			orderBy: [desc(meditationSessions.completedAt)],
			limit: 5,
			with: { routine: true }
		}),
		db
			.select({
				id: dailyAgendaEntries.id,
				date: dailyAgendaEntries.date,
				completed: dailyAgendaEntries.completed,
				title: dailyAgendaEntries.title,
				templateGroupId: dailyAgendaEntries.templateGroupId,
				sortOrder: dailyAgendaEntries.sortOrder
			})
			.from(dailyAgendaEntries)
			.where(
				and(
					eq(dailyAgendaEntries.userId, userId),
					gte(dailyAgendaEntries.date, r.agenda8WeeksStart),
					sql`${dailyAgendaEntries.date} < ${r.endOfThisWeekDate}`
				)
			),
		db
			.select({ title: tasks.title, completedAt: tasks.completedAt })
			.from(tasks)
			.where(
				and(
					eq(tasks.userId, userId),
					eq(tasks.state, 'done'),
					gte(tasks.completedAt, r.tasksCompletionRangeStart),
					lt(tasks.completedAt, r.tasksCompletionRangeEnd)
				)
			),
		db
			.select({ count: sql<number>`count(*)` })
			.from(tasks)
			.where(and(eq(tasks.userId, userId), ne(tasks.state, 'done'), lte(tasks.priority, 2))),
		db
			.select({ count: sql<number>`count(*)` })
			.from(tasks)
			.where(and(eq(tasks.userId, userId), ne(tasks.state, 'done'))),
		db
			.select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate })
			.from(tasks)
			.where(
				and(
					eq(tasks.userId, userId),
					ne(tasks.state, 'done'),
					gte(tasks.dueDate, r.today),
					lte(tasks.dueDate, r.dueSoonEndDate)
				)
			)
			.orderBy(tasks.dueDate)
			.limit(6),
		db
			.select({ title: tasks.title })
			.from(tasks)
			.where(and(eq(tasks.userId, userId), ne(tasks.state, 'done'), lte(tasks.priority, 2)))
			.orderBy(tasks.priority, tasks.dueDate)
			.limit(5),
		db
			.select({ title: tasks.title })
			.from(tasks)
			.where(and(eq(tasks.userId, userId), ne(tasks.state, 'done')))
			.orderBy(tasks.dueDate, tasks.priority)
			.limit(5),
		db
			.select({ type: workoutLogs.type, count: sql<number>`count(*)` })
			.from(workoutLogs)
			.where(and(eq(workoutLogs.userId, userId), gte(workoutLogs.date, r.workout4WeeksStart)))
			.groupBy(workoutLogs.type),
		db
			.select({
				id: people.id,
				name: people.name,
				isExempt: people.isExempt,
				scheduledVisitDate: people.scheduledVisitDate
			})
			.from(people)
			.where(and(eq(people.userId, userId), eq(people.isArchived, false))),
		(() => {
			const subq = db
				.select({
					personId: visits.personId,
					date: visits.date,
					followUpDate: visits.followUpDate,
					rn: sql<number>`row_number() over (partition by ${visits.personId} order by ${visits.date} desc, ${visits.createdAt} desc)`.as(
						'rn'
					)
				})
				.from(visits)
				.innerJoin(people, and(eq(visits.personId, people.id), eq(people.isArchived, false)))
				.where(eq(visits.userId, userId))
				.as('latest_visits_subq');
			return db
				.select({ personId: subq.personId, date: subq.date, followUpDate: subq.followUpDate })
				.from(subq)
				.where(sql`${subq.rn} = 1`);
		})(),
		db.query.tasks.findMany({
			where: and(eq(tasks.userId, userId), eq(tasks.state, 'done')),
			orderBy: [desc(tasks.completedAt)],
			limit: 5
		}),
		db.query.visits.findMany({
			where: eq(visits.userId, userId),
			orderBy: [desc(visits.createdAt)],
			limit: 5,
			with: { person: { columns: { name: true } } }
		}),
		db
			.select({ personId: visits.personId, personName: people.name, date: visits.date })
			.from(visits)
			.innerJoin(people, and(eq(visits.personId, people.id), eq(people.isArchived, false)))
			.where(
				and(
					eq(visits.userId, userId),
					gte(visits.date, r.today),
					lte(visits.date, r.upcomingEndDate)
				)
			)
			.orderBy(visits.date),
		db
			.select({
				personId: visits.personId,
				personName: people.name,
				followUpDate: visits.followUpDate
			})
			.from(visits)
			.innerJoin(people, and(eq(visits.personId, people.id), eq(people.isArchived, false)))
			.where(
				and(
					eq(visits.userId, userId),
					gte(visits.followUpDate, r.today),
					lte(visits.followUpDate, r.upcomingEndDate)
				)
			)
			.orderBy(visits.followUpDate),
		db
			.select({
				personId: people.id,
				personName: people.name,
				scheduledVisitDate: people.scheduledVisitDate
			})
			.from(people)
			.where(
				and(
					eq(people.userId, userId),
					eq(people.isArchived, false),
					gte(people.scheduledVisitDate, r.today),
					lte(people.scheduledVisitDate, r.upcomingEndDate)
				)
			)
			.orderBy(people.scheduledVisitDate)
	]);

	return {
		journalDateCounts,
		workoutDateCounts,
		meditationSessionsInRange,
		workoutCountMonth,
		recentJournalRaw,
		recentWorkoutRaw,
		recentMeditationRaw,
		agendaEntriesForTrend,
		tasksCompletionRaw,
		openHighPriorityResult,
		openTotalResult,
		dueSoonTasksRaw,
		openHighPriorityTitlesRaw,
		openTotalTitlesRaw,
		workoutTypeBreakdownRaw,
		allPeopleRaw,
		allVisitsRaw,
		recentTaskRaw,
		recentVisitRaw,
		upcomingVisitsByDateRaw,
		upcomingFollowUpsByDateRaw,
		upcomingScheduledOnlyRaw
	};
}

export type QueryData = Awaited<ReturnType<typeof runDashboardQueries>>;
