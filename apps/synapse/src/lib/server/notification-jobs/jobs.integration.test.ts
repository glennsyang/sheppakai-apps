// Each notification job against the real schema (in-memory SQLite), a fixed clock and a fake
// Notifier: what it sends, what it logs, and that a second run the same day sends nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addDaysToDateString } from '#lib/utils/date.js';

import * as schema from '../db/schema';
import type { Db } from './run-job';

const state = vi.hoisted(() => ({ db: null as unknown, dinnerFetches: 0 }));

vi.mock('#lib/server/db/index.js', () => ({ getDb: () => state.db }));
vi.mock('../digest/remote-sections', () => ({
	fetchTonightsDinner: async () => {
		state.dinnerFetches++;
		return { ok: true, value: 'Tacos' };
	},
	fetchBillsDueThisWeek: async () => ({ ok: true, value: [] })
}));

import { morningDigestJob } from '../digest/process-morning-digests';
import { tasksDueTodayDigestJob } from '../email/digests';
import { runEmailNotifications } from '../email/email-notifications';
import { loggingReminderJob, planningReminderJob } from '../email/family-worship-reminders';
import { meditationReminderJob } from '../email/meditation-reminders';
import { scheduledVisitReminderJob, visitTodayReminderJob } from '../email/visit-reminders';
import { visitWarningJob } from '../email/visit-warnings';
import { workoutReminderJob } from '../email/workout-reminders';
import {
	createTopic,
	logSession,
	planWeek,
	setUsualWeekday,
	skipWeek
} from '../family-worship/family-worship';
import { runNotificationJob } from './run-job';
import {
	buildTestDb,
	contextAt,
	createFakeNotifier,
	readNotificationLog,
	TEST_USER,
	type FakeNotifier
} from './test-harness';

// Wednesday 2026-01-14
const MORNING = '2026-01-14T15:00:00Z'; // 7:00 AM PST
const EVENING = '2026-01-15T03:00:00Z'; // 7:00 PM PST, already Jan 15 in UTC
const TODAY = '2026-01-14';

let db: Db;
let notifier: FakeNotifier;

beforeEach(() => {
	db = buildTestDb();
	state.db = db;
	state.dinnerFetches = 0;
	notifier = createFakeNotifier();
});

const created = { createdAt: new Date(MORNING), updatedAt: new Date(MORNING) };

function addPerson(
	id: string,
	{ scheduledVisitDate = null as string | null, isExempt = false, isArchived = false } = {}
) {
	db.insert(schema.people)
		.values({
			id,
			userId: TEST_USER.id,
			name: `Person ${id}`,
			scheduledVisitDate,
			isExempt,
			isArchived,
			...created
		})
		.run();
}

function addVisit(personId: string, date: string) {
	db.insert(schema.visits)
		.values({ personId, userId: TEST_USER.id, date, ...created })
		.run();
}

describe('workoutReminderJob', () => {
	beforeEach(() => {
		db.insert(schema.workoutReminders)
			.values([
				{
					id: 'due',
					userId: TEST_USER.id,
					workoutType: 'strength',
					cadence: 'daily',
					time: '06:30',
					...created
				},
				{
					id: 'later',
					userId: TEST_USER.id,
					workoutType: 'walk',
					cadence: 'daily',
					time: '18:00',
					...created
				},
				// 3 = Wednesday
				{
					id: 'weekly-wed',
					userId: TEST_USER.id,
					workoutType: 'cardio',
					cadence: 'weekly',
					daysOfWeek: '[3]',
					time: '06:00',
					...created
				},
				{
					id: 'weekly-thu',
					userId: TEST_USER.id,
					workoutType: 'hiit',
					cadence: 'weekly',
					daysOfWeek: '[4]',
					time: '06:00',
					...created
				},
				{
					id: 'disabled',
					userId: TEST_USER.id,
					workoutType: 'stretch',
					cadence: 'daily',
					time: '06:00',
					enabled: false,
					...created
				}
			])
			.run();
	});

	it('sends reminders whose time has passed on a matching day, logs them, and sends nothing on a second run', async () => {
		const result = await runNotificationJob(workoutReminderJob, contextAt(db, MORNING), notifier);

		expect(result).toEqual({ sent: 2, failed: 0 });
		expect(notifier.emails.map((e) => e.subject)).toEqual([
			expect.stringContaining('strength workout'),
			expect.stringContaining('cardio workout')
		]);
		expect(notifier.emails[0]).toMatchObject({ to: TEST_USER.email, name: TEST_USER.name });
		expect(notifier.pushes.map((p) => p.message)).toEqual([
			'You scheduled a strength workout for today.',
			'You scheduled a cardio workout for today.'
		]);
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({
				type: 'workout_reminder',
				entityId: 'due',
				subject: 'Time for your strength workout!'
			}),
			expect.objectContaining({ type: 'workout_reminder', entityId: 'weekly-wed' })
		]);

		notifier.reset();
		await runNotificationJob(workoutReminderJob, contextAt(db, '2026-01-14T15:30:00Z'), notifier);
		expect(notifier.emails).toHaveLength(0);
		expect(notifier.pushes).toHaveLength(0);
		expect(readNotificationLog(db)).toHaveLength(2);
	});

	it('sends the evening reminder once its time passes, on the Pacific day', async () => {
		await runNotificationJob(workoutReminderJob, contextAt(db, MORNING), notifier);
		notifier.reset();

		await runNotificationJob(workoutReminderJob, contextAt(db, EVENING), notifier);
		expect(notifier.emails.map((e) => e.subject)).toEqual([
			expect.stringContaining('walk workout')
		]);
	});

	it('fires again the next Pacific day', async () => {
		await runNotificationJob(workoutReminderJob, contextAt(db, MORNING), notifier);
		notifier.reset();

		// Thursday 7:00 AM PST
		await runNotificationJob(workoutReminderJob, contextAt(db, '2026-01-15T15:00:00Z'), notifier);
		expect(notifier.emails.map((e) => e.subject)).toEqual([
			expect.stringContaining('strength workout'),
			expect.stringContaining('hiit workout')
		]);
	});
});

describe('meditationReminderJob', () => {
	beforeEach(() => {
		db.insert(schema.meditationRoutines)
			.values({
				id: 'routine',
				title: 'Body Scan',
				linkUrl: 'https://example.com',
				durationMinutes: 10,
				moodTags: '[]',
				...created
			})
			.run();
		db.insert(schema.meditationSchedules)
			.values([
				{
					id: 'morning',
					userId: TEST_USER.id,
					routineId: 'routine',
					cadence: 'daily',
					time: '06:45',
					...created
				},
				{
					id: 'night',
					userId: TEST_USER.id,
					routineId: 'routine',
					cadence: 'daily',
					time: '21:00',
					...created
				}
			])
			.run();
	});

	it('sends due schedules, logs them, and sends nothing on a second run', async () => {
		const result = await runNotificationJob(
			meditationReminderJob,
			contextAt(db, MORNING),
			notifier
		);

		expect(result).toEqual({ sent: 1, failed: 0 });
		expect(notifier.emails).toEqual([
			expect.objectContaining({
				subject: '[Synapse] 🧘 Time for your meditation practice',
				to: TEST_USER.email
			})
		]);
		expect(notifier.pushes).toEqual([
			expect.objectContaining({
				message: 'Meditation reminder: Body Scan at 06:45.',
				tags: 'lotus_position_man'
			})
		]);
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({ type: 'meditation_reminder', entityId: 'morning' })
		]);

		notifier.reset();
		await runNotificationJob(meditationReminderJob, contextAt(db, MORNING), notifier);
		expect(notifier.emails).toHaveLength(0);
		expect(readNotificationLog(db)).toHaveLength(1);
	});
});

describe('visitWarningJob', () => {
	beforeEach(() => {
		addPerson('yellow');
		addVisit('yellow', addDaysToDateString(TODAY, -300));
		addPerson('critical');
		addVisit('critical', addDaysToDateString(TODAY, -400));
		addPerson('recent');
		addVisit('recent', addDaysToDateString(TODAY, -30));
		addPerson('exempt', { isExempt: true });
		addVisit('exempt', addDaysToDateString(TODAY, -400));
		addPerson('never-visited');
	});

	it('warns for Overdue and Critical group members, logs them, and sends nothing on a second run', async () => {
		const result = await runNotificationJob(visitWarningJob, contextAt(db, MORNING), notifier);

		expect(result).toEqual({ sent: 2, failed: 0 });
		expect(notifier.pushes).toEqual([
			expect.objectContaining({
				message: 'Visit warning: Person yellow is due for a visit.',
				priority: 3
			}),
			expect.objectContaining({
				message: 'Critical visit warning: Person critical needs a visit.',
				priority: 4
			})
		]);
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({
				type: 'visit_warning',
				entityId: 'yellow:yellow',
				subject: 'Status: Yellow Warning for Person yellow'
			}),
			expect.objectContaining({ type: 'visit_warning', entityId: 'critical:critical' })
		]);

		notifier.reset();
		await runNotificationJob(visitWarningJob, contextAt(db, EVENING), notifier);
		expect(notifier.emails).toHaveLength(0);
	});

	it('repeats at most once every 7 Pacific days', async () => {
		await runNotificationJob(visitWarningJob, contextAt(db, MORNING), notifier);
		notifier.reset();

		// Jan 20, 11:00 PM PST: day 6
		await runNotificationJob(visitWarningJob, contextAt(db, '2026-01-21T07:00:00Z'), notifier);
		expect(notifier.emails).toHaveLength(0);

		// Jan 21, 6:00 AM PST: day 7
		await runNotificationJob(visitWarningJob, contextAt(db, '2026-01-21T14:00:00Z'), notifier);
		expect(notifier.emails).toHaveLength(2);
	});
});

describe('visitTodayReminderJob', () => {
	it("reminds on the day of a group member's Next Visit, logs it, and sends nothing on a second run", async () => {
		addPerson('today', { scheduledVisitDate: TODAY });
		addPerson('tomorrow', { scheduledVisitDate: '2026-01-15' });
		addPerson('archived', { scheduledVisitDate: TODAY, isArchived: true });
		addPerson('exempt', { scheduledVisitDate: TODAY, isExempt: true });

		const result = await runNotificationJob(
			visitTodayReminderJob,
			contextAt(db, MORNING),
			notifier
		);

		expect(result).toEqual({ sent: 1, failed: 0 });
		expect(notifier.emails).toEqual([
			expect.objectContaining({ subject: '[Synapse] 🗓️ You have a visit with Person today today' })
		]);
		expect(notifier.pushes[0].message).toBe(
			'You have a visit with Person today today, January 14, 2026.'
		);
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({
				type: 'visit_today_reminder',
				entityId: 'visit_today:person:today'
			})
		]);

		notifier.reset();
		await runNotificationJob(visitTodayReminderJob, contextAt(db, EVENING), notifier);
		expect(notifier.emails).toHaveLength(0);
	});
});

describe('scheduledVisitReminderJob', () => {
	beforeEach(() => {
		addPerson('in-7', { scheduledVisitDate: '2026-01-21' });
		addPerson('in-8', { scheduledVisitDate: '2026-01-22' });
	});

	it('reminds one week before the Next Visit, logs it, and sends nothing on a second run', async () => {
		const result = await runNotificationJob(
			scheduledVisitReminderJob,
			contextAt(db, MORNING),
			notifier
		);

		expect(result).toEqual({ sent: 1, failed: 0 });
		expect(notifier.pushes[0].message).toBe(
			'Upcoming visit with Person in-7 is scheduled for January 21, 2026.'
		);
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({
				type: 'scheduled_visit_reminder',
				entityId: 'scheduled_visit:person:in-7'
			})
		]);

		notifier.reset();
		await runNotificationJob(scheduledVisitReminderJob, contextAt(db, EVENING), notifier);
		expect(notifier.emails).toHaveLength(0);
	});

	it('counts the week from the Pacific date on evening runs (#355)', async () => {
		await runNotificationJob(scheduledVisitReminderJob, contextAt(db, EVENING), notifier);

		expect(readNotificationLog(db).map((row) => row.entityId)).toEqual([
			'scheduled_visit:person:in-7'
		]);
	});
});

describe('tasksDueTodayDigestJob', () => {
	beforeEach(() => {
		db.insert(schema.tasks)
			.values([
				{
					id: 't1',
					userId: TEST_USER.id,
					taskNumber: 1,
					title: 'File taxes',
					dueDate: TODAY,
					priority: 1,
					...created
				},
				{
					id: 't2',
					userId: TEST_USER.id,
					taskNumber: 2,
					title: 'Done already',
					dueDate: TODAY,
					priority: 1,
					state: 'done',
					...created
				},
				{
					id: 't3',
					userId: TEST_USER.id,
					taskNumber: 3,
					title: 'Next week',
					dueDate: '2026-01-21',
					priority: 1,
					...created
				}
			])
			.run();
	});

	it('emails the open tasks due today, logs it, and sends nothing on a second run', async () => {
		const result = await runNotificationJob(
			tasksDueTodayDigestJob,
			contextAt(db, MORNING),
			notifier
		);

		expect(result).toEqual({ sent: 1, failed: 0 });
		expect(notifier.pushes).toHaveLength(0);
		expect(notifier.emails).toHaveLength(1);
		expect(notifier.emails[0].html).toContain('File taxes');
		expect(notifier.emails[0].html).not.toContain('Done already');
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({
				type: 'tasks_due_today_digest',
				entityId: TODAY,
				subject: notifier.emails[0].subject
			})
		]);

		notifier.reset();
		await runNotificationJob(tasksDueTodayDigestJob, contextAt(db, EVENING), notifier);
		expect(notifier.emails).toHaveLength(0);
	});

	it('waits until 6:00 AM PT', async () => {
		await runNotificationJob(
			tasksDueTodayDigestJob,
			contextAt(db, '2026-01-14T13:37:00Z'),
			notifier
		);
		expect(notifier.emails).toHaveLength(0);
		expect(readNotificationLog(db)).toHaveLength(0);
	});

	it('skips without logging when nothing is due, so a task added later today still gets an email', async () => {
		db.delete(schema.tasks).run();
		await runNotificationJob(tasksDueTodayDigestJob, contextAt(db, MORNING), notifier);
		expect(readNotificationLog(db)).toHaveLength(0);
	});
});

describe('morningDigestJob', () => {
	it('pushes one digest after the send time, logs it, and sends nothing on a second run', async () => {
		db.insert(schema.tasks)
			.values({
				id: 't1',
				userId: TEST_USER.id,
				taskNumber: 1,
				title: 'File taxes',
				dueDate: TODAY,
				priority: 1,
				...created
			})
			.run();

		const result = await runNotificationJob(morningDigestJob, contextAt(db, MORNING), notifier);

		expect(result).toEqual({ sent: 1, failed: 0 });
		expect(notifier.emails).toHaveLength(0);
		expect(notifier.pushes).toHaveLength(1);
		expect(notifier.pushes[0].tags).toBe('sunrise');
		expect(notifier.pushes[0].message).toContain('File taxes');
		expect(notifier.pushes[0].message).toContain('Tacos');
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({ type: 'morning_digest', entityId: TODAY })
		]);

		notifier.reset();
		await runNotificationJob(morningDigestJob, contextAt(db, EVENING), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});

	it('fetches the household sections once per run, and not at all when nobody is due', async () => {
		const at = new Date(MORNING);
		db.insert(schema.user)
			.values({
				id: 'user-2',
				name: 'Second',
				email: 'second@example.com',
				createdAt: at,
				updatedAt: at
			})
			.run();

		await runNotificationJob(morningDigestJob, contextAt(db, MORNING), notifier);
		expect(notifier.pushes).toHaveLength(2);
		expect(state.dinnerFetches).toBe(1);

		await runNotificationJob(morningDigestJob, contextAt(db, MORNING), notifier);
		expect(state.dinnerFetches).toBe(1);
	});

	it("respects a user's send time and opt-out", async () => {
		db.insert(schema.morningDigestSettings)
			.values({ userId: TEST_USER.id, enabled: true, sendTime: '08:00' })
			.run();
		await runNotificationJob(morningDigestJob, contextAt(db, MORNING), notifier);
		expect(notifier.pushes).toHaveLength(0);

		db.update(schema.morningDigestSettings).set({ enabled: false, sendTime: '06:00' }).run();
		await runNotificationJob(morningDigestJob, contextAt(db, MORNING), notifier);
		expect(notifier.pushes).toHaveLength(0);
		expect(readNotificationLog(db)).toHaveLength(0);
	});
});

// Family Worship: week of Monday 2026-01-12; the default Usual Weekday is Wednesday 2026-01-14.
const FW_WEEK = '2026-01-12';
const MONDAY_BEFORE_FIVE = '2026-01-13T00:55:00Z'; // Mon 4:55 PM PST
const MONDAY_AFTER_FIVE = '2026-01-13T01:05:00Z'; // Mon 5:05 PM PST
const MONDAY_LATE = '2026-01-13T07:00:00Z'; // Mon 11:00 PM PST
const THURSDAY_BEFORE_NINE = '2026-01-15T16:55:00Z'; // Thu 8:55 AM PST
const THURSDAY_AFTER_NINE = '2026-01-15T17:05:00Z'; // Thu 9:05 AM PST

function addTopic(title: string) {
	return createTopic(
		db,
		TEST_USER.id,
		{
			title,
			description: `${title} study`,
			notes: null,
			scriptureReferences: null,
			publicationLinks: []
		},
		{ now: new Date(MORNING) }
	);
}

describe('planningReminderJob', () => {
	beforeEach(() => {
		addTopic('Psalm 23');
		addTopic('Being content');
	});

	it('sends on Monday after 5pm for an empty week, naming the top of the queue, once', async () => {
		const result = await runNotificationJob(
			planningReminderJob,
			contextAt(db, MONDAY_AFTER_FIVE),
			notifier
		);

		expect(result).toEqual({ sent: 1, failed: 0 });
		expect(notifier.pushes[0].message).toContain('Psalm 23');
		expect(notifier.pushes[0].click).toMatch(/\/family-worship$/);
		expect(notifier.emails[0].html).toContain('Psalm 23');
		expect(notifier.emails[0].html).toContain('/family-worship');
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({ type: 'family_worship_planning_reminder', entityId: FW_WEEK })
		]);

		notifier.reset();
		await runNotificationJob(planningReminderJob, contextAt(db, MONDAY_LATE), notifier);
		expect(notifier.pushes).toHaveLength(0);
		expect(notifier.emails).toHaveLength(0);
	});

	it('sends again the next Monday for the new week', async () => {
		await runNotificationJob(planningReminderJob, contextAt(db, MONDAY_AFTER_FIVE), notifier);
		notifier.reset();

		await runNotificationJob(planningReminderJob, contextAt(db, '2026-01-20T01:05:00Z'), notifier);
		expect(notifier.pushes).toHaveLength(1);
	});

	it('does not send before 5pm or on another day', async () => {
		await runNotificationJob(planningReminderJob, contextAt(db, MONDAY_BEFORE_FIVE), notifier);
		await runNotificationJob(planningReminderJob, contextAt(db, '2026-01-14T01:05:00Z'), notifier);
		expect(notifier.pushes).toHaveLength(0);
		expect(readNotificationLog(db)).toHaveLength(0);
	});

	it('does not send when the week is planned', async () => {
		const topic = addTopic('Kindness');
		planWeek(db, TEST_USER.id, FW_WEEK, topic.id, { now: new Date(MORNING) });

		await runNotificationJob(planningReminderJob, contextAt(db, MONDAY_AFTER_FIVE), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});

	it('does not send when a session is already logged this week', async () => {
		const topic = addTopic('Kindness');
		// Monday 2026-01-12, 10:00 AM PST: logged earlier the same day.
		logSession(
			db,
			TEST_USER.id,
			{ date: FW_WEEK, topicId: topic.id, note: null },
			{ now: new Date('2026-01-12T18:00:00Z') }
		);

		await runNotificationJob(planningReminderJob, contextAt(db, MONDAY_AFTER_FIVE), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});

	it('does not send for a Skipped Week', async () => {
		skipWeek(db, TEST_USER.id, FW_WEEK, 'Convention', { now: new Date(MORNING) });

		await runNotificationJob(planningReminderJob, contextAt(db, MONDAY_AFTER_FIVE), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});

	it('does not send to a user with no Family Worship topics', async () => {
		db.delete(schema.familyWorshipTopics).run();

		await runNotificationJob(planningReminderJob, contextAt(db, MONDAY_AFTER_FIVE), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});
});

describe('loggingReminderJob', () => {
	let topicId: string;

	beforeEach(() => {
		topicId = addTopic('Psalm 23').id;
		planWeek(db, TEST_USER.id, FW_WEEK, topicId, { now: new Date(MORNING) });
	});

	it('sends the morning after the Usual Weekday, naming the planned topic, once', async () => {
		const result = await runNotificationJob(
			loggingReminderJob,
			contextAt(db, THURSDAY_AFTER_NINE),
			notifier
		);

		expect(result).toEqual({ sent: 1, failed: 0 });
		expect(notifier.pushes[0].message).toContain('Psalm 23');
		expect(notifier.pushes[0].click).toMatch(/\/family-worship$/);
		expect(notifier.emails[0].html).toContain('Psalm 23');
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({ type: 'family_worship_logging_reminder', entityId: FW_WEEK })
		]);

		notifier.reset();
		await runNotificationJob(loggingReminderJob, contextAt(db, '2026-01-16T03:00:00Z'), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});

	it('does not send before 9am', async () => {
		await runNotificationJob(loggingReminderJob, contextAt(db, THURSDAY_BEFORE_NINE), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});

	it('does not send once a session is logged', async () => {
		logSession(db, TEST_USER.id, { date: TODAY, topicId, note: null }, { now: new Date(EVENING) });

		await runNotificationJob(loggingReminderJob, contextAt(db, THURSDAY_AFTER_NINE), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});

	it('does not send for a Skipped Week', async () => {
		skipWeek(db, TEST_USER.id, FW_WEEK, null, { now: new Date(MORNING) });

		await runNotificationJob(loggingReminderJob, contextAt(db, THURSDAY_AFTER_NINE), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});

	it('follows a changed Usual Weekday, checking the Sunday week on Monday morning', async () => {
		await setUsualWeekday(db, TEST_USER.id, 0);

		await runNotificationJob(loggingReminderJob, contextAt(db, THURSDAY_AFTER_NINE), notifier);
		expect(notifier.pushes).toHaveLength(0);

		// Monday 2026-01-19 9:05 AM PST: the Sunday (18th) belongs to the week of the 12th.
		await runNotificationJob(loggingReminderJob, contextAt(db, '2026-01-19T17:05:00Z'), notifier);
		expect(notifier.pushes).toHaveLength(1);
		expect(notifier.pushes[0].message).toContain('Psalm 23');
		expect(readNotificationLog(db)).toEqual([
			expect.objectContaining({ type: 'family_worship_logging_reminder', entityId: FW_WEEK })
		]);
	});

	it('does not send on the Monday after a logged Sunday session', async () => {
		await setUsualWeekday(db, TEST_USER.id, 0);
		logSession(
			db,
			TEST_USER.id,
			{ date: '2026-01-18', topicId, note: null },
			{ now: new Date('2026-01-19T03:00:00Z') }
		);

		await runNotificationJob(loggingReminderJob, contextAt(db, '2026-01-19T17:05:00Z'), notifier);
		expect(notifier.pushes).toHaveLength(0);
	});
});

describe('morningDigestJob Family Worship line', () => {
	let topicId: string;

	beforeEach(() => {
		topicId = addTopic('Psalm 23').id;
	});

	it('names the planned topic on the Usual Weekday', async () => {
		planWeek(db, TEST_USER.id, FW_WEEK, topicId, { now: new Date(MORNING) });

		await runNotificationJob(morningDigestJob, contextAt(db, MORNING), notifier);
		expect(notifier.pushes[0].message).toContain('📖 Family Worship tonight: Psalm 23');
	});

	it('leaves the line out on another weekday', async () => {
		planWeek(db, TEST_USER.id, FW_WEEK, topicId, { now: new Date(MORNING) });
		await setUsualWeekday(db, TEST_USER.id, 4);

		await runNotificationJob(morningDigestJob, contextAt(db, MORNING), notifier);
		expect(notifier.pushes[0].message).not.toContain('Family Worship');
	});

	it('leaves the line out when the week has no plan or is skipped', async () => {
		await runNotificationJob(morningDigestJob, contextAt(db, MORNING), notifier);
		expect(notifier.pushes[0].message).not.toContain('Family Worship');

		db.delete(schema.emailNotifications).run();
		notifier.reset();
		skipWeek(db, TEST_USER.id, FW_WEEK, null, { now: new Date(MORNING) });
		await runNotificationJob(morningDigestJob, contextAt(db, MORNING), notifier);
		expect(notifier.pushes[0].message).not.toContain('Family Worship');
	});
});

describe('runEmailNotifications', () => {
	it('runs every job with one clock and is idempotent within a Pacific day', async () => {
		addPerson('today', { scheduledVisitDate: TODAY });

		const first = await runEmailNotifications({ now: new Date(MORNING), db, notifier });
		expect(first).toEqual({ ok: true });
		const logged = readNotificationLog(db);
		expect(logged.map((row) => row.type).sort()).toEqual([
			'morning_digest',
			'visit_today_reminder'
		]);
		expect(logged.every((row) => row.sentAt.getTime() === new Date(MORNING).getTime())).toBe(true);

		notifier.reset();
		await runEmailNotifications({ now: new Date(EVENING), db, notifier });
		expect(notifier.emails).toHaveLength(0);
		expect(notifier.pushes).toHaveLength(0);
	});
});
