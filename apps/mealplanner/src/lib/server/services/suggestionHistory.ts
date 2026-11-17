import { and, desc, eq, gte, lte, max, notInArray } from 'drizzle-orm';

import { toLocalIsoDate } from '#lib/dates.js';
import type { SuggestionHistory } from '#lib/server/ai/suggestionHistory.js';
import { logger } from '#lib/server/logger.js';

import { getDb } from '../db';
import { recipeCooks, recipes } from '../db/schema';

/** Recipes cooked within this many days are not re-suggested. */
const RECENT_COOK_WINDOW_DAYS = 14;

const MAX_RECENT = 15;
const MAX_FAVORITES = 10;
const MAX_DISLIKED = 10;

/** The household's cook log and ratings, shaped for the suggestion prompt. */
export async function getSuggestionHistory(
	today: Date,
	avoidDays: number = RECENT_COOK_WINDOW_DAYS
): Promise<SuggestionHistory> {
	const db = getDb();
	const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - avoidDays);
	const cutoffIso = toLocalIsoDate(cutoff);

	const lastCooked = max(recipeCooks.cookedOn);
	const recentRows = db
		.select({ id: recipes.id, name: recipes.name, lastCooked })
		.from(recipeCooks)
		.innerJoin(recipes, eq(recipeCooks.recipeId, recipes.id))
		.where(gte(recipeCooks.cookedOn, cutoffIso))
		.groupBy(recipes.id)
		.orderBy(desc(lastCooked))
		.limit(MAX_RECENT)
		.all();
	const recentIds = recentRows.map((row) => row.id);

	const favorites = db
		.select({ name: recipes.name })
		.from(recipes)
		.where(
			and(
				gte(recipes.rating, 4),
				recentIds.length > 0 ? notInArray(recipes.id, recentIds) : undefined
			)
		)
		.orderBy(desc(recipes.rating), desc(recipes.updatedAt))
		.limit(MAX_FAVORITES)
		.all();

	const disliked = db
		.select({ name: recipes.name })
		.from(recipes)
		.where(lte(recipes.rating, 2))
		.orderBy(desc(recipes.updatedAt))
		.limit(MAX_DISLIKED)
		.all();

	const history = {
		recentlyCooked: recentRows.map((row) => row.name),
		favorites: favorites.map((row) => row.name),
		disliked: disliked.map((row) => row.name)
	};
	logger.debug('getSuggestionHistory', {
		cutoff: cutoffIso,
		recent: history.recentlyCooked.length,
		favorites: history.favorites.length,
		disliked: history.disliked.length
	});
	return history;
}
