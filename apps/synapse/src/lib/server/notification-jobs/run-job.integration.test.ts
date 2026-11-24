import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../db/schema';
import { createJobClock, firesToday, hasTimePassed } from './clock';
import { isWithinDedupeWindow, runNotificationJob, type Db, type NotificationJob } from './run-job';
import {
	buildTestDb,
	contextAt,
	createFakeNotifier,
	readNotificationLog,
	TEST_USER
} from './test-harness';

describe('createJobClock', () => {
	it('reads the Pacific date, time and weekday when UTC is already tomorrow', () => {
		// Fri 2026-01-09, 7:05 PM PST
		expect(createJobClock(new Date('2026-01-10T03:05:00Z'))).toMatchObject({
			today: '2026-01-09',
			hour: '19',
			minute: '05',
			weekday: 5
		});
	});

	it('uses PDT in summer', () => {
		expect(createJobClock(new Date('2026-07-10T05:37:00Z'))).toMatchObject({
			today: '2026-07-09',
			hour: '22',
			minute: '37',
			weekday: 4
		});
	});
});

describe('hasTimePassed / firesToday', () => {
	const clock = createJobClock(new Date('2026-01-14T15:00:00Z')); // Wed 7:00 AM PST

	it('compares HH:mm against the Pacific time', () => {
		expect(hasTimePassed(clock, '07:00')).toBe(true);
		expect(hasTimePassed(clock, '07:01')).toBe(false);
	});

	it('matches weekly cadences on the Pacific weekday', () => {
		expect(firesToday(clock, 'daily', null)).toBe(true);
		expect(firesToday(clock, 'weekly', '[3]')).toBe(true);
		expect(firesToday(clock, 'weekly', '[4]')).toBe(false);
		expect(firesToday(clock, 'weekly', 'not json')).toBe(false);
	});
});

describe('isWithinDedupeWindow', () => {
	const today = '2026-01-16';

	it("'pacific-day' blocks only the same Pacific day", () => {
		// Jan 16, 8:00 AM PST
		expect(isWithinDedupeWindow(new Date('2026-01-16T16:00:00Z'), today, 'pacific-day')).toBe(true);
		// Jan 15, 11:00 PM PST: UTC date is Jan 16, Pacific day is yesterday
		expect(isWithinDedupeWindow(new Date('2026-01-16T07:00:00Z'), today, 'pacific-day')).toBe(
			false
		);
	});

	it('{ days: 7 } blocks the sending day and the 6 after it', () => {
		// Jan 10, 7:00 AM PST
		expect(isWithinDedupeWindow(new Date('2026-01-10T15:00:00Z'), today, { days: 7 })).toBe(true);
		// Jan 9, 11:37 PM PST: UTC date is Jan 10, Pacific day is 7 days ago
		expect(isWithinDedupeWindow(new Date('2026-01-10T07:37:00Z'), today, { days: 7 })).toBe(false);
	});
});

describe('runNotificationJob', () => {
	const NOW = '2026-01-14T15:00:00Z';
	let db: Db;

	beforeEach(() => {
		db = buildTestDb();
		const at = new Date(NOW);
		db.insert(schema.user)
			.values({
				id: 'user-2',
				name: 'Second',
				email: 'second@example.com',
				createdAt: at,
				updatedAt: at
			})
			.run();
	});

	type Candidate = { id: string; email: string; name: string };
	const users = (): Candidate[] => [
		TEST_USER,
		{ id: 'user-2', name: 'Second', email: 'second@example.com' }
	];

	function job(overrides: Partial<NotificationJob<Candidate>> = {}) {
		return {
			type: 'test_job',
			label: 'test jobs',
			dedupe: 'pacific-day',
			candidates: users,
			recipient: (candidate) => candidate,
			entityId: (candidate) => `entity:${candidate.id}`,
			message: () => ({
				logSubject: 'Logged subject',
				email: { subject: 'Hi', html: '<p>Hi</p>', label: 'test email' },
				push: { message: 'Hi', title: 'Test', tags: 'bell' }
			}),
			...overrides
		} satisfies NotificationJob<Candidate>;
	}

	it('isolates a failing recipient: others are still sent and only successful sends are logged', async () => {
		const notifier = createFakeNotifier({ failEmailTo: TEST_USER.email });

		const result = await runNotificationJob(job(), contextAt(db, NOW), notifier);

		expect(result).toEqual({ sent: 1, failed: 1 });
		expect(notifier.emails.map((e) => e.to)).toEqual(['second@example.com']);
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({
				userId: 'user-2',
				entityId: 'entity:user-2',
				subject: 'Logged subject'
			})
		]);
	});

	it('still logs when the push fails, so the email is not resent', async () => {
		const notifier = createFakeNotifier();
		notifier.push = async () => false;

		await runNotificationJob(job(), contextAt(db, NOW), notifier);

		expect(readNotificationLog(db)).toHaveLength(2);
	});

	it('logs a message with nothing to deliver but does not count it as sent', async () => {
		const notifier = createFakeNotifier();

		const result = await runNotificationJob(
			job({ message: () => ({ logSubject: 'Empty' }) }),
			contextAt(db, NOW),
			notifier
		);

		expect(result).toEqual({ sent: 0, failed: 0 });
		expect(readNotificationLog(db)).toHaveLength(2);
	});

	it('does not log a null message, so a later run tries again', async () => {
		const notifier = createFakeNotifier();

		await runNotificationJob(job({ message: () => null }), contextAt(db, NOW), notifier);

		expect(readNotificationLog(db)).toHaveLength(0);
	});
});
