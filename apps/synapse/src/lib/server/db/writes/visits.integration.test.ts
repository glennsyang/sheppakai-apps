// Runs the Next Visit backfill and the visit write paths against this app's real schema and
// migrations, so the "Next Visit lives on the group member" rule is checked against SQL.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../schema';

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('#lib/server/db/index.js', () => ({ getDb: () => state.db }));

import { getPersonVisitStatus } from '#lib/server/visits.js';
import { DEFAULT_VISIT_STATUS_THRESHOLDS } from '#lib/utils/visit-status.js';

import { createVisit, logVisitAndSetNextVisit, updateVisit } from './visits';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const backfillSql = readFileSync(`${migrationsFolder}/0035_next_visit_on_member.sql`, 'utf8');

const USER_ID = 'user-1';
const TODAY = '2026-11-21';

function buildDb() {
	const sqlite = new Database(':memory:');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder });
	const now = new Date();
	db.insert(schema.user)
		.values({
			id: USER_ID,
			name: 'Owner',
			email: 'owner@example.com',
			createdAt: now,
			updatedAt: now
		})
		.run();
	return { sqlite, db };
}

type TestDb = ReturnType<typeof buildDb>['db'];

function addPerson(db: TestDb, id: string, scheduledVisitDate: string | null = null) {
	const now = new Date();
	db.insert(schema.people)
		.values({ id, userId: USER_ID, name: id, scheduledVisitDate, createdAt: now, updatedAt: now })
		.run();
}

function addOldVisit(
	db: TestDb,
	id: string,
	personId: string,
	date: string,
	followUpDate: string | null,
	createdAt = new Date(`${date}T12:00:00Z`)
) {
	db.insert(schema.visits)
		.values({ id, personId, userId: USER_ID, date, followUpDate, createdAt, updatedAt: createdAt })
		.run();
}

function nextVisitOf(db: TestDb, personId: string) {
	return db.query.people.findFirst({ where: eq(schema.people.id, personId) }).sync()
		?.scheduledVisitDate;
}

/** The rule before #303: the latest visit's follow-up wins once any visit exists. */
function oldStatus(db: TestDb, personId: string) {
	const person = db.query.people.findFirst({ where: eq(schema.people.id, personId) }).sync()!;
	const latest = db.query.visits
		.findFirst({
			where: eq(schema.visits.personId, personId),
			orderBy: (v, { desc }) => [desc(v.date), desc(v.createdAt)]
		})
		.sync();
	const nextVisit = latest ? latest.followUpDate : person.scheduledVisitDate;
	return {
		latest,
		status: getPersonVisitStatus(
			{ isExempt: person.isExempt, scheduledVisitDate: nextVisit },
			latest,
			TODAY,
			DEFAULT_VISIT_STATUS_THRESHOLDS
		).status
	};
}

function newStatus(db: TestDb, personId: string, latest: { date: string } | undefined) {
	const person = db.query.people.findFirst({ where: eq(schema.people.id, personId) }).sync()!;
	return getPersonVisitStatus(person, latest, TODAY, DEFAULT_VISIT_STATUS_THRESHOLDS).status;
}

describe('0035 Next Visit backfill', () => {
	it("copies each member's latest visit follow-up onto the member without changing any status", () => {
		const { sqlite, db } = buildDb();

		// Latest visit sets an upcoming follow-up; an older visit's follow-up is ignored.
		addPerson(db, 'upcoming', '2026-01-01');
		addOldVisit(db, 'u1', 'upcoming', '2026-10-01', '2026-12-05');
		addOldVisit(db, 'u2', 'upcoming', '2025-06-01', '2026-11-30');
		// Latest visit has no follow-up, so a stale member date must be cleared.
		addPerson(db, 'stale', '2026-12-25');
		addOldVisit(db, 's1', 'stale', '2025-01-10', null);
		// Same-day visits: the later createdAt wins.
		addPerson(db, 'sameDay');
		addOldVisit(db, 'd1', 'sameDay', '2026-11-01', '2026-12-01', new Date('2026-11-01T10:00:00Z'));
		addOldVisit(db, 'd2', 'sameDay', '2026-11-01', null, new Date('2026-11-01T18:00:00Z'));
		// Never visited: keeps the member date.
		addPerson(db, 'neverVisited', '2026-12-10');
		addPerson(db, 'nothing');

		const ids = ['upcoming', 'stale', 'sameDay', 'neverVisited', 'nothing'];
		const before = new Map(ids.map((id) => [id, oldStatus(db, id)]));

		sqlite.exec(backfillSql);

		expect(nextVisitOf(db, 'upcoming')).toBe('2026-12-05');
		expect(nextVisitOf(db, 'stale')).toBeNull();
		expect(nextVisitOf(db, 'sameDay')).toBeNull();
		expect(nextVisitOf(db, 'neverVisited')).toBe('2026-12-10');
		expect(nextVisitOf(db, 'nothing')).toBeNull();

		for (const id of ids) {
			const { latest, status } = before.get(id)!;
			expect({ id, status: newStatus(db, id, latest) }).toEqual({ id, status });
		}
	});
});

describe('visit writes set the member Next Visit', () => {
	let db: TestDb;

	beforeEach(() => {
		db = buildDb().db;
		state.db = db;
		addPerson(db, 'p1', '2026-11-25');
	});

	it('logVisitAndSetNextVisit sets the Next Visit and leaves the visit column empty', () => {
		logVisitAndSetNextVisit(db, {
			visit: { id: 'v1', personId: 'p1', userId: USER_ID, date: TODAY },
			nextVisitDate: '2027-01-15',
			now: new Date()
		});

		expect(nextVisitOf(db, 'p1')).toBe('2027-01-15');
		const visit = db.query.visits.findFirst({ where: eq(schema.visits.id, 'v1') }).sync();
		expect(visit?.followUpDate).toBeNull();
	});

	it('API create with followUpDate sets the Next Visit', async () => {
		await createVisit(USER_ID, { personId: 'p1', date: TODAY, followUpDate: '2027-02-01' });
		expect(nextVisitOf(db, 'p1')).toBe('2027-02-01');
	});

	it('API create without followUpDate clears the Next Visit', async () => {
		await createVisit(USER_ID, { personId: 'p1', date: TODAY });
		expect(nextVisitOf(db, 'p1')).toBeNull();
	});

	it('API update sets, keeps, or clears the Next Visit', async () => {
		const visit = await createVisit(USER_ID, {
			personId: 'p1',
			date: TODAY,
			followUpDate: '2027-02-01'
		});

		await updateVisit(USER_ID, visit!.id, { notes: 'Brought a book' });
		expect(nextVisitOf(db, 'p1')).toBe('2027-02-01');

		await updateVisit(USER_ID, visit!.id, { followUpDate: '2027-03-01' });
		expect(nextVisitOf(db, 'p1')).toBe('2027-03-01');

		await updateVisit(USER_ID, visit!.id, { followUpDate: null });
		expect(nextVisitOf(db, 'p1')).toBeNull();
	});
});
