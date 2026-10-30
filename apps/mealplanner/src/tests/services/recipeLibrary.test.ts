// Recipe library services (search, rating, cook log) against the real migrations in memory.
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

const recipes = await import('../../lib/server/services/recipes');
const cooks = await import('../../lib/server/services/recipeCooks');

function save(name: string, ingredientNames: string[] = []) {
	return recipes.saveRecipe('u1', {
		name,
		description: '',
		ingredientsJson: ingredientNames.map((n) => ({ name: n, quantity: '', unit: '' })),
		instructionsJson: [],
		prepTimeMinutes: 0,
		servings: 1,
		source: 'custom'
	});
}

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

describe('saveRecipe', () => {
	it('stores the source URL of an import', async () => {
		const recipe = await recipes.saveRecipe('u1', {
			name: 'Dal',
			description: '',
			ingredientsJson: [],
			instructionsJson: [],
			prepTimeMinutes: 30,
			servings: 4,
			source: 'imported',
			sourceUrl: 'https://example.com/dal'
		});
		expect(recipe).toMatchObject({
			source: 'imported',
			sourceUrl: 'https://example.com/dal',
			rating: null
		});
	});
});

describe('searchRecipes', () => {
	it('matches the name or an ingredient, case-insensitively', async () => {
		await save('Chicken Curry', ['chicken', 'coconut milk']);
		await save('Pad Thai', ['rice noodles', 'peanuts']);
		await save('Lemon Tart', ['lemons']);

		const byName = await recipes.searchRecipes({ q: 'curry', limit: 50 });
		expect(byName.map((r) => r.name)).toEqual(['Chicken Curry']);

		const byIngredient = await recipes.searchRecipes({ q: 'PEANUT', limit: 50 });
		expect(byIngredient.map((r) => r.name)).toEqual(['Pad Thai']);

		expect(await recipes.searchRecipes({ q: '', limit: 50 })).toHaveLength(3);
	});

	it('treats LIKE wildcards in the query as text', async () => {
		await save('Plain');
		await save('100% rye bread');

		expect((await recipes.searchRecipes({ q: '%', limit: 50 })).map((r) => r.name)).toEqual([
			'100% rye bread'
		]);
		expect(await recipes.searchRecipes({ q: '_', limit: 50 })).toHaveLength(0);
	});

	it('reports the latest cook date', async () => {
		const recipe = await save('Soup');
		await save('Salad');
		await cooks.logCook('u1', recipe.id, { cookedOn: '2026-10-01', notes: '' });
		await cooks.logCook('u1', recipe.id, { cookedOn: '2026-10-20', notes: '' });

		const list = await recipes.searchRecipes({ limit: 50 });
		expect(list.find((r) => r.name === 'Soup')?.lastCookedOn).toBe('2026-10-20');
		expect(list.find((r) => r.name === 'Salad')?.lastCookedOn).toBeNull();
	});
});

describe('setRecipeRating', () => {
	it('sets and clears a rating, and reports a missing recipe', async () => {
		const recipe = await save('Stew');

		expect(await recipes.setRecipeRating(recipe.id, 4)).toBe(true);
		expect((await recipes.getRecipe(recipe.id))?.rating).toBe(4);

		await recipes.setRecipeRating(recipe.id, null);
		expect((await recipes.getRecipe(recipe.id))?.rating).toBeNull();

		expect(await recipes.setRecipeRating('missing', 3)).toBe(false);
	});
});

describe('cook log', () => {
	it('lists newest first, deletes one entry, and goes with its recipe', async () => {
		const recipe = await save('Pie');
		const first = await cooks.logCook('u1', recipe.id, { cookedOn: '2026-09-01', notes: 'ok' });
		await cooks.logCook('u1', recipe.id, { cookedOn: '2026-10-01', notes: 'better' });

		expect((await cooks.listCooks(recipe.id)).map((c) => c.notes)).toEqual(['better', 'ok']);

		expect(await cooks.deleteCook(first.id)).toBe(true);
		expect(await cooks.deleteCook(first.id)).toBe(false);
		expect(await cooks.listCooks(recipe.id)).toHaveLength(1);

		await recipes.deleteRecipe(recipe.id);
		expect(await cooks.listCooks(recipe.id)).toHaveLength(0);
	});
});
