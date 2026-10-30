import { desc, eq, max, or, sql } from 'drizzle-orm';
import type { z } from 'zod';

import { storedIngredientListSchema, storedInstructionListSchema } from '#lib/schemas/mealPlan.js';
import { logger } from '#lib/server/logger.js';
import type { Recipe, Ingredient, RecipeListItem, RecipeSource } from '#lib/types.js';

import { getDb } from '../db';
import { recipeCooks, recipes } from '../db/schema';
import { generateId, withTimestampsForCreate, withTimestampsForUpdate } from '../db/utils';

// Rows saved before input validation may hold any JSON, so a malformed one degrades to an empty
// list instead of throwing and breaking every page that lists recipes.
function parseStoredRecipeJson(row: typeof recipes.$inferSelect): {
	ingredientsJson: Ingredient[];
	instructionsJson: string[];
} {
	return {
		ingredientsJson: parseStoredList(row.id, row.ingredientsJson, storedIngredientListSchema),
		instructionsJson: parseStoredList(row.id, row.instructionsJson, storedInstructionListSchema)
	};
}

function parseStoredList<T>(recipeId: string, raw: string, schema: z.ZodType<T[]>): T[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = undefined;
	}
	const result = schema.safeParse(parsed);
	if (!result.success) {
		logger.warn('Malformed stored recipe JSON', { recipeId });
		return [];
	}
	return result.data;
}

/** The single DB-row → Recipe mapping; reuse it rather than re-spelling the fields. */
export function rowToRecipe(row: typeof recipes.$inferSelect): Recipe {
	return {
		id: row.id,
		userId: row.userId,
		name: row.name,
		description: row.description,
		...parseStoredRecipeJson(row),
		prepTimeMinutes: row.prepTimeMinutes,
		servings: row.servings,
		source: row.source,
		rating: row.rating,
		sourceUrl: row.sourceUrl,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

export async function saveRecipe(
	userId: string,
	data: {
		name: string;
		description: string;
		ingredientsJson: Ingredient[];
		instructionsJson: string[];
		prepTimeMinutes: number;
		servings: number;
		source?: RecipeSource;
		sourceUrl?: string | null;
	}
): Promise<Recipe> {
	logger.debug('saveRecipe', { userId, name: data.name });
	const id = generateId();
	const db = getDb();
	await db.insert(recipes).values({
		id,
		userId,
		name: data.name,
		description: data.description,
		ingredientsJson: JSON.stringify(data.ingredientsJson),
		instructionsJson: JSON.stringify(data.instructionsJson),
		prepTimeMinutes: data.prepTimeMinutes,
		servings: data.servings,
		source: data.source ?? 'ai',
		sourceUrl: data.sourceUrl ?? null,
		...withTimestampsForCreate()
	});
	const [row] = db.select().from(recipes).where(eq(recipes.id, id)).all();
	return rowToRecipe(row);
}

/** Overwrite a saved recipe's content. Keeps its source, so a written-in meal stays custom. */
export async function updateRecipe(
	id: string,
	data: {
		name: string;
		description: string;
		ingredientsJson: Ingredient[];
		instructionsJson: string[];
		prepTimeMinutes: number;
		servings: number;
	}
): Promise<Recipe> {
	logger.debug('updateRecipe', { id });
	const db = getDb();
	const [row] = db
		.update(recipes)
		.set({
			name: data.name,
			description: data.description,
			ingredientsJson: JSON.stringify(data.ingredientsJson),
			instructionsJson: JSON.stringify(data.instructionsJson),
			prepTimeMinutes: data.prepTimeMinutes,
			servings: data.servings,
			...withTimestampsForUpdate()
		})
		.where(eq(recipes.id, id))
		.returning()
		.all();
	if (!row) throw new Error(`Recipe not found: ${id}`);
	return rowToRecipe(row);
}

export async function listRecipes(
	options: { limit: number; source?: RecipeSource } = { limit: 50 }
): Promise<Recipe[]> {
	logger.debug('listRecipes', options);
	const query = getDb().select().from(recipes);
	const rows = (options.source ? query.where(eq(recipes.source, options.source)) : query)
		.orderBy(desc(recipes.updatedAt))
		.limit(options.limit)
		.all();
	return rows.map(rowToRecipe);
}

/** Escape LIKE wildcards so a search for `50%` matches the text, not everything. */
function likeContains(term: string): string {
	return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * The recipe library: every recipe, newest first, with when it was last cooked. `q` matches
 * the name or any ingredient (case-insensitive for ASCII, SQLite's LIKE).
 */
export async function searchRecipes(
	options: { q?: string; limit: number } = { limit: 200 }
): Promise<RecipeListItem[]> {
	logger.debug('searchRecipes', options);
	const db = getDb();
	const lastCooked = db
		.select({ recipeId: recipeCooks.recipeId, lastCookedOn: max(recipeCooks.cookedOn).as('last') })
		.from(recipeCooks)
		.groupBy(recipeCooks.recipeId)
		.as('last_cooked');

	const q = options.q?.trim();
	const pattern = q ? likeContains(q) : null;
	const rows = db
		.select({ recipe: recipes, lastCookedOn: lastCooked.lastCookedOn })
		.from(recipes)
		.leftJoin(lastCooked, eq(lastCooked.recipeId, recipes.id))
		.where(
			pattern
				? or(
						sql`${recipes.name} LIKE ${pattern} ESCAPE '\\'`,
						sql`${recipes.ingredientsJson} LIKE ${pattern} ESCAPE '\\'`
					)
				: undefined
		)
		.orderBy(desc(recipes.updatedAt))
		.limit(options.limit)
		.all();
	return rows.map((row) => ({
		...rowToRecipe(row.recipe),
		lastCookedOn: row.lastCookedOn ?? null
	}));
}

/** Set or clear (null) a recipe's 1–5 rating. Returns whether the recipe exists. */
export async function setRecipeRating(id: string, rating: number | null): Promise<boolean> {
	logger.debug('setRecipeRating', { id, rating });
	const updated = getDb()
		.update(recipes)
		.set({ rating, ...withTimestampsForUpdate() })
		.where(eq(recipes.id, id))
		.returning({ id: recipes.id })
		.all();
	return updated.length > 0;
}

export async function getRecipe(id: string): Promise<Recipe | null> {
	const row = getDb().select().from(recipes).where(eq(recipes.id, id)).get();
	return row ? rowToRecipe(row) : null;
}

/** Returns whether a row was deleted. Its meal plan entries and cook log go with it (FK cascade). */
export async function deleteRecipe(id: string): Promise<boolean> {
	logger.debug('deleteRecipe', { id });
	const deleted = getDb()
		.delete(recipes)
		.where(eq(recipes.id, id))
		.returning({ id: recipes.id })
		.all();
	return deleted.length > 0;
}
