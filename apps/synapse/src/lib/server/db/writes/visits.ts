import { ApiWriteError } from '@sheppakai/shared/api-write';
import { and, eq } from 'drizzle-orm';

import type { ApiCreateVisitInput, ApiUpdateVisitInput } from '#lib/server/api/schemas/visits.js';
import { getDb } from '#lib/server/db/index.js';
import { people, visits } from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';

function companionsToJson(companions: string[] | undefined | null): string | null {
	if (!companions || companions.length === 0) return null;
	return JSON.stringify(companions);
}

type Db = ReturnType<typeof getDb>;

type NewVisit = Omit<typeof visits.$inferInsert, 'followUpDate' | 'createdAt' | 'updatedAt'> & {
	id: string;
	personId: string;
	userId: string;
};

/**
 * Logs a visit and sets the group member's Next Visit in one transaction. The Next Visit lives
 * on the member (`people.scheduledVisitDate`); logging a visit always replaces it, so a visit
 * logged with no Next Visit clears it. Shared by the `logVisit` UI action and the API.
 */
export function logVisitAndSetNextVisit(
	db: Db,
	{ visit, nextVisitDate, now }: { visit: NewVisit; nextVisitDate: string | null; now: Date }
): void {
	// The better-sqlite3 driver runs transaction callbacks synchronously, so every query
	// inside must use `.run()` instead of `await`.
	db.transaction((tx) => {
		tx.insert(visits)
			.values({ ...visit, ...withTimestampsForCreate(now) })
			.run();
		tx.update(people)
			.set({ scheduledVisitDate: nextVisitDate, ...withTimestampsForUpdate(now) })
			.where(and(eq(people.id, visit.personId), eq(people.userId, visit.userId)))
			.run();
	});
}

/**
 * Insert path for API-key-driven visit logging. Verifies the person belongs to the caller,
 * then logs the visit and sets the member's Next Visit from `followUpDate` (the API keeps
 * that field name), clearing it when omitted, exactly like the `logVisit` UI action.
 */
export async function createVisit(userId: string, input: ApiCreateVisitInput) {
	const db = getDb();

	const person = await db.query.people.findFirst({
		where: and(eq(people.id, input.personId), eq(people.userId, userId))
	});

	if (!person) {
		throw new ApiWriteError('not_found', 'Person not found.', 404);
	}

	const visitId = generateId();

	logVisitAndSetNextVisit(db, {
		visit: {
			id: visitId,
			personId: input.personId,
			userId,
			date: input.date,
			time: input.time ?? null,
			companions: companionsToJson(input.companions),
			notes: input.notes ?? null
		},
		nextVisitDate: input.followUpDate ?? null,
		now: new Date()
	});

	return db.query.visits.findFirst({ where: eq(visits.id, visitId) });
}

/**
 * Update path for API-key-driven visit updates. Mirrors the `updateVisit` action in
 * src/routes/(app)/visits/[id]/+page.server.ts. A `followUpDate` in the body (the API keeps
 * that field name) sets the group member's Next Visit; `null` clears it, and leaving it out
 * keeps it.
 */
export async function updateVisit(userId: string, visitId: string, input: ApiUpdateVisitInput) {
	const db = getDb();

	const existing = await db.query.visits.findFirst({
		where: and(eq(visits.id, visitId), eq(visits.userId, userId))
	});

	if (!existing) {
		throw new ApiWriteError('not_found', 'Visit not found.', 404);
	}

	// One timestamp for the visit and the member's Next Visit
	const now = new Date();

	db.transaction((tx) => {
		tx.update(visits)
			.set({
				date: input.date ?? existing.date,
				time: input.time !== undefined ? input.time : existing.time,
				companions:
					input.companions !== undefined ? companionsToJson(input.companions) : existing.companions,
				notes: input.notes !== undefined ? input.notes : existing.notes,
				...withTimestampsForUpdate(now)
			})
			.where(and(eq(visits.id, visitId), eq(visits.userId, userId)))
			.run();

		if (input.followUpDate !== undefined) {
			tx.update(people)
				.set({ scheduledVisitDate: input.followUpDate, ...withTimestampsForUpdate(now) })
				.where(and(eq(people.id, existing.personId), eq(people.userId, userId)))
				.run();
		}
	});

	return db.query.visits.findFirst({ where: eq(visits.id, visitId) });
}
