// Runs the Group Status module against the app's real schema and migrations, so every Visit
// Status rule is checked through real people, visits and settings rows.
import { beforeEach, describe, expect, it } from 'vitest';

import { addDaysToDateString } from '#lib/utils/date.js';

import * as schema from './db/schema';
import { loadArchivedMembers, loadGroupStatuses } from './group-status';
import type { Db } from './notification-jobs/run-job';
import { buildTestDb, TEST_USER } from './notification-jobs/test-harness';

const TODAY = '2026-11-24';
const OTHER_USER = { id: 'user-2', name: 'Other', email: 'other@example.com' };

let db: Db;

beforeEach(() => {
	db = buildTestDb();
	const now = new Date('2026-01-01T00:00:00Z');
	db.insert(schema.user)
		.values({ ...OTHER_USER, createdAt: now, updatedAt: now })
		.run();
});

function addPerson(
	id: string,
	{
		userId = TEST_USER.id,
		scheduledVisitDate = null as string | null,
		isExempt = false,
		isArchived = false
	} = {}
) {
	const now = new Date('2026-01-01T00:00:00Z');
	db.insert(schema.people)
		.values({
			id,
			userId,
			name: `Person ${id}`,
			scheduledVisitDate,
			isExempt,
			isArchived,
			createdAt: now,
			updatedAt: now
		})
		.run();
}

let visitCount = 0;
function addVisit(
	personId: string,
	daysAgo: number,
	{
		userId = TEST_USER.id,
		createdAt = new Date('2026-01-01T00:00:00Z'),
		id = `v${++visitCount}`
	} = {}
) {
	db.insert(schema.visits)
		.values({
			id,
			personId,
			userId,
			date: addDaysToDateString(TODAY, -daysAgo),
			createdAt,
			updatedAt: createdAt
		})
		.run();
}

async function statusesById(options: { userId?: string; personId?: string } = {}) {
	const members = await loadGroupStatuses(db, { today: TODAY, ...options });
	return new Map(members.map((member) => [member.person.id, member]));
}

describe('loadGroupStatuses', () => {
	it('gives each Visit Status from real rows, using the default thresholds', async () => {
		addPerson('recent');
		addVisit('recent', 30);
		addPerson('overdue');
		addVisit('overdue', 300);
		addPerson('critical');
		addVisit('critical', 400);
		addPerson('never');
		addPerson('scheduled', { scheduledVisitDate: addDaysToDateString(TODAY, 5) });
		addVisit('scheduled', 400);
		addPerson('exempt', { isExempt: true });
		addVisit('exempt', 400);

		const members = await statusesById();

		expect(Object.fromEntries([...members].map(([id, m]) => [id, m.status]))).toEqual({
			recent: 'green',
			overdue: 'yellow',
			critical: 'red',
			never: 'none',
			scheduled: 'scheduled',
			exempt: 'exempt'
		});
		expect(members.get('recent')).toMatchObject({
			daysSinceLastVisit: 30,
			daysUntilStatusChange: 273 - 30
		});
		expect(members.get('overdue')?.daysUntilStatusChange).toBe(365 - 300);
		expect(members.get('critical')?.daysUntilStatusChange).toBeNull();
		expect(members.get('never')).toMatchObject({ lastVisit: null, daysSinceLastVisit: null });
		expect(members.get('scheduled')?.nextVisitDate).toBe(addDaysToDateString(TODAY, 5));
	});

	it('leaves Archived Members out', async () => {
		addPerson('active');
		addPerson('archived', { isArchived: true });
		addVisit('archived', 400);

		expect([...(await statusesById()).keys()]).toEqual(['active']);
	});

	it('counts a Next Visit set for today as Scheduled', async () => {
		addPerson('today', { scheduledVisitDate: TODAY });
		addVisit('today', 400);

		expect((await statusesById()).get('today')).toMatchObject({
			status: 'scheduled',
			nextVisitDate: TODAY
		});
	});

	it('falls back to the last real visit once a Next Visit lapses', async () => {
		addPerson('lapsed', { scheduledVisitDate: addDaysToDateString(TODAY, -1) });
		addVisit('lapsed', 300);
		addPerson('lapsed-never', { scheduledVisitDate: addDaysToDateString(TODAY, -1) });

		const members = await statusesById();

		expect(members.get('lapsed')).toMatchObject({ status: 'yellow', nextVisitDate: null });
		expect(members.get('lapsed-never')).toMatchObject({ status: 'none', nextVisitDate: null });
	});

	it("applies each owner's own thresholds", async () => {
		db.insert(schema.visitStatusSettings)
			.values({
				id: 'settings-2',
				userId: OTHER_USER.id,
				recentToOverdueDays: 90,
				overdueToCriticalDays: 120,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.run();
		addPerson('mine');
		addVisit('mine', 100);
		addPerson('theirs', { userId: OTHER_USER.id });
		addVisit('theirs', 100, { userId: OTHER_USER.id });

		const members = await statusesById();

		expect(members.get('mine')?.status).toBe('green');
		expect(members.get('theirs')?.status).toBe('yellow');
		expect(members.get('theirs')?.owner).toEqual(OTHER_USER);
	});

	it('picks the latest visit by date, then createdAt, then id', async () => {
		addPerson('p');
		addVisit('p', 10, { id: 'older-date' });
		addVisit('p', 5, { id: 'early', createdAt: new Date('2026-01-01T00:00:00Z') });
		addVisit('p', 5, { id: 'late', createdAt: new Date('2026-01-02T00:00:00Z') });
		addPerson('q');
		const createdAt = new Date('2026-01-01T00:00:00Z');
		addVisit('q', 5, { id: 'a', createdAt });
		addVisit('q', 5, { id: 'b', createdAt });

		const members = await statusesById();

		expect(members.get('p')?.lastVisit?.id).toBe('late');
		expect(members.get('q')?.lastVisit?.id).toBe('b');
	});

	it('scopes to one owner, and to one member', async () => {
		addPerson('mine');
		addPerson('mine-too');
		addPerson('theirs', { userId: OTHER_USER.id });

		expect([...(await statusesById({ userId: TEST_USER.id })).keys()].sort()).toEqual([
			'mine',
			'mine-too'
		]);
		expect([...(await statusesById({ userId: TEST_USER.id, personId: 'mine' })).keys()]).toEqual([
			'mine'
		]);
		expect((await statusesById({ userId: TEST_USER.id, personId: 'theirs' })).size).toBe(0);
	});
});

describe('loadArchivedMembers', () => {
	it("lists every owner's Archived Members with their last visit date", async () => {
		addPerson('active');
		addPerson('archived', { isArchived: true });
		addVisit('archived', 400);
		addVisit('archived', 500);
		addPerson('archived-never', { userId: OTHER_USER.id, isArchived: true });

		const archived = await loadArchivedMembers(db);

		expect(
			archived.map(({ id, ownerEmail, lastVisitDate }) => ({ id, ownerEmail, lastVisitDate }))
		).toEqual(
			expect.arrayContaining([
				{
					id: 'archived',
					ownerEmail: TEST_USER.email,
					lastVisitDate: addDaysToDateString(TODAY, -400)
				},
				{ id: 'archived-never', ownerEmail: OTHER_USER.email, lastVisitDate: null }
			])
		);
		expect(archived).toHaveLength(2);
	});
});
