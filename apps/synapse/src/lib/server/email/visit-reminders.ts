import { and, eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';

import { getDb } from '../db';
import { people, user, visits } from '../db/schema';
import { sendScheduledVisitReminderEmail, sendVisitTodayReminderEmail } from './index';
import { alreadySentToday, logNotification, sendReminderNotification } from './notification-log';
import {
	buildScheduledVisitReminderEntityId,
	buildScheduledVisitReminderEntityIdForPerson,
	buildScheduledVisitReminderSubject,
	buildVisitTodayReminderEntityId,
	buildVisitTodayReminderEntityIdForPerson,
	buildVisitTodayReminderSubject,
	formatReminderDate,
	getDateDaysAhead,
	SCHEDULED_VISIT_REMINDER_NOTIFICATION_TYPE,
	VISIT_TODAY_REMINDER_NOTIFICATION_TYPE
} from './scheduled-visit-reminder-utils';

/**
 * Process visit reminders for visits scheduled today
 */
export async function processVisitsTodayReminders(todayPacific: string): Promise<void> {
	const db = getDb();
	logger.debug("\n🗓️ Processing today's visit reminders...");

	// Find all visits where followUpDate is today
	const todayVisits = db
		.select({
			visit: visits,
			person: people,
			user: user
		})
		.from(visits)
		.innerJoin(people, eq(visits.personId, people.id))
		.innerJoin(user, eq(visits.userId, user.id))
		.where(and(eq(visits.followUpDate, todayPacific), eq(people.isArchived, false)))
		.all();

	logger.debug(`   Found ${todayVisits.length} visits scheduled for today`);

	let sentCount = 0;

	for (const { visit, person, user: userData } of todayVisits) {
		if (person.isExempt) {
			logger.debug('   ⏭️  Skipping exempt person', { personId: person.id });
			continue;
		}

		const entityId = buildVisitTodayReminderEntityId(visit.id);

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

	// Find all people (with no logged visits yet) scheduled for today
	const todayScheduledOnly = db
		.select({
			person: people,
			user: user
		})
		.from(people)
		.innerJoin(user, eq(people.userId, user.id))
		.where(and(eq(people.scheduledVisitDate, todayPacific), eq(people.isArchived, false)))
		.all();

	logger.debug(`   Found ${todayScheduledOnly.length} scheduled-only visits for today`);

	for (const { person, user: userData } of todayScheduledOnly) {
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
 * Process scheduled visit reminders (one week before follow-up date)
 */
export async function processScheduledVisitReminders(): Promise<void> {
	const db = getDb();
	logger.debug('\n📅 Processing scheduled visit reminders...');

	const oneWeekFromNow = getDateDaysAhead(new Date(), 7);
	logger.debug(`   Looking for visits with followUpDate = ${oneWeekFromNow}`);

	// Find all visits where followUpDate is exactly one week from today
	const upcomingVisits = db
		.select({
			visit: visits,
			person: people,
			user: user
		})
		.from(visits)
		.innerJoin(people, eq(visits.personId, people.id))
		.innerJoin(user, eq(visits.userId, user.id))
		.where(and(eq(visits.followUpDate, oneWeekFromNow), eq(people.isArchived, false)))
		.all();

	logger.debug(`   Found ${upcomingVisits.length} upcoming visits in one week`);

	let sentCount = 0;

	for (const { visit, person, user: userData } of upcomingVisits) {
		if (person.isExempt) {
			logger.debug('   ⏭️  Skipping exempt person', { personId: person.id });
			continue;
		}

		const entityId = buildScheduledVisitReminderEntityId(visit.id);

		// Check if we already sent a reminder for this visit
		if (await alreadySentToday(userData.id, SCHEDULED_VISIT_REMINDER_NOTIFICATION_TYPE, entityId)) {
			logger.debug('   ⏭️  Already sent reminder today', { personId: person.id });
			continue;
		}

		const formattedFollowUpDate = formatReminderDate(oneWeekFromNow);
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
				formattedFollowUpDate
			);

			await sendReminderNotification(
				`Upcoming visit with ${person.name} is scheduled for ${formattedFollowUpDate}.`,
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

	// Find all people (with no logged visits yet) scheduled for exactly one week from today
	const upcomingScheduledOnly = db
		.select({
			person: people,
			user: user
		})
		.from(people)
		.innerJoin(user, eq(people.userId, user.id))
		.where(and(eq(people.scheduledVisitDate, oneWeekFromNow), eq(people.isArchived, false)))
		.all();

	logger.debug(`   Found ${upcomingScheduledOnly.length} scheduled-only visits in one week`);

	for (const { person, user: userData } of upcomingScheduledOnly) {
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

		const formattedFollowUpDate = formatReminderDate(oneWeekFromNow);
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
				formattedFollowUpDate
			);

			await sendReminderNotification(
				`Upcoming visit with ${person.name} is scheduled for ${formattedFollowUpDate}.`,
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
