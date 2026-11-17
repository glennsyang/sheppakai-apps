// getSuggestionHistory against the real migrations in memory.
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
const { getSuggestionHistory } = await import('../../lib/server/services/suggestionHistory');

// Local noon so date math can't cross midnight.
const TODAY = new Date(2026, 10, 16, 12);

async function save(name: string, rating: number | null = null) {
	const recipe = await recipes.saveRecipe('u1', {
		name,
		description: '',
		ingredientsJson: [],
		instructionsJson: [],
		prepTimeMinutes: 0,
		servings: 1,
		source: 'custom'
	});
	if (rating !== null) await recipes.setRecipeRating(recipe.id, rating);
	return recipe;
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

describe('getSuggestionHistory', () => {
	it('is empty with no recipes', async () => {
		expect(await getSuggestionHistory(TODAY)).toEqual({
			recentlyCooked: [],
			favorites: [],
			disliked: []
		});
	});

	it('includes cooks within the window (inclusive) and excludes older ones', async () => {
		const edge = await save('Edge');
		const old = await save('Old');
		await cooks.logCook('u1', edge.id, { cookedOn: '2026-11-02', notes: '' }); // 14 days ago
		await cooks.logCook('u1', old.id, { cookedOn: '2026-11-01', notes: '' }); // 15 days ago
		expect((await getSuggestionHistory(TODAY)).recentlyCooked).toEqual(['Edge']);
	});

	it('honours a custom window', async () => {
		const r = await save('Stew');
		await cooks.logCook('u1', r.id, { cookedOn: '2026-11-10', notes: '' });
		expect((await getSuggestionHistory(TODAY, 3)).recentlyCooked).toEqual([]);
		expect((await getSuggestionHistory(TODAY, 7)).recentlyCooked).toEqual(['Stew']);
	});

	it('lists each recent recipe once, most recently cooked first', async () => {
		const a = await save('A');
		const b = await save('B');
		await cooks.logCook('u1', a.id, { cookedOn: '2026-11-05', notes: '' });
		await cooks.logCook('u1', a.id, { cookedOn: '2026-11-15', notes: '' });
		await cooks.logCook('u1', b.id, { cookedOn: '2026-11-10', notes: '' });
		expect((await getSuggestionHistory(TODAY)).recentlyCooked).toEqual(['A', 'B']);
	});

	it('splits ratings into favorites (4–5) and disliked (1–2), ignoring 3 and unrated', async () => {
		await save('Five', 5);
		await save('Four', 4);
		await save('Three', 3);
		await save('Two', 2);
		await save('One', 1);
		await save('Unrated');
		const history = await getSuggestionHistory(TODAY);
		expect(history.favorites).toEqual(['Five', 'Four']);
		expect([...history.disliked].sort()).toEqual(['One', 'Two']);
	});

	it('leaves recently cooked favorites out of favorites', async () => {
		const fav = await save('Lasagna', 5);
		await save('Pho', 5);
		await cooks.logCook('u1', fav.id, { cookedOn: '2026-11-14', notes: '' });
		const history = await getSuggestionHistory(TODAY);
		expect(history.recentlyCooked).toEqual(['Lasagna']);
		expect(history.favorites).toEqual(['Pho']);
	});
});
