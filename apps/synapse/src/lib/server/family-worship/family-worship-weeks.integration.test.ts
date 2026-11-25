// Planned Weeks, Family Worship Sessions and Skipped Weeks, run through the Family Worship module
// against the app's real schema and migrations in in-memory SQLite.
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../db/schema';
import type { Db } from '../notification-jobs/run-job';
import { buildTestDb, TEST_USER } from '../notification-jobs/test-harness';
import {
	clearWeek,
	createTopic,
	deleteSession,
	deleteTopic,
	getHistory,
	getPlan,
	getThisWeek,
	getTopicHistory,
	getTopicQueue,
	logSession,
	planWeek,
	setUsualWeekday,
	skipWeek,
	unskipWeek,
	updateSession,
	weekStartOf
} from './family-worship';

const OTHER_USER = { id: 'user-2', name: 'Other', email: 'other@example.com' };
// Tuesday 24 Nov 2026, noon Pacific. This week starts Monday 23 Nov.
const NOW = new Date('2026-11-24T20:00:00Z');
const TODAY = '2026-11-24';
const W0 = '2026-11-23';
const W1 = '2026-11-30';
const W2 = '2026-12-07';
const W3 = '2026-12-14';
const W4 = '2026-12-21';
const LAST_WEEK = '2026-11-16';

let db: Db;
const me = TEST_USER.id;

beforeEach(() => {
	db = buildTestDb();
	db.insert(schema.user)
		.values({ ...OTHER_USER, createdAt: NOW, updatedAt: NOW })
		.run();
});

function topic(title: string, userId = me) {
	return createTopic(
		db,
		userId,
		{ title, description: title, notes: null, scriptureReferences: null, publicationLinks: [] },
		{ now: NOW }
	);
}

const queue = (userId = me) => getTopicQueue(db, userId).map((t) => t.title);
const opts = { now: NOW };

function planTitles(weeks = 5) {
	return getPlan(db, me, { today: TODAY, weeks, lookbackWeeks: 0 }).map((row) => ({
		week: row.weekStart,
		planned: row.plannedTopic?.title ?? null,
		suggestion: row.suggestion?.title ?? null
	}));
}

function log(date: string, topicId: string, extra: Partial<Parameters<typeof logSession>[2]> = {}) {
	return logSession(db, me, { date, topicId, note: null, ...extra }, opts);
}

describe('weeks', () => {
	it('identifies a week by its Monday, using Pacific calendar dates', () => {
		expect(weekStartOf('2026-11-29')).toBe(W0); // Sunday belongs to the week before
		expect(weekStartOf('2026-11-30')).toBe(W1); // Monday starts a new week
	});

	it('shows each week on the Usual Weekday', async () => {
		expect(getPlan(db, me, { today: TODAY, weeks: 2, lookbackWeeks: 0 })).toMatchObject([
			{ weekStart: W0, date: '2026-11-25', isCurrent: true },
			{ weekStart: W1, date: '2026-12-02', isCurrent: false }
		]);

		await setUsualWeekday(db, me, 0); // Sunday ends the week
		expect(getPlan(db, me, { today: TODAY, weeks: 1, lookbackWeeks: 0 })[0]?.date).toBe(
			'2026-11-29'
		);
	});

	it('counts a session for the week of its Pacific date, across the Sunday-Monday midnight', () => {
		const a = topic('Prayer');
		// 07:30 UTC Monday is still 23:30 Sunday in Pacific time.
		const lateSunday = new Date('2026-11-30T07:30:00Z');
		const earlyMonday = new Date('2026-11-30T08:30:00Z');

		const first = logSession(
			db,
			me,
			{ date: '2026-11-29', topicId: a.id, note: null },
			{ now: lateSunday }
		);
		expect(first.ok).toBe(true);
		// On Sunday night Pacific, Monday is still in the future.
		expect(
			logSession(db, me, { date: '2026-11-30', topicId: a.id, note: null }, { now: lateSunday })
		).toEqual({ ok: false, reason: 'future_date' });
		// An hour later it is Monday, a new week, so a second session is allowed.
		expect(
			logSession(db, me, { date: '2026-11-30', topicId: a.id, note: null }, { now: earlyMonday }).ok
		).toBe(true);
		expect(
			getHistory(db, me)
				.flatMap((m) => m.entries)
				.map((e) => e.date)
		).toEqual(['2026-11-30', '2026-11-29']);
	});
});

describe('planning', () => {
	it('sends a planned topic to the back of the queue; clearing returns it to the front', () => {
		const a = topic('Prayer');
		topic('Kindness');
		topic('Patience');

		expect(planWeek(db, me, W0, a.id, opts)).toEqual({ ok: true });
		expect(queue()).toEqual(['Kindness', 'Patience', 'Prayer']);

		expect(clearWeek(db, me, W0, opts)).toEqual({ ok: true });
		expect(queue()).toEqual(['Prayer', 'Kindness', 'Patience']);
		expect(planTitles(1)[0]?.planned).toBeNull();
	});

	it('changes a planned topic, returning the old one to the front', () => {
		const a = topic('Prayer');
		const b = topic('Kindness');
		topic('Patience');

		planWeek(db, me, W0, a.id, opts);
		planWeek(db, me, W0, b.id, opts);

		expect(planTitles(1)[0]?.planned).toBe('Kindness');
		expect(queue()).toEqual(['Prayer', 'Patience', 'Kindness']);
	});

	it('only returns a multi-week topic to the front when no later week still has it', () => {
		const a = topic('Prayer');
		topic('Kindness');

		planWeek(db, me, W0, a.id, opts);
		planWeek(db, me, W1, a.id, opts);
		expect(queue()).toEqual(['Kindness', 'Prayer']);

		clearWeek(db, me, W0, opts);
		expect(queue()).toEqual(['Kindness', 'Prayer']);

		clearWeek(db, me, W1, opts);
		expect(queue()).toEqual(['Prayer', 'Kindness']);
	});

	it('suggests the next unplanned topic for each empty week, without storing it', () => {
		const a = topic('Prayer');
		topic('Kindness');
		topic('Patience');
		topic('Faith');

		planWeek(db, me, W1, a.id, opts);

		expect(planTitles(4)).toEqual([
			{ week: W0, planned: null, suggestion: 'Kindness' },
			{ week: W1, planned: 'Prayer', suggestion: null },
			{ week: W2, planned: null, suggestion: 'Patience' },
			{ week: W3, planned: null, suggestion: 'Faith' }
		]);
		expect(db.select().from(schema.familyWorshipPlannedWeeks).all()).toHaveLength(1);
	});

	it('runs out of suggestions when every topic is planned', () => {
		const a = topic('Prayer');
		planWeek(db, me, W1, a.id, opts);

		expect(planTitles(2)[0]?.suggestion).toBeNull();
	});

	it('refuses a date that is not a week start, an archived or unknown topic, and a skipped week', () => {
		const a = topic('Prayer');

		expect(planWeek(db, me, '2026-11-24', a.id, opts)).toEqual({
			ok: false,
			reason: 'invalid_week'
		});
		expect(planWeek(db, me, W0, 'missing', opts)).toEqual({ ok: false, reason: 'not_found' });

		skipWeek(db, me, W0, null, opts);
		expect(planWeek(db, me, W0, a.id, opts)).toEqual({ ok: false, reason: 'week_skipped' });
	});

	it('lists recent past weeks that are unlogged, but not logged or skipped ones', () => {
		const a = topic('Prayer');
		planWeek(db, me, LAST_WEEK, a.id, opts);
		skipWeek(db, me, '2026-11-09', 'Assembly', opts);
		log('2026-11-04', a.id);

		const past = getPlan(db, me, { today: TODAY, weeks: 1, lookbackWeeks: 4 }).filter(
			(row) => row.isPast
		);

		expect(past.map((row) => [row.weekStart, row.plannedTopic?.title ?? null])).toEqual([
			['2026-10-26', null],
			[LAST_WEEK, 'Prayer']
		]);
		expect(past.every((row) => row.suggestion === null)).toBe(true);
	});
});

describe('logging sessions', () => {
	it('records the session, keeps the topic active and leaves the plan as it was', () => {
		const a = topic('Prayer');
		topic('Kindness');
		planWeek(db, me, W0, a.id, opts);

		const result = log(TODAY, a.id, { note: 'Read Matthew 6' });

		expect(result).toEqual({ ok: true, sessionId: expect.any(String) });
		expect(getThisWeek(db, me, TODAY)).toMatchObject({
			plannedTopic: { title: 'Prayer' },
			session: { date: TODAY, topicTitle: 'Prayer', note: 'Read Matthew 6' }
		});
		expect(queue()).toEqual(['Kindness', 'Prayer']);
	});

	it('plans the topic when the week had no plan', () => {
		const a = topic('Prayer');
		topic('Kindness');

		log(TODAY, a.id);

		expect(getThisWeek(db, me, TODAY).plannedTopic?.title).toBe('Prayer');
		expect(queue()).toEqual(['Kindness', 'Prayer']);
	});

	it('rejects a second session in the same week, pointing at the existing one', () => {
		const a = topic('Prayer');
		const first = log('2026-11-23', a.id);
		if (!first.ok) throw new Error('first log failed');

		expect(log(TODAY, a.id)).toEqual({
			ok: false,
			reason: 'week_has_session',
			sessionId: first.sessionId
		});
	});

	it('rewrites the plan when a different topic is logged, returning the planned one to the front', () => {
		const a = topic('Prayer');
		const b = topic('Kindness');
		topic('Patience');
		planWeek(db, me, W0, a.id, opts);

		log(TODAY, b.id);

		expect(getThisWeek(db, me, TODAY).plannedTopic?.title).toBe('Kindness');
		expect(queue()).toEqual(['Prayer', 'Patience', 'Kindness']);
	});

	it('asks for confirmation before logging into a Skipped Week, then removes the skip', () => {
		const a = topic('Prayer');
		skipWeek(db, me, W0, 'Illness', opts);

		expect(log(TODAY, a.id)).toEqual({ ok: false, reason: 'week_skipped' });
		expect(getThisWeek(db, me, TODAY).session).toBeNull();

		expect(log(TODAY, a.id, { confirmUnskip: true }).ok).toBe(true);
		expect(getThisWeek(db, me, TODAY)).toMatchObject({ skip: null, session: { topicId: a.id } });
	});

	it('refuses a future date and an archived or unknown topic', () => {
		const a = topic('Prayer');

		expect(log('2026-11-25', a.id)).toEqual({ ok: false, reason: 'future_date' });
		expect(log(TODAY, 'missing')).toEqual({ ok: false, reason: 'not_found' });
	});
});

describe('continue next week', () => {
	it('plans the same topic for next week when it is empty', () => {
		const a = topic('Prayer');
		topic('Kindness');

		log(TODAY, a.id, { continueNextWeek: true });

		expect(planTitles(2).map((row) => row.planned)).toEqual(['Prayer', 'Prayer']);
	});

	it('asks to replace or shift when next week holds a different topic, without writing anything', () => {
		const a = topic('Prayer');
		const b = topic('Kindness');
		planWeek(db, me, W1, b.id, opts);

		expect(log(TODAY, a.id, { continueNextWeek: true })).toEqual({
			ok: false,
			reason: 'next_week_conflict',
			topicTitle: 'Kindness'
		});
		expect(getThisWeek(db, me, TODAY).session).toBeNull();
	});

	it('replace: next week takes the topic and the replaced one goes to the front', () => {
		const a = topic('Prayer');
		const b = topic('Kindness');
		topic('Patience');
		planWeek(db, me, W1, b.id, opts);

		log(TODAY, a.id, { continueNextWeek: true, nextWeekConflict: 'replace' });

		expect(planTitles(3).map((row) => row.planned)).toEqual(['Prayer', 'Prayer', null]);
		expect(queue()).toEqual(['Kindness', 'Patience', 'Prayer']);
	});

	it('shift: every later Planned Week moves back one week, stepping over a Skipped Week', () => {
		const a = topic('Prayer');
		const b = topic('Kindness');
		const c = topic('Patience');
		planWeek(db, me, W1, b.id, opts);
		planWeek(db, me, W2, c.id, opts);
		skipWeek(db, me, W3, 'Assembly', opts);

		log(TODAY, a.id, { continueNextWeek: true, nextWeekConflict: 'shift' });

		expect(planTitles(5).map((row) => [row.week, row.planned])).toEqual([
			[W0, 'Prayer'],
			[W1, 'Prayer'],
			[W2, 'Kindness'],
			[W3, null],
			[W4, 'Patience']
		]);
	});

	it('refuses when next week is skipped', () => {
		const a = topic('Prayer');
		skipWeek(db, me, W1, null, opts);

		expect(log(TODAY, a.id, { continueNextWeek: true })).toEqual({
			ok: false,
			reason: 'next_week_skipped'
		});
	});
});

describe('editing and deleting sessions', () => {
	it('edits the note, and a new topic rewrites the plan', () => {
		const a = topic('Prayer');
		const b = topic('Kindness');
		const logged = log(TODAY, a.id);
		if (!logged.ok) throw new Error('log failed');

		expect(
			updateSession(db, me, logged.sessionId, { date: TODAY, topicId: b.id, note: 'Fixed' }, opts)
		).toEqual({ ok: true });

		expect(getThisWeek(db, me, TODAY)).toMatchObject({
			plannedTopic: { title: 'Kindness' },
			session: { topicTitle: 'Kindness', note: 'Fixed' }
		});
		expect(queue()).toEqual(['Prayer', 'Kindness']);
	});

	it('refuses moving a session into a week that already has one', () => {
		const a = topic('Prayer');
		log('2026-11-18', a.id);
		const thisWeek = log(TODAY, a.id);
		if (!thisWeek.ok) throw new Error('log failed');

		expect(
			updateSession(
				db,
				me,
				thisWeek.sessionId,
				{ date: '2026-11-17', topicId: a.id, note: null },
				opts
			)
		).toMatchObject({ ok: false, reason: 'week_has_session' });
	});

	it('deletes a session and leaves the plan', () => {
		const a = topic('Prayer');
		const logged = log(TODAY, a.id);
		if (!logged.ok) throw new Error('log failed');

		expect(deleteSession(db, me, logged.sessionId)).toEqual({ ok: true });
		expect(getThisWeek(db, me, TODAY)).toMatchObject({
			session: null,
			plannedTopic: { title: 'Prayer' }
		});
	});
});

describe('skipping weeks', () => {
	it('returns the planned topic to the front and leaves later weeks alone', () => {
		const a = topic('Prayer');
		const b = topic('Kindness');
		topic('Patience');
		planWeek(db, me, W0, a.id, opts);
		planWeek(db, me, W1, b.id, opts);

		expect(skipWeek(db, me, W0, 'Travel', opts)).toEqual({ ok: true });

		expect(planTitles(2).map((row) => row.planned)).toEqual([null, 'Kindness']);
		expect(getThisWeek(db, me, TODAY).skip).toEqual({ reason: 'Travel' });
		expect(queue()).toEqual(['Prayer', 'Patience', 'Kindness']);
	});

	it('can be undone', () => {
		skipWeek(db, me, W0, null, opts);
		expect(unskipWeek(db, me, W0)).toEqual({ ok: true });
		expect(getThisWeek(db, me, TODAY).skip).toBeNull();
	});

	it('refuses a week that already has a session', () => {
		const a = topic('Prayer');
		log(TODAY, a.id);

		expect(skipWeek(db, me, W0, null, opts)).toEqual({ ok: false, reason: 'week_has_session' });
	});
});

describe('history', () => {
	it("lists a topic's sessions with the count and last date", () => {
		const a = topic('Prayer');
		const b = topic('Kindness');
		log('2026-11-04', a.id);
		log('2026-11-11', b.id);
		log(TODAY, a.id);

		expect(getTopicHistory(db, me, a.id)).toMatchObject({
			topic: { title: 'Prayer' },
			count: 2,
			lastDate: TODAY,
			sessions: [{ date: TODAY }, { date: '2026-11-04' }]
		});
		expect(getTopicHistory(db, me, 'missing')).toBeNull();
	});

	it('groups sessions and Skipped Weeks by month, newest first, and filters by topic', () => {
		const a = topic('Prayer');
		const b = topic('Kindness');
		log('2026-10-28', a.id);
		skipWeek(db, me, '2026-11-02', 'Assembly', opts);
		log('2026-11-11', b.id);

		expect(
			getHistory(db, me).map((m) => [m.month, m.entries.map((e) => [e.kind, e.date])])
		).toEqual([
			[
				'2026-11',
				[
					['session', '2026-11-11'],
					['skip', '2026-11-04']
				]
			],
			['2026-10', [['session', '2026-10-28']]]
		]);
		expect(getHistory(db, me, { topicId: a.id }).flatMap((m) => m.entries)).toMatchObject([
			{ kind: 'session', topicTitle: 'Prayer' }
		]);
	});
});

describe('deleting topics', () => {
	it('refuses to delete a topic with sessions', () => {
		const a = topic('Prayer');
		log(TODAY, a.id);

		expect(deleteTopic(db, me, a.id)).toEqual({ ok: false, reason: 'has_sessions' });
	});

	it('deletes a topic that is only planned, with its Planned Weeks', () => {
		const a = topic('Prayer');
		planWeek(db, me, W1, a.id, opts);

		expect(deleteTopic(db, me, a.id)).toEqual({ ok: true });
		expect(db.select().from(schema.familyWorshipPlannedWeeks).all()).toEqual([]);
	});

	it('still lets a user with sessions be deleted', () => {
		const a = topic('Prayer');
		log(TODAY, a.id, { continueNextWeek: true });
		skipWeek(db, me, W2, null, opts);

		db.delete(schema.user).where(eq(schema.user.id, me)).run();

		expect(db.select().from(schema.familyWorshipSessions).all()).toEqual([]);
		expect(db.select().from(schema.familyWorshipTopics).all()).toEqual([]);
	});
});

describe('records are per user', () => {
	it("never plans, logs or edits with another user's topics or sessions", () => {
		const mine = topic('Prayer');
		const theirs = topic('Kindness', OTHER_USER.id);
		const theirSession = logSession(
			db,
			OTHER_USER.id,
			{ date: TODAY, topicId: theirs.id, note: null },
			opts
		);
		if (!theirSession.ok) throw new Error('log failed');

		expect(planWeek(db, me, W0, theirs.id, opts)).toEqual({ ok: false, reason: 'not_found' });
		expect(log(TODAY, theirs.id)).toEqual({ ok: false, reason: 'not_found' });
		expect(
			updateSession(
				db,
				me,
				theirSession.sessionId,
				{ date: TODAY, topicId: mine.id, note: null },
				opts
			)
		).toEqual({ ok: false, reason: 'not_found' });
		expect(deleteSession(db, me, theirSession.sessionId)).toEqual({
			ok: false,
			reason: 'not_found'
		});

		// Their week having a session doesn't block mine.
		expect(log(TODAY, mine.id).ok).toBe(true);
		expect(getHistory(db, me).flatMap((m) => m.entries)).toHaveLength(1);
		expect(getThisWeek(db, OTHER_USER.id, TODAY).session?.topicTitle).toBe('Kindness');
	});
});
