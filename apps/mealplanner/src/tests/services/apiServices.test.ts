// The service functions added for /api/v1, against the real migrations in memory.
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../../lib/server/db/schema';

vi.mock('../../lib/server/logger', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

let currentDb: ReturnType<typeof drizzle<typeof schema>>;
vi.mock('../../lib/server/db', () => ({ getDb: () => currentDb }));

const pantry = await import('../../lib/server/services/pantry');
const recipes = await import('../../lib/server/services/recipes');
const mealPlan = await import('../../lib/server/services/mealPlan');

const WEEK = '2026-10-26';
const recipeInput = {
	name: 'Tacos',
	description: '',
	ingredientsJson: [],
	instructionsJson: [],
	prepTimeMinutes: 0,
	servings: 1
};

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	currentDb = drizzle(sqlite, { schema });
	migrate(currentDb, {
		migrationsFolder: fileURLToPath(new URL('../../lib/server/db/migrations', import.meta.url))
	});
	const now = new Date();
	currentDb
		.insert(schema.user)
		.values({ id: 'u1', name: 'U', email: 'u@test.com', createdAt: now, updatedAt: now })
		.run();
});

describe('pantry', () => {
	it('gets, patches and removes an item', async () => {
		const item = await pantry.addPantryItem('u1', 'Rice', 2, 'kg');

		expect(await pantry.getPantryItem(item.id)).toMatchObject({ name: 'Rice', quantity: 2 });
		expect(await pantry.updatePantryItem(item.id, { quantity: 1 })).toMatchObject({
			name: 'Rice',
			quantity: 1,
			unit: 'kg'
		});
		expect(await pantry.removePantryItem(item.id)).toBe(true);
		expect(await pantry.removePantryItem(item.id)).toBe(false);
		expect(await pantry.getPantryItem(item.id)).toBeNull();
		expect(await pantry.updatePantryItem(item.id, { name: 'x' })).toBeNull();
	});
});

describe('recipes', () => {
	it('lists by source and limit', async () => {
		await recipes.saveRecipe('u1', { ...recipeInput, name: 'A', source: 'ai' });
		await recipes.saveRecipe('u1', { ...recipeInput, name: 'B', source: 'custom' });

		expect((await recipes.listRecipes({ limit: 50 })).map((r) => r.name).sort()).toEqual([
			'A',
			'B'
		]);
		expect((await recipes.listRecipes({ limit: 50, source: 'custom' })).map((r) => r.name)).toEqual(
			['B']
		);
		expect(await recipes.listRecipes({ limit: 1 })).toHaveLength(1);
	});

	it('deleting a recipe removes its planned days', async () => {
		const recipe = await recipes.saveRecipe('u1', recipeInput);
		await mealPlan.addMealPlanEntry('u1', WEEK, 0, recipe.id);

		expect(await recipes.deleteRecipe(recipe.id)).toBe(true);
		expect(await recipes.getRecipe(recipe.id)).toBeNull();
		expect(await mealPlan.getMealPlanWithEntries(WEEK)).toEqual([]);
		expect(await recipes.deleteRecipe(recipe.id)).toBe(false);
	});
});

describe('mealPlan', () => {
	it('clears one day and reports whether anything was planned', async () => {
		const recipe = await recipes.saveRecipe('u1', recipeInput);
		expect(await mealPlan.clearMealPlanDay(WEEK, 0)).toBe(false); // no plan yet

		await mealPlan.addMealPlanEntry('u1', WEEK, 0, recipe.id);
		await mealPlan.addMealPlanEntry('u1', WEEK, 1, recipe.id);

		expect(await mealPlan.clearMealPlanDay(WEEK, 0)).toBe(true);
		expect(await mealPlan.clearMealPlanDay(WEEK, 0)).toBe(false);
		expect((await mealPlan.getMealPlanWithEntries(WEEK)).map((e) => e.entry.dayOfWeek)).toEqual([
			1
		]);
		expect(await mealPlan.getMealPlan(WEEK)).toMatchObject({ weekStartDate: WEEK });
	});
});
