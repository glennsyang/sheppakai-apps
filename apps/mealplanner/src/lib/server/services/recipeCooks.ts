import { desc, eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';
import type { RecipeCook } from '#lib/types.js';

import { getDb } from '../db';
import { recipeCooks } from '../db/schema';
import { generateId, withTimestampsForCreate } from '../db/utils';

/** Record that a recipe was cooked on `cookedOn` (`YYYY-MM-DD`). */
export async function logCook(
	userId: string,
	recipeId: string,
	data: { cookedOn: string; notes: string }
): Promise<RecipeCook> {
	logger.debug('logCook', { userId, recipeId, cookedOn: data.cookedOn });
	const [row] = getDb()
		.insert(recipeCooks)
		.values({
			id: generateId(),
			recipeId,
			userId,
			cookedOn: data.cookedOn,
			notes: data.notes,
			...withTimestampsForCreate()
		})
		.returning()
		.all();
	return row;
}

/** A recipe's cook log, most recent first. */
export async function listCooks(recipeId: string): Promise<RecipeCook[]> {
	return getDb()
		.select()
		.from(recipeCooks)
		.where(eq(recipeCooks.recipeId, recipeId))
		.orderBy(desc(recipeCooks.cookedOn), desc(recipeCooks.createdAt))
		.all();
}

/** Returns whether a row was deleted. */
export async function deleteCook(id: string): Promise<boolean> {
	logger.debug('deleteCook', { id });
	const deleted = getDb()
		.delete(recipeCooks)
		.where(eq(recipeCooks.id, id))
		.returning({ id: recipeCooks.id })
		.all();
	return deleted.length > 0;
}
