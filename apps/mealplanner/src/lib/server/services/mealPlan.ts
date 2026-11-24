import { and, eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';
import type {
	MealPlan,
	MealPlanEntry,
	MealPlanEntryWithRecipe,
	Recipe,
	Suggestion
} from '#lib/types.js';

import { getDb } from '../db';
import { mealPlans, mealPlanEntries, recipes } from '../db/schema';
import { generateId, withTimestampsForCreate, withTimestampsForUpdate } from '../db/utils';
import { findLibraryRecipeByName, insertRecipe, rowToRecipe, type Tx } from './recipes';

function rowToMealPlan(row: typeof mealPlans.$inferSelect): MealPlan {
	return {
		id: row.id,
		userId: row.userId,
		weekStartDate: row.weekStartDate,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function rowToEntry(row: typeof mealPlanEntries.$inferSelect): MealPlanEntry {
	return {
		id: row.id,
		mealPlanId: row.mealPlanId,
		dayOfWeek: row.dayOfWeek,
		recipeId: row.recipeId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

type Db = ReturnType<typeof getDb>;

/**
 * Upsert on the unique `week_start_date` index so concurrent callers converge on one
 * shared plan per week. Must run inside the caller's transaction.
 */
function getOrCreateMealPlan(tx: Tx, userId: string, weekStartDate: string, now: Date): MealPlan {
	tx.insert(mealPlans)
		.values({ id: generateId(), userId, weekStartDate, ...withTimestampsForCreate(now) })
		.onConflictDoNothing({ target: mealPlans.weekStartDate })
		.run();

	const plan = tx.select().from(mealPlans).where(eq(mealPlans.weekStartDate, weekStartDate)).get();
	if (!plan) throw new Error(`Meal plan for ${weekStartDate} missing after upsert`);
	return rowToMealPlan(plan);
}

/** The week's Planned Dinners with their Recipes, Monday first. Works on the db or a transaction. */
function selectWeek(db: Db | Tx, weekStartDate: string): MealPlanEntryWithRecipe[] {
	// One query: plan → entries → recipes. Inner joins drop entries whose recipe is gone,
	// matching the old per-entry lookup that skipped missing recipes.
	const rows = db
		.select({ entry: mealPlanEntries, recipe: recipes })
		.from(mealPlanEntries)
		.innerJoin(mealPlans, eq(mealPlanEntries.mealPlanId, mealPlans.id))
		.innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
		.where(eq(mealPlans.weekStartDate, weekStartDate))
		.orderBy(mealPlanEntries.dayOfWeek)
		.all();

	return rows.map(({ entry, recipe }) => ({
		entry: rowToEntry(entry),
		recipe: rowToRecipe(recipe)
	}));
}

export async function getMealPlanWithEntries(
	weekStartDate: string
): Promise<MealPlanEntryWithRecipe[]> {
	logger.debug('getMealPlanWithEntries', { weekStartDate });
	return selectWeek(getDb(), weekStartDate);
}

/** `planDinner` was given a `recipeId` that isn't in the Library. */
export class RecipeNotFoundError extends Error {
	constructor(readonly recipeId: string) {
		super(`Recipe not found: ${recipeId}`);
		this.name = 'RecipeNotFoundError';
	}
}

/**
 * What goes on the day: a Library Recipe, a Suggestion (the Library Recipe of the same name if
 * there is one, else saved as a `suggested` Recipe) or a written-in dinner (saved as a `custom`
 * Recipe with no ingredients or steps).
 */
export type Dinner =
	| { recipeId: string }
	| { suggestion: Suggestion }
	| { custom: { name: string; notes?: string | null } };

/**
 * Plan a dinner on one day of a week. One transaction saves the Recipe if it's new, gets or
 * creates the week's plan and upserts the Planned Dinner, so a failure leaves no orphan
 * Recipe. A Suggestion whose name matches a Library Recipe (`normalizeRecipeName`, any Source,
 * oldest first) plans that Recipe, unchanged, instead of saving another, so planning the same
 * Suggestion twice leaves one Recipe. Returns the week's Planned Dinners. Throws
 * `RecipeNotFoundError` for an unknown `recipeId`.
 */
export async function planDinner({
	userId,
	week,
	day,
	dinner
}: {
	userId: string;
	week: string;
	day: number;
	dinner: Dinner;
}): Promise<MealPlanEntryWithRecipe[]> {
	logger.debug('planDinner', { userId, week, day, kind: Object.keys(dinner)[0] });

	// Synchronous better-sqlite3 transaction: nothing can interleave, and the unique
	// (meal_plan_id, day_of_week) index makes the upsert replace the day's recipe.
	return getDb().transaction((tx) => {
		const now = new Date();
		const recipe = resolveRecipe(tx, userId, dinner, now);
		const plan = getOrCreateMealPlan(tx, userId, week, now);
		tx.insert(mealPlanEntries)
			.values({
				id: generateId(),
				mealPlanId: plan.id,
				dayOfWeek: day,
				recipeId: recipe.id,
				...withTimestampsForCreate(now)
			})
			.onConflictDoUpdate({
				target: [mealPlanEntries.mealPlanId, mealPlanEntries.dayOfWeek],
				set: { recipeId: recipe.id, ...withTimestampsForUpdate(now) }
			})
			.run();
		return selectWeek(tx, week);
	});
}

function resolveRecipe(tx: Tx, userId: string, dinner: Dinner, now: Date): Pick<Recipe, 'id'> {
	if ('recipeId' in dinner) {
		const row = tx
			.select({ id: recipes.id })
			.from(recipes)
			.where(eq(recipes.id, dinner.recipeId))
			.get();
		if (!row) throw new RecipeNotFoundError(dinner.recipeId);
		return row;
	}
	if ('suggestion' in dinner) {
		const { name, description, ingredients, steps, prepTimeMinutes, servings } = dinner.suggestion;
		const existing = findLibraryRecipeByName(tx, name);
		if (existing) {
			logger.debug('planDinner: Suggestion matches a Library Recipe', { recipeId: existing.id });
			return existing;
		}
		return insertRecipe(
			tx,
			userId,
			{
				name,
				description,
				ingredientsJson: ingredients,
				instructionsJson: steps,
				prepTimeMinutes,
				servings,
				source: 'suggested'
			},
			now
		);
	}
	return insertRecipe(
		tx,
		userId,
		{
			name: dinner.custom.name,
			description: dinner.custom.notes ?? '',
			ingredientsJson: [],
			instructionsJson: [],
			prepTimeMinutes: 0,
			servings: 1,
			source: 'custom'
		},
		now
	);
}

export async function removeMealPlanEntry(entryId: string): Promise<void> {
	logger.debug('removeMealPlanEntry', { entryId });
	const db = getDb();
	await db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, entryId));
}

export async function getMealPlan(weekStartDate: string): Promise<MealPlan | null> {
	const row = getDb()
		.select()
		.from(mealPlans)
		.where(eq(mealPlans.weekStartDate, weekStartDate))
		.get();
	return row ? rowToMealPlan(row) : null;
}

/** Clears one day of a week's plan. Returns whether an entry was removed. */
export async function clearMealPlanDay(weekStartDate: string, dayOfWeek: number): Promise<boolean> {
	logger.debug('clearMealPlanDay', { weekStartDate, dayOfWeek });
	const plan = await getMealPlan(weekStartDate);
	if (!plan) return false;
	const deleted = getDb()
		.delete(mealPlanEntries)
		.where(and(eq(mealPlanEntries.mealPlanId, plan.id), eq(mealPlanEntries.dayOfWeek, dayOfWeek)))
		.returning({ id: mealPlanEntries.id })
		.all();
	return deleted.length > 0;
}
