import { and, eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';

import { getDb } from '../db';
import { people, user } from '../db/schema';
import { sendScheduledVisitReminderEmail, sendVisitTodayReminderEmail } from './index';
import { alreadySentToday, logNotification, sendReminderNotification } from './notification-log';
import {
	buildScheduledVisitReminderEntityIdForPerson,
	buildScheduledVisitReminderSubject,
	buildVisitTodayReminderEntityIdForPerson,
	buildVisitTodayReminderSubject,
	formatReminderDate,
	getDateDaysAhead,
	SCHEDULED_VISIT_REMINDER_NOTIFICATION_TYPE,
	VISIT_TODAY_REMINDER_NOTIFICATION_TYPE
} from './scheduled-visit-reminder-utils';

/**
 * Process reminders for group members whose Next Visit is today
 */
export async function processVisitsTodayReminders(todayPacific: string): Promise<void> {
	const db = getDb();
	logger.debug("\n🗓️ Processing today's visit reminders...");

	let sentCount = 0;

	// Find all group members whose Next Visit is today
	const todayNextVisits = db
		.select({
			person: people,
			user: user
		})
		.from(people)
		.innerJoin(user, eq(people.userId, user.id))
		.where(and(eq(people.scheduledVisitDate, todayPacific), eq(people.isArchived, false)))
		.all();

	logger.debug(`   Found ${todayNextVisits.length} Next Visits for today`);

	for (const { person, user: userData } of todayNextVisits) {
		if (person.isExempt) {
			logger.debug('   ⏭️  Skipping exempt person', { personId: person.id });
			continue;
		}

		const entityId = buildVisitTodayReminderEntityIdForPerson(person.id);

		if (await alreadySentToday(userData.id, VISIT_TODAY_REMINDER_NOTIFICATION_TYPE, entityId)) {
			logger.debug('   ⏭️  Already sent today reminder today', { personId: person.id });
			continue;
		}

		const formattedDate = formatReminderDate(todayPacific);
		const subject = buildVisitTodayReminderSubject(person.name);

		logger.debug('   📧 Sending visit-today reminder', {
			userId: userData.id,
			personId: person.id,
			date: todayPacific
		});

		try {
			await sendVisitTodayReminderEmail(userData.email, userData.name, person.name, formattedDate);

			await sendReminderNotification(
				`You have a visit with ${person.name} today, ${formattedDate}.`,
				'Synapse - Visit Today',
				'busts_in_silhouette',
				3
			);

			await logNotification(userData.id, VISIT_TODAY_REMINDER_NOTIFICATION_TYPE, entityId, subject);

			sentCount++;
			logger.debug(`   ✅ Sent successfully`);
		} catch (error) {
			logger.error(`   ❌ Failed to send:`, error);
		}
	}

	logger.debug(`   📊 Sent ${sentCount} visit-today reminders`);
}

/**
 * Process upcoming visit reminders (one week before a group member's Next Visit)
 */
export async function processScheduledVisitReminders(): Promise<void> {
	const db = getDb();
	logger.debug('\n📅 Processing scheduled visit reminders...');

	const oneWeekFromNow = getDateDaysAhead(new Date(), 7);
	logger.debug(`   Looking for Next Visits on ${oneWeekFromNow}`);

	let sentCount = 0;

	// Find all group members whose Next Visit is exactly one week from today
	const upcomingNextVisits = db
		.select({
			person: people,
			user: user
		})
		.from(people)
		.innerJoin(user, eq(people.userId, user.id))
		.where(and(eq(people.scheduledVisitDate, oneWeekFromNow), eq(people.isArchived, false)))
		.all();

	logger.debug(`   Found ${upcomingNextVisits.length} Next Visits in one week`);

	for (const { person, user: userData } of upcomingNextVisits) {
		if (person.isExempt) {
			logger.debug('   ⏭️  Skipping exempt person', { personId: person.id });
			continue;
		}

		const entityId = buildScheduledVisitReminderEntityIdForPerson(person.id);

		// Check if we already sent a reminder for this person
		if (await alreadySentToday(userData.id, SCHEDULED_VISIT_REMINDER_NOTIFICATION_TYPE, entityId)) {
			logger.debug('   ⏭️  Already sent reminder today', { personId: person.id });
			continue;
		}

		const formattedNextVisitDate = formatReminderDate(oneWeekFromNow);
		const subject = buildScheduledVisitReminderSubject(person.name);

		logger.debug('   📧 Sending scheduled visit reminder', {
			userId: userData.id,
			personId: person.id,
			date: oneWeekFromNow
		});

		try {
			await sendScheduledVisitReminderEmail(
				userData.email,
				userData.name,
				person.name,
				formattedNextVisitDate
			);

			await sendReminderNotification(
				`Upcoming visit with ${person.name} is scheduled for ${formattedNextVisitDate}.`,
				'Synapse - Upcoming Visit',
				'calendar',
				3
			);

			await logNotification(
				userData.id,
				SCHEDULED_VISIT_REMINDER_NOTIFICATION_TYPE,
				entityId,
				subject
			);

			sentCount++;
			logger.debug(`   ✅ Sent successfully`);
		} catch (error) {
			logger.error(`   ❌ Failed to send:`, error);
		}
	}

	logger.debug(`   📊 Sent ${sentCount} scheduled visit reminders`);
}
