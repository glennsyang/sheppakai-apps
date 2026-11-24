// `/api/v1/meals` adapter over the Food Entry module: maps a miss onto an `ApiWriteError`.
import { ApiWriteError } from '@sheppakai/shared/api-write';

import type { ApiCreateMealInput, ApiUpdateMealInput } from '#lib/server/api/schemas/meals.js';
import { getDb } from '#lib/server/db/index.js';
import * as foodEntry from '#lib/server/fitness/food-entry.js';

export async function createMealFromApi(userId: string, input: ApiCreateMealInput) {
	return foodEntry.createFoodEntry(getDb(), userId, {
		...input,
		caloriesEstimate: input.caloriesEstimate ?? null
	});
}

export async function updateMealFromApi(userId: string, mealId: string, input: ApiUpdateMealInput) {
	const updated = foodEntry.updateFoodEntry(getDb(), userId, mealId, input);
	if (!updated) throw new ApiWriteError('not_found', 'Meal not found.', 404);
	return updated;
}
