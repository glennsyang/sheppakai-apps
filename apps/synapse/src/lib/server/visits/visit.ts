// The Visit write module: the visit form actions on a group member's page and `/api/v1/visits` are
// thin adapters over `logVisit` and `updateVisit`. A group member's Next Visit lives on the member
// (`people.scheduledVisitDate`): logging a visit always replaces it, so a visit logged with no Next
// Visit clears it.
//
// The better-sqlite3 driver runs transaction callbacks synchronously, so every query inside a
// transaction uses its sync execution method (`.get()` / `.run()`) rather than `await`.
import { and, eq } from 'drizzle-orm';

import type { getDb } from '#lib/server/db/index.js';
import { people, visits } from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';

type Db = ReturnType<typeof getDb>;

export type Visit = typeof visits.$inferSelect;

export type VisitFields = {
	date: string;
	time: string | null;
	companions: string[] | null;
	notes: string | null;
	/** The group member's Next Visit; `null` clears it. */
	nextVisitDate: string | null;
};

/** Fields left `undefined` keep their stored value; `null` clears a nullable one. */
export type VisitPatch = Partial<VisitFields>;

function companionsToJson(companions: string[] | null | undefined): string | null | undefined {
	if (companions === undefined) return undefined;
	return companions && companions.length > 0 ? JSON.stringify(companions) : null;
}

/**
 * Logs a visit with the user's own group member and sets the member's Next Visit, in one
 * transaction. `null` when the user has no member with that id.
 */
export function logVisit(
	db: Db,
	userId: string,
	personId: string,
	{ nextVisitDate, companions, ...fields }: VisitFields,
	now = new Date()
): Visit | null {
	const ownedPerson = and(eq(people.id, personId), eq(people.userId, userId));

	return db.transaction((tx) => {
		const person = tx.select({ id: people.id }).from(people).where(ownedPerson).get();
		if (!person) return null;

		const visit = tx
			.insert(visits)
			.values({
				id: generateId(),
				personId,
				userId,
				...fields,
				companions: companionsToJson(companions),
				...withTimestampsForCreate(now)
			})
			.returning()
			.get();

		tx.update(people)
			.set({ scheduledVisitDate: nextVisitDate, ...withTimestampsForUpdate(now) })
			.where(ownedPerson)
			.run();

		return visit;
	});
}

/**
 * Updates the user's own visit; a `nextVisitDate` in the patch sets (or, as `null`, clears) the
 * member's Next Visit. Pass `personId` to also require the visit to belong to that member. `null`
 * when no visit matches.
 */
export function updateVisit(
	db: Db,
	userId: string,
	visitId: string,
	{ nextVisitDate, companions, ...patch }: VisitPatch,
	{ personId, now = new Date() }: { personId?: string; now?: Date } = {}
): Visit | null {
	const conditions = [eq(visits.id, visitId), eq(visits.userId, userId)];
	if (personId) conditions.push(eq(visits.personId, personId));

	return db.transaction((tx) => {
		// Drizzle leaves out `undefined` values in `.set()`, so a patch only touches the fields it
		// names.
		const visit = tx
			.update(visits)
			.set({ ...patch, companions: companionsToJson(companions), ...withTimestampsForUpdate(now) })
			.where(and(...conditions))
			.returning()
			.get();

		if (!visit) return null;

		if (nextVisitDate !== undefined) {
			tx.update(people)
				.set({ scheduledVisitDate: nextVisitDate, ...withTimestampsForUpdate(now) })
				.where(and(eq(people.id, visit.personId), eq(people.userId, userId)))
				.run();
		}

		return visit;
	});
}
