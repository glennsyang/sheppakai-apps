// Runs the Family Worship module against the app's real schema and migrations in in-memory SQLite.
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../db/schema';
import type { Db } from '../notification-jobs/run-job';
import { buildTestDb, TEST_USER } from '../notification-jobs/test-harness';
import {
	archiveTopic,
	createTopic,
	deleteTopic,
	getArchivedTopics,
	getTopicQueue,
	getUsualWeekday,
	reorderTopicQueue,
	restoreTopic,
	setUsualWeekday,
	type TopicFields,
	updateTopic
} from './family-worship';

const OTHER_USER = { id: 'user-2', name: 'Other', email: 'other@example.com' };
const T0 = new Date('2026-11-24T10:00:00Z');
const T1 = new Date('2026-11-24T11:00:00Z');
const T2 = new Date('2026-11-24T12:00:00Z');

let db: Db;

beforeEach(() => {
	db = buildTestDb();
	db.insert(schema.user)
		.values({ ...OTHER_USER, createdAt: T0, updatedAt: T0 })
		.run();
});

function fields(title: string, overrides: Partial<TopicFields> = {}): TopicFields {
	return {
		title,
		description: `About ${title}`,
		notes: null,
		scriptureReferences: null,
		publicationLinks: [],
		...overrides
	};
}

function create(title: string, userId = TEST_USER.id) {
	return createTopic(db, userId, fields(title), { now: T0 });
}

function queueTitles(userId = TEST_USER.id) {
	return getTopicQueue(db, userId).map((topic) => topic.title);
}

describe('createTopic', () => {
	it('appends each new topic to the back of the Topic Queue', () => {
		create('Prayer');
		create('Kindness');
		create('Patience');

		expect(queueTitles()).toEqual(['Prayer', 'Kindness', 'Patience']);
	});

	it('keeps every field, with publication links as a list', () => {
		const topic = createTopic(
			db,
			TEST_USER.id,
			fields('Prayer', {
				notes: 'Start with the model prayer',
				scriptureReferences: 'Matthew 6:9-13',
				publicationLinks: [{ label: 'Article', url: 'https://example.com/prayer' }]
			}),
			{ now: T0 }
		);

		expect(getTopicQueue(db, TEST_USER.id)).toEqual([
			expect.objectContaining({
				id: topic.id,
				title: 'Prayer',
				description: 'About Prayer',
				notes: 'Start with the model prayer',
				scriptureReferences: 'Matthew 6:9-13',
				publicationLinks: [{ label: 'Article', url: 'https://example.com/prayer' }]
			})
		]);
	});
});

describe('reorderTopicQueue', () => {
	it('persists the new order', () => {
		const a = create('Prayer');
		const b = create('Kindness');
		const c = create('Patience');

		expect(reorderTopicQueue(db, TEST_USER.id, [c.id, a.id, b.id])).toEqual({ ok: true });

		expect(queueTitles()).toEqual(['Patience', 'Prayer', 'Kindness']);
	});

	it('refuses an order that is not exactly the active topics, and leaves the queue alone', () => {
		const a = create('Prayer');
		const b = create('Kindness');
		create('Patience');

		expect(reorderTopicQueue(db, TEST_USER.id, [b.id, a.id])).toEqual({
			ok: false,
			reason: 'stale_queue'
		});
		expect(queueTitles()).toEqual(['Prayer', 'Kindness', 'Patience']);
	});
});

describe('archiveTopic and restoreTopic', () => {
	it('drops an archived topic from the queue and closes the gap', () => {
		create('Prayer');
		const b = create('Kindness');
		create('Patience');

		expect(archiveTopic(db, TEST_USER.id, b.id, { now: T1 })).toEqual({ ok: true });

		expect(queueTitles()).toEqual(['Prayer', 'Patience']);
		expect(getTopicQueue(db, TEST_USER.id).map((topic) => topic.queuePosition)).toEqual([0, 1]);
	});

	it('lists archived topics, most recently archived first', () => {
		const a = create('Prayer');
		const b = create('Kindness');
		create('Patience');

		archiveTopic(db, TEST_USER.id, a.id, { now: T1 });
		archiveTopic(db, TEST_USER.id, b.id, { now: T2 });

		expect(getArchivedTopics(db, TEST_USER.id)).toEqual([
			expect.objectContaining({ title: 'Kindness', isArchived: true, archivedAt: T2 }),
			expect.objectContaining({ title: 'Prayer', isArchived: true, archivedAt: T1 })
		]);
	});

	it('restores an archived topic to the back of the queue', () => {
		const a = create('Prayer');
		create('Kindness');
		archiveTopic(db, TEST_USER.id, a.id, { now: T1 });
		create('Patience');

		expect(restoreTopic(db, TEST_USER.id, a.id, { now: T2 })).toEqual({ ok: true });

		expect(queueTitles()).toEqual(['Kindness', 'Patience', 'Prayer']);
		expect(getArchivedTopics(db, TEST_USER.id)).toEqual([]);
	});

	it('reports an unknown topic as not found', () => {
		expect(archiveTopic(db, TEST_USER.id, 'missing')).toEqual({ ok: false, reason: 'not_found' });
		expect(restoreTopic(db, TEST_USER.id, 'missing')).toEqual({ ok: false, reason: 'not_found' });
	});
});

describe('updateTopic', () => {
	it('changes the given fields, keeps the rest and keeps the queue position', () => {
		create('Prayer');
		const b = create('Kindness');

		const result = updateTopic(
			db,
			TEST_USER.id,
			b.id,
			{
				title: 'Showing kindness',
				publicationLinks: [{ url: 'https://example.com/kindness' }]
			},
			{ now: T1 }
		);

		expect(result).toEqual({
			ok: true,
			topic: expect.objectContaining({
				title: 'Showing kindness',
				description: 'About Kindness',
				publicationLinks: [{ url: 'https://example.com/kindness' }],
				updatedAt: T1
			})
		});
		expect(queueTitles()).toEqual(['Prayer', 'Showing kindness']);
	});

	it('clears a nullable field set to null', () => {
		const a = createTopic(db, TEST_USER.id, fields('Prayer', { notes: 'Old plan' }), { now: T0 });

		updateTopic(db, TEST_USER.id, a.id, { notes: null });

		expect(getTopicQueue(db, TEST_USER.id)[0]?.notes).toBeNull();
	});

	it('reports an unknown topic as not found', () => {
		expect(updateTopic(db, TEST_USER.id, 'missing', { title: 'X' })).toEqual({
			ok: false,
			reason: 'not_found'
		});
	});
});

describe('deleteTopic', () => {
	it('deletes a topic with no sessions and closes the queue gap', () => {
		const a = create('Prayer');
		create('Kindness');

		expect(deleteTopic(db, TEST_USER.id, a.id)).toEqual({ ok: true });

		expect(queueTitles()).toEqual(['Kindness']);
		expect(getTopicQueue(db, TEST_USER.id)[0]?.queuePosition).toBe(0);
	});

	it('deletes an Archived Topic', () => {
		const a = create('Prayer');
		archiveTopic(db, TEST_USER.id, a.id);

		expect(deleteTopic(db, TEST_USER.id, a.id)).toEqual({ ok: true });
		expect(getArchivedTopics(db, TEST_USER.id)).toEqual([]);
	});

	it('reports an unknown topic as not found', () => {
		expect(deleteTopic(db, TEST_USER.id, 'missing')).toEqual({ ok: false, reason: 'not_found' });
	});
});

describe('records are per user', () => {
	it("never returns or changes another user's topics", () => {
		const mine = create('Prayer');
		const theirs = create('Kindness', OTHER_USER.id);
		const theirArchived = create('Patience', OTHER_USER.id);
		archiveTopic(db, OTHER_USER.id, theirArchived.id);

		expect(queueTitles()).toEqual(['Prayer']);
		expect(getArchivedTopics(db, TEST_USER.id)).toEqual([]);

		expect(updateTopic(db, TEST_USER.id, theirs.id, { title: 'Hijacked' })).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect(archiveTopic(db, TEST_USER.id, theirs.id)).toEqual({ ok: false, reason: 'not_found' });
		expect(restoreTopic(db, TEST_USER.id, theirArchived.id)).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect(deleteTopic(db, TEST_USER.id, theirs.id)).toEqual({ ok: false, reason: 'not_found' });
		expect(reorderTopicQueue(db, TEST_USER.id, [theirs.id, mine.id])).toEqual({
			ok: false,
			reason: 'stale_queue'
		});

		expect(queueTitles(OTHER_USER.id)).toEqual(['Kindness']);
		expect(getArchivedTopics(db, OTHER_USER.id).map((topic) => topic.title)).toEqual(['Patience']);
	});

	it("starts a user's queue at the front regardless of another user's topics", () => {
		create('Kindness', OTHER_USER.id);
		create('Patience', OTHER_USER.id);

		expect(create('Prayer').queuePosition).toBe(0);
	});
});

describe('Usual Weekday', () => {
	it('defaults to Wednesday', async () => {
		expect(await getUsualWeekday(db, TEST_USER.id)).toBe(3);
	});

	it('can be changed, per user', async () => {
		await setUsualWeekday(db, TEST_USER.id, 5);
		await setUsualWeekday(db, TEST_USER.id, 1);

		expect(await getUsualWeekday(db, TEST_USER.id)).toBe(1);
		expect(await getUsualWeekday(db, OTHER_USER.id)).toBe(3);
	});
});
