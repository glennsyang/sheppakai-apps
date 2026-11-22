// Runs the Next Visit backfill, the follow-up column drop and the visit write paths against this
// app's real schema and migrations, so the "Next Visit lives on the group member" rule is checked
// against SQL.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const USER_ID = 'user-1';
const TODAY = '2026-11-21';

type Journal = { entries: { idx: number; tag: string }[] };

/**
 * A copy of the migrations folder that stops before `stopBeforeIdx`, so a test can build the
 * schema as it was before a migration, add rows, then run the rest with the real folder.
 */
function migrationsBefore(stopBeforeIdx: number): string {
	const journal = JSON.parse(
		readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8')
	) as Journal;
	const entries = journal.entries.filter((entry) => entry.idx < stopBeforeIdx);
	const folder = mkdtempSync(join(tmpdir(), 'synapse-migrations-'));
	mkdirSync(join(folder, 'meta'));
	writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
	for (const { tag } of entries) {
		copyFileSync(join(migrationsFolder, `${tag}.sql`), join(folder, `${tag}.sql`));
	}
	return folder;
}

function buildDb(folder = migrationsFolder) {
	const sqlite = new Database(':memory:');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: folder });
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
type TestSqlite = ReturnType<typeof buildDb>['sqlite'];

function addPerson(db: TestDb, id: string, scheduledVisitDate: string | null = null) {
	const now = new Date();
	db.insert(schema.people)
		.values({ id, userId: USER_ID, name: id, scheduledVisitDate, createdAt: now, updatedAt: now })
		.run();
}

/** Inserts a visit with a `follow_up_date`, which only exists before migration 0036. */
function addOldVisit(
	sqlite: TestSqlite,
	id: string,
	personId: string,
	date: string,
	followUpDate: string | null,
	createdAt = new Date(`${date}T12:00:00Z`)
) {
	const seconds = Math.floor(createdAt.getTime() / 1000);
	sqlite
		.prepare(
			'INSERT INTO visits (id, person_id, user_id, date, follow_up_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run(id, personId, USER_ID, date, followUpDate, seconds, seconds);
}

function nextVisitOf(db: TestDb, personId: string) {
	return db.query.people.findFirst({ where: eq(schema.people.id, personId) }).sync()
		?.scheduledVisitDate;
}

/** The rule before #303: the latest visit's follow-up wins once any visit exists. */
function oldStatus(db: TestDb, sqlite: TestSqlite, personId: string) {
	const person = db.query.people.findFirst({ where: eq(schema.people.id, personId) }).sync()!;
	const latest = sqlite
		.prepare(
			'SELECT date, follow_up_date AS followUpDate FROM visits WHERE person_id = ? ORDER BY date DESC, created_at DESC LIMIT 1'
		)
		.get(personId) as { date: string; followUpDate: string | null } | undefined;
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

describe('0035 Next Visit backfill and 0036 follow-up column drop', () => {
	it("copies each member's latest visit follow-up onto the member, then drops the column without losing visits", () => {
		const { sqlite, db } = buildDb(migrationsBefore(35));

		// Latest visit sets an upcoming follow-up; an older visit's follow-up is ignored.
		addPerson(db, 'upcoming', '2026-01-01');
		addOldVisit(sqlite, 'u1', 'upcoming', '2026-10-01', '2026-12-05');
		addOldVisit(sqlite, 'u2', 'upcoming', '2025-06-01', '2026-11-30');
		// Latest visit has no follow-up, so a stale member date must be cleared.
		addPerson(db, 'stale', '2026-12-25');
		addOldVisit(sqlite, 's1', 'stale', '2025-01-10', null);
		// Same-day visits: the later createdAt wins.
		addPerson(db, 'sameDay');
		addOldVisit(
			sqlite,
			'd1',
			'sameDay',
			'2026-11-01',
			'2026-12-01',
			new Date('2026-11-01T10:00:00Z')
		);
		addOldVisit(sqlite, 'd2', 'sameDay', '2026-11-01', null, new Date('2026-11-01T18:00:00Z'));
		// Never visited: keeps the member date.
		addPerson(db, 'neverVisited', '2026-12-10');
		addPerson(db, 'nothing');

		const ids = ['upcoming', 'stale', 'sameDay', 'neverVisited', 'nothing'];
		const before = new Map(ids.map((id) => [id, oldStatus(db, sqlite, id)]));
		const visitsBefore = sqlite
			.prepare('SELECT id, person_id, user_id, date, created_at FROM visits ORDER BY id')
			.all();

		migrate(db, { migrationsFolder });

		expect(nextVisitOf(db, 'upcoming')).toBe('2026-12-05');
		expect(nextVisitOf(db, 'stale')).toBeNull();
		expect(nextVisitOf(db, 'sameDay')).toBeNull();
		expect(nextVisitOf(db, 'neverVisited')).toBe('2026-12-10');
		expect(nextVisitOf(db, 'nothing')).toBeNull();

		for (const id of ids) {
			const { latest, status } = before.get(id)!;
			expect({ id, status: newStatus(db, id, latest) }).toEqual({ id, status });
		}

		const columns = sqlite.pragma('table_info(visits)') as { name: string }[];
		expect(columns.map((column) => column.name)).not.toContain('follow_up_date');
		expect(
			sqlite
				.prepare('SELECT id, person_id, user_id, date, created_at FROM visits ORDER BY id')
				.all()
		).toEqual(visitsBefore);
	});
});

describe('visit writes set the member Next Visit', () => {
	let db: TestDb;

	beforeEach(() => {
		db = buildDb().db;
		state.db = db;
		addPerson(db, 'p1', '2026-11-25');
	});

	it('logVisitAndSetNextVisit logs the visit and sets the Next Visit', () => {
		logVisitAndSetNextVisit(db, {
			visit: { id: 'v1', personId: 'p1', userId: USER_ID, date: TODAY },
			nextVisitDate: '2027-01-15',
			now: new Date()
		});

		expect(nextVisitOf(db, 'p1')).toBe('2027-01-15');
		const visit = db.query.visits.findFirst({ where: eq(schema.visits.id, 'v1') }).sync();
		expect(visit?.date).toBe(TODAY);
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
