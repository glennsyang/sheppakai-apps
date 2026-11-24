import { and, eq, sql } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';
import { getVisitStatusThresholdsByUserIds } from '#lib/server/visit-status-settings.js';

import { getDb } from '../db';
import { emailNotifications, people, user, visits } from '../db/schema';
import { sendVisitWarningEmail } from './index';
import { logNotification, sendReminderNotification } from './notification-log';
import {
	buildVisitWarningEntityId,
	buildVisitWarningSubject,
	formatVisitWarningDate,
	getVisitWarningStatus,
	wasVisitWarningSentRecently
} from './visit-warning-utils';

type VisitWarningCandidate = {
	person: typeof people.$inferSelect;
	user: typeof user.$inferSelect;
	lastVisitDate: string;
	warningStatus: 'yellow' | 'critical';
};

/**
 * Non-archived, non-exempt people whose latest visit puts them in yellow/critical status,
 * using each owner's visit-status thresholds. Shared by the warnings job and the morning digest.
 */
export async function loadVisitWarningCandidates(): Promise<VisitWarningCandidate[]> {
	const db = getDb();

	// Get all people with their last visit date
	const allPeople = db
		.select({
			person: people,
			user: user
		})
		.from(people)
		.innerJoin(user, eq(people.userId, user.id))
		.where(eq(people.isArchived, false))
		.all();

	logger.debug(`   Found ${allPeople.length} people to check`);
	const visitThresholdsByUserId = await getVisitStatusThresholdsByUserIds(
		allPeople.map(({ user: userData }) => userData.id),
		db
	);

	const candidates: VisitWarningCandidate[] = [];

	for (const { person, user: userData } of allPeople) {
		if (person.isExempt) {
			logger.debug('   ⏭️  Skipping exempt person', { personId: person.id });
			continue;
		}

		// Get last visit for this person
		const lastVisit = db
			.select()
			.from(visits)
			.where(eq(visits.personId, person.id))
			.orderBy(sql`${visits.date} DESC`)
			.limit(1)
			.get();

		if (!lastVisit) {
			// No visits recorded yet, skip
			continue;
		}

		const warningStatus = getVisitWarningStatus(
			lastVisit.date,
			person.scheduledVisitDate,
			visitThresholdsByUserId.get(userData.id)
		);
		if (!warningStatus) {
			continue;
		}

		candidates.push({ person, user: userData, lastVisitDate: lastVisit.date, warningStatus });
	}

	return candidates;
}

/**
 * Process visit warnings (people in yellow/red visit status)
 */
export async function processVisitWarnings(): Promise<void> {
	const db = getDb();
	logger.debug('\n👥 Processing visit warnings...');

	const candidates = await loadVisitWarningCandidates();

	let sentCount = 0;

	for (const { person, user: userData, lastVisitDate, warningStatus } of candidates) {
		const formattedLastVisitDate = formatVisitWarningDate(lastVisitDate);
		const warningEntityId = buildVisitWarningEntityId(person.id, warningStatus);

		// Check if already sent a warning in the last 7 Pacific days
		const lastWarning = db
			.select({ sentAt: emailNotifications.sentAt })
			.from(emailNotifications)
			.where(
				and(
					eq(emailNotifications.userId, userData.id),
					eq(emailNotifications.notificationType, 'visit_warning'),
					eq(emailNotifications.entityId, warningEntityId)
				)
			)
			.orderBy(sql`${emailNotifications.sentAt} DESC`)
			.get();
		const recentWarning = !!lastWarning && wasVisitWarningSentRecently(lastWarning.sentAt);

		if (recentWarning) {
			logger.debug(`   ⏭️  Already sent ${warningStatus} warning in last 7 days`, {
				personId: person.id
			});
			continue;
		}

		// Send warning email
		logger.debug(`   📧 Sending ${warningStatus} visit warning`, {
			userId: userData.id,
			personId: person.id
		});

		try {
			await sendVisitWarningEmail(
				userData.email,
				userData.name,
				person.name,
				formattedLastVisitDate,
				warningStatus
			);

			const visitNotificationMessage =
				warningStatus === 'critical'
					? `Critical visit warning: ${person.name} needs a visit.`
					: `Visit warning: ${person.name} is due for a visit.`;

			await sendReminderNotification(
				visitNotificationMessage,
				'Synapse - Visit Warning',
				'busts_in_silhouette',
				warningStatus === 'critical' ? 4 : 3
			);

			await logNotification(
				userData.id,
				'visit_warning',
				warningEntityId,
				buildVisitWarningSubject(person.name, warningStatus)
			);

			sentCount++;
			logger.debug(`   ✅ Sent successfully`);
		} catch (error) {
			logger.error(`   ❌ Failed to send:`, error);
		}
	}

	logger.debug(`   📊 Sent ${sentCount} visit warnings`);
}
