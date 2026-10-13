import { ApiWriteError } from '@sheppakai/shared/api-write';
import { and, eq } from 'drizzle-orm';

import type { ApiCreateMealInput, ApiUpdateMealInput } from '#lib/server/api/schemas/meals.js';
import { getDb } from '#lib/server/db/index.js';
import { mealLogs } from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';

/**
 * Insert path for API-key-driven meal logging. Mirrors the `logMeal` action in
 * src/routes/(app)/fitness/+page.server.ts, kept as its own standalone function
 * rather than sharing code with that UI action.
 */
export async function createMeal(userId: string, input: ApiCreateMealInput) {
	const db = getDb();
	const mealId = generateId();

	await db.insert(mealLogs).values({
		id: mealId,
		userId,
		date: input.date,
		timeOfDay: input.timeOfDay,
		description: input.description,
		caloriesEstimate: input.caloriesEstimate ?? null,
		...withTimestampsForCreate()
	});

	return db.query.mealLogs.findFirst({ where: eq(mealLogs.id, mealId) });
}

/**
 * Update path for API-key-driven meal updates. Mirrors the `updateMeal` action in
 * src/routes/(app)/fitness/+page.server.ts, kept as its own standalone function
 * rather than sharing code with that UI action.
 */
export async function updateMeal(userId: string, mealId: string, input: ApiUpdateMealInput) {
	const db = getDb();

	const existing = await db.query.mealLogs.findFirst({
		where: and(eq(mealLogs.id, mealId), eq(mealLogs.userId, userId))
	});

	if (!existing) {
		throw new ApiWriteError('not_found', 'Meal not found.', 404);
	}

	await db
		.update(mealLogs)
		.set({
			date: input.date ?? existing.date,
			timeOfDay: input.timeOfDay ?? existing.timeOfDay,
			description: input.description ?? existing.description,
			caloriesEstimate:
				input.caloriesEstimate !== undefined ? input.caloriesEstimate : existing.caloriesEstimate,
			...withTimestampsForUpdate()
		})
		.where(and(eq(mealLogs.id, mealId), eq(mealLogs.userId, userId)));

	return db.query.mealLogs.findFirst({ where: eq(mealLogs.id, mealId) });
}
