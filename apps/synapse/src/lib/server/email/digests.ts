import { and, eq, sql } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';

import { getDb } from '../db';
import { emailNotifications, tasks, user } from '../db/schema';
import { DAILY_AGENDA_DIGEST_TIME, isWithinDailyDigestWindow } from './daily-agenda-digest';
import { sendTasksDueTodayEmail } from './index';
import { logNotification } from './notification-log';
import {
	buildTasksDueTodayDigestTitle,
	TASKS_DUE_TODAY_NOTIFICATION_TYPE,
	type TasksDueTodayTaskSummary
} from './tasks-due-today-digest';

async function alreadySentTasksDueTodayDigest(
	userId: string,
	dateString: string
): Promise<boolean> {
	const db = getDb();
	const existing = db
		.select({ id: emailNotifications.id })
		.from(emailNotifications)
		.where(
			and(
				eq(emailNotifications.userId, userId),
				eq(emailNotifications.notificationType, TASKS_DUE_TODAY_NOTIFICATION_TYPE),
				eq(emailNotifications.entityId, dateString)
			)
		)
		.get();

	return !!existing;
}

export async function loadTasksDueToday(
	userId: string,
	dateString: string
): Promise<TasksDueTodayTaskSummary[]> {
	const db = getDb();
	const dueTodayTasks = await db.query.tasks.findMany({
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

	return dueTodayTasks.map((task) => ({
		id: task.id,
		taskNumber: task.taskNumber,
		title: task.title,
		priority: task.priority,
		dueDate: task.dueDate,
		state: task.state
	}));
}

/**
 * Email each user the tasks due today. The phone push for these tasks is part of the
 * morning digest (see #lib/server/digest).
 */
export async function processTasksDueTodayDigests(
	currentHour: string,
	currentMinute: string,
	todayPacific: string
): Promise<void> {
	const db = getDb();
	logger.debug('\n🗂️ Processing Tasks due-today digests...');

	if (!isWithinDailyDigestWindow(currentHour, currentMinute)) {
		logger.debug(`   ⏭️  Before Tasks digest start time (${DAILY_AGENDA_DIGEST_TIME} PT)`);
		return;
	}

	const allUsers = db
		.select({
			id: user.id,
			email: user.email,
			name: user.name
		})
		.from(user)
		.all();

	logger.debug(`   Found ${allUsers.length} users for Tasks due-today digests`);

	let sentCount = 0;

	for (const userData of allUsers) {
		if (await alreadySentTasksDueTodayDigest(userData.id, todayPacific)) {
			logger.debug('   ⏭️  Already sent Tasks due-today digest', {
				userId: userData.id,
				date: todayPacific
			});
			continue;
		}

		const dueTodayTasks = await loadTasksDueToday(userData.id, todayPacific);
		if (dueTodayTasks.length === 0) {
			logger.debug('   ⏭️  No Tasks due today', { userId: userData.id });
			continue;
		}

		const title = buildTasksDueTodayDigestTitle(todayPacific);

		logger.debug('   📧 Sending Tasks due-today digest', {
			userId: userData.id,
			taskCount: dueTodayTasks.length
		});

		try {
			await sendTasksDueTodayEmail(userData.email, userData.name, dueTodayTasks, todayPacific);

			await logNotification(userData.id, TASKS_DUE_TODAY_NOTIFICATION_TYPE, todayPacific, title);

			sentCount++;
			logger.debug('   ✅ Sent successfully');
		} catch (error) {
			logger.error('   ❌ Failed to send Tasks due-today digest', error, { userId: userData.id });
		}
	}

	logger.debug(`   📊 Sent ${sentCount} Tasks due-today digests`);
}
