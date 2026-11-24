import { and, eq, sql } from 'drizzle-orm';

import { tasks, user } from '../db/schema';
import type { Db, NotificationJob } from '../notification-jobs/run-job';
import { isWithinDailyDigestWindow } from './daily-agenda-digest';
import {
	TASKS_DUE_TODAY_NOTIFICATION_TYPE,
	type TasksDueTodayTaskSummary
} from './tasks-due-today-digest';
import { buildTasksDueTodayEmail } from './templates';

export async function loadTasksDueToday(
	db: Db,
	userId: string,
	dateString: string
): Promise<TasksDueTodayTaskSummary[]> {
	return db.query.tasks.findMany({
		where: and(
			eq(tasks.userId, userId),
			eq(tasks.dueDate, dateString),
			sql`${tasks.state} != 'done'`
		),
		columns: {
			id: true,
			taskNumber: true,
			title: true,
			priority: true,
			dueDate: true,
			state: true
		},
		orderBy: [tasks.priority, tasks.taskNumber]
	});
}

type TasksDueTodayCandidate = { id: string; email: string; name: string };

/**
 * Email each user the tasks due today, from 6:00 AM PT. The phone push for these tasks is
 * part of the morning digest (see #lib/server/digest). Users with nothing due are skipped
 * without logging, so tasks added later today still get an email.
 */
export const tasksDueTodayDigestJob: NotificationJob<TasksDueTodayCandidate> = {
	type: TASKS_DUE_TODAY_NOTIFICATION_TYPE,
	label: 'Tasks due-today digests',
	dedupe: 'pacific-day',
	candidates: ({ db, clock }) =>
		isWithinDailyDigestWindow(clock.hour, clock.minute)
			? db.select({ id: user.id, email: user.email, name: user.name }).from(user).all()
			: [],
	recipient: (candidate) => candidate,
	entityId: (_candidate, { clock }) => clock.today,
	message: async (candidate, { db, clock }) => {
		const dueTodayTasks = await loadTasksDueToday(db, candidate.id, clock.today);
		if (dueTodayTasks.length === 0) return null;

		const email = buildTasksDueTodayEmail(candidate.name, dueTodayTasks, clock.today);
		return { logSubject: email.subject, email };
	}
};
