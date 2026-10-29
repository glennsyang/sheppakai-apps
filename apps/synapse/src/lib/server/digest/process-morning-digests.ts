import { and, eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';

import { loadDailyAgendaEntriesForDate } from '../daily-agenda';
import { getDb } from '../db';
import { emailNotifications, user } from '../db/schema';
import { loadTasksDueToday } from '../email/digests';
import { logNotification, sendReminderNotification } from '../email/notification-log';
import { loadVisitWarningCandidates } from '../email/visit-warnings';
import { getMorningDigestSettingsByUserIds } from '../morning-digest-settings';
import {
	buildMorningDigestMessage,
	buildMorningDigestTitle,
	isMorningDigestDue,
	MORNING_DIGEST_NOTIFICATION_TYPE,
	MORNING_DIGEST_TAGS,
	type DigestBill,
	type DigestVisit
} from './morning-digest';
import { fetchBillsDueThisWeek, fetchTonightsDinner } from './remote-sections';

async function alreadySentMorningDigest(userId: string, dateString: string): Promise<boolean> {
	const db = getDb();
	const existing = db
		.select({ id: emailNotifications.id })
		.from(emailNotifications)
		.where(
			and(
				eq(emailNotifications.userId, userId),
				eq(emailNotifications.notificationType, MORNING_DIGEST_NOTIFICATION_TYPE),
				eq(emailNotifications.entityId, dateString)
			)
		)
		.get();

	return !!existing;
}

/**
 * Send each opted-in user one combined push once their send time has passed: agenda,
 * tasks due, tonight's dinner (mealplanner), bills due this week (budget) and overdue
 * visits. Dinner and bills are household-wide, so they are fetched once per run; an
 * unreachable app only drops its own section.
 */
export async function processMorningDigests(
	currentHour: string,
	currentMinute: string,
	todayPacific: string
): Promise<void> {
	const db = getDb();
	logger.debug('\n🌅 Processing morning digests...');

	const allUsers = db.select({ id: user.id }).from(user).all();
	const settingsByUserId = await getMorningDigestSettingsByUserIds(
		allUsers.map(({ id }) => id),
		db
	);

	const dueUserIds: string[] = [];
	for (const { id } of allUsers) {
		const settings = settingsByUserId.get(id);
		if (!settings?.enabled) continue;
		if (!isMorningDigestDue(currentHour, currentMinute, settings.sendTime)) continue;
		if (await alreadySentMorningDigest(id, todayPacific)) continue;
		dueUserIds.push(id);
	}

	if (dueUserIds.length === 0) {
		logger.debug('   ⏭️  No morning digests due');
		return;
	}

	const [dinnerResult, billsResult, visitCandidates] = await Promise.all([
		fetchTonightsDinner(todayPacific),
		fetchBillsDueThisWeek(todayPacific),
		loadVisitWarningCandidates()
	]);
	const dinner = dinnerResult.ok ? dinnerResult.value : null;
	const bills: DigestBill[] = billsResult.ok ? billsResult.value : [];

	let sentCount = 0;

	for (const userId of dueUserIds) {
		try {
			const visits: DigestVisit[] = visitCandidates
				.filter((candidate) => candidate.user.id === userId)
				.map((candidate) => ({
					name: candidate.person.name,
					status: candidate.warningStatus,
					lastVisitDate: candidate.lastVisitDate
				}));

			const title = buildMorningDigestTitle(todayPacific);
			const message = buildMorningDigestMessage(
				{
					agenda: await loadDailyAgendaEntriesForDate(userId, todayPacific),
					tasksDue: await loadTasksDueToday(userId, todayPacific),
					dinner,
					bills,
					visits
				},
				todayPacific
			);

			// Log even when every section is empty, so later runs today don't rebuild it.
			if (message) {
				await sendReminderNotification(message, title, MORNING_DIGEST_TAGS);
				sentCount++;
			} else {
				logger.debug('   ⏭️  Morning digest empty; nothing to send', { userId });
			}

			await logNotification(userId, MORNING_DIGEST_NOTIFICATION_TYPE, todayPacific, title);
		} catch (error) {
			logger.error('   ❌ Failed to send morning digest', error, { userId });
		}
	}

	logger.debug(`   📊 Sent ${sentCount} morning digests`);
}
