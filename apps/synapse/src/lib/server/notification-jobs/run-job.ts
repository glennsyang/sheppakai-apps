import { and, desc, eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';
import { addDaysToDateString, getTodayString } from '#lib/utils/date.js';

import type { getDb } from '../db';
import { emailNotifications } from '../db/schema';
import type { JobClock } from './clock';
import type { EmailContent, Notifier, PushMessage } from './notifier';

export type Db = ReturnType<typeof getDb>;

export type JobContext = { db: Db; clock: JobClock };

/**
 * How long a sent notification blocks another one for the same user, type and entity:
 * - `'pacific-day'`: until the next Pacific day.
 * - `{ days: n }`: until n Pacific days have passed (sent on day D → may resend on D + n).
 */
export type DedupePolicy = 'pacific-day' | { days: number };

export type JobRecipient = { id: string; email: string; name: string };

/**
 * What to deliver for one candidate. `logSubject` is written to the notification log.
 * A message with neither `email` nor `push` is logged only, which still blocks repeats.
 */
export type JobMessage = {
	logSubject: string;
	email?: EmailContent;
	push?: PushMessage;
};

/**
 * One reminder or digest job. The runner owns the clock, dedupe, notification log and
 * per-recipient error isolation; the job only says who is due and what to tell them.
 */
export type NotificationJob<Candidate> = {
	/** `notificationType` in the notification log. */
	type: string;
	/** Name used in log lines. */
	label: string;
	dedupe: DedupePolicy;
	candidates(ctx: JobContext): Promise<Candidate[]> | Candidate[];
	recipient(candidate: Candidate): JobRecipient;
	entityId(candidate: Candidate, ctx: JobContext): string;
	/** `null` skips the candidate without logging, so a later run can try again. */
	message(candidate: Candidate, ctx: JobContext): Promise<JobMessage | null> | JobMessage | null;
};

export type JobRunResult = { sent: number; failed: number };

function dedupeDays(policy: DedupePolicy): number {
	return policy === 'pacific-day' ? 1 : policy.days;
}

/** Whether a notification sent at `sentAt` still blocks a resend under `policy` on `today`. */
export function isWithinDedupeWindow(sentAt: Date, today: string, policy: DedupePolicy): boolean {
	return getTodayString(sentAt) > addDaysToDateString(today, -dedupeDays(policy));
}

function alreadySent(
	{ db, clock }: JobContext,
	userId: string,
	type: string,
	entityId: string,
	policy: DedupePolicy
): boolean {
	const latest = db
		.select({ sentAt: emailNotifications.sentAt })
		.from(emailNotifications)
		.where(
			and(
				eq(emailNotifications.userId, userId),
				eq(emailNotifications.notificationType, type),
				eq(emailNotifications.entityId, entityId)
			)
		)
		.orderBy(desc(emailNotifications.sentAt))
		.get();

	return !!latest && isWithinDedupeWindow(latest.sentAt, clock.today, policy);
}

async function deliver(
	notifier: Notifier,
	recipient: JobRecipient,
	message: JobMessage
): Promise<boolean> {
	if (message.email) {
		await notifier.email({ to: recipient.email, name: recipient.name, ...message.email });
	}

	if (message.push && !(await notifier.push(message.push))) {
		logger.warn('Reminder notification could not be delivered', {
			title: message.push.title,
			message: message.push.message
		});
	}

	return !!(message.email || message.push);
}

export async function runNotificationJob<Candidate>(
	job: NotificationJob<Candidate>,
	ctx: JobContext,
	notifier: Notifier
): Promise<JobRunResult> {
	logger.debug(`\n🔔 Processing ${job.label}...`);

	const due: { candidate: Candidate; recipient: JobRecipient; entityId: string }[] = [];
	for (const candidate of await job.candidates(ctx)) {
		const recipient = job.recipient(candidate);
		const entityId = job.entityId(candidate, ctx);
		if (alreadySent(ctx, recipient.id, job.type, entityId, job.dedupe)) {
			logger.debug('   ⏭️  Already sent', { userId: recipient.id, entityId });
			continue;
		}
		due.push({ candidate, recipient, entityId });
	}

	const result: JobRunResult = { sent: 0, failed: 0 };
	if (due.length === 0) {
		logger.debug(`   ⏭️  No ${job.label} due`);
		return result;
	}

	for (const { candidate, recipient, entityId } of due) {
		try {
			const message = await job.message(candidate, ctx);
			if (!message) continue;

			if (await deliver(notifier, recipient, message)) {
				result.sent++;
			}

			ctx.db
				.insert(emailNotifications)
				.values({
					userId: recipient.id,
					notificationType: job.type,
					entityId,
					sentAt: ctx.clock.now,
					emailSubject: message.logSubject
				})
				.run();
		} catch (error) {
			result.failed++;
			logger.error(`   ❌ Failed to send ${job.label}`, error, { userId: recipient.id, entityId });
		}
	}

	logger.debug(`   📊 Sent ${result.sent} ${job.label}`);
	return result;
}
