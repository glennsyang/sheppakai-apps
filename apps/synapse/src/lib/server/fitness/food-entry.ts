// The Food Entry write module: the Log Food form actions and `/api/v1/meals` are thin adapters over
// `createFoodEntry` and `updateFoodEntry`.
import { and, eq } from 'drizzle-orm';

import type { MealType } from '#lib/schemas/fitness.js';
import type { getDb } from '#lib/server/db/index.js';
import { mealLogs } from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';

type Db = ReturnType<typeof getDb>;

export type FoodEntry = typeof mealLogs.$inferSelect;

export type FoodEntryFields = {
	date: string;
	timeOfDay: MealType;
	description: string;
	caloriesEstimate: number | null;
};

/** Fields left `undefined` keep their stored value; `null` clears a nullable one. */
export type FoodEntryPatch = Partial<FoodEntryFields>;

export function createFoodEntry(
	db: Db,
	userId: string,
	fields: FoodEntryFields,
	now = new Date()
): FoodEntry {
	return db
		.insert(mealLogs)
		.values({ id: generateId(), userId, ...fields, ...withTimestampsForCreate(now) })
		.returning()
		.get();
}

/** Updates the user's own Food Entry; `null` when they have no entry with that id. */
export function updateFoodEntry(
	db: Db,
	userId: string,
	entryId: string,
	patch: FoodEntryPatch,
	now = new Date()
): FoodEntry | null {
	// Drizzle leaves out `undefined` values in `.set()`, so a patch only touches the fields it names.
	const updated = db
		.update(mealLogs)
		.set({ ...patch, ...withTimestampsForUpdate(now) })
		.where(and(eq(mealLogs.id, entryId), eq(mealLogs.userId, userId)))
		.returning()
		.get();

	return updated ?? null;
}
