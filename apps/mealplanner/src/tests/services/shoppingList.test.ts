// Shopping list sync and tick → pantry restock against the real migrations in memory.
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
const mealPlan = await import('../../lib/server/services/mealPlan');
const pantry = await import('../../lib/server/services/pantry');
const shopping = await import('../../lib/server/services/shoppingList');

const WEEK = '2026-11-16';

async function plan(day: number, name: string, ingredients: [string, string, string][]) {
	const recipe = await recipes.saveRecipe('u1', {
		name,
		description: '',
		ingredientsJson: ingredients.map(([n, quantity, unit]) => ({ name: n, quantity, unit })),
		instructionsJson: [],
		prepTimeMinutes: 0,
		servings: 2,
		source: 'custom'
	});
	await mealPlan.planDinner({
		userId: 'u1',
		week: WEEK,
		day: day,
		dinner: { recipeId: recipe.id }
	});
}

const sync = () => shopping.syncShoppingList('u1', WEEK);
const byName = async (name: string) => (await sync()).find((i) => i.name === name);

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

describe('syncShoppingList', () => {
	it('is empty when nothing is planned', async () => {
		expect(await sync()).toEqual([]);
	});

	it('lists the week’s ingredients minus the pantry, sorted by aisle then name', async () => {
		await plan(0, 'Stir fry', [
			['Chicken', '500', 'g'],
			['Rice', '2', 'cups'],
			['Broccoli', '1', '']
		]);
		await plan(1, 'Fried rice', [['Rice', '1', 'cup']]);
		await pantry.addPantryItem('u1', 'Rice', 1, 'cup');

		const items = await sync();
		expect(items.map((i) => [i.name, i.quantity, i.unit, i.aisle])).toEqual([
			['Broccoli', 1, null, 'Produce'],
			['Chicken', 500, 'g', 'Meat & seafood'],
			['Rice', 2, 'cup', 'Pantry']
		]);
	});

	it('follows plan changes for unchecked rows and drops ones no longer needed', async () => {
		await plan(0, 'Soup', [
			['Carrot', '2', ''],
			['Leek', '1', '']
		]);
		expect((await sync()).map((i) => i.name)).toEqual(['Carrot', 'Leek']);

		await plan(0, 'Bigger soup', [['Carrot', '5', '']]);
		const items = await sync();
		expect(items.map((i) => [i.name, i.quantity])).toEqual([['Carrot', 5]]);
	});

	it('keeps manual items and checked rows across regeneration', async () => {
		await plan(0, 'Tacos', [
			['Tortillas', '8', ''],
			['Lime', '2', '']
		]);
		const tortillas = await byName('Tortillas');
		await shopping.setShoppingItemChecked('u1', tortillas!.id, true);
		await shopping.addManualItem('u1', WEEK, { name: 'Paper towels', quantity: null, unit: null });

		// Tacos come off the plan: lime goes, the bought tortillas and the manual item stay.
		await mealPlan.clearMealPlanDay(WEEK, 0);
		const items = await sync();
		expect(items.map((i) => [i.name, i.checked, i.manual])).toEqual([
			['Tortillas', true, false],
			['Paper towels', false, true]
		]);
	});

	it('only touches its own week', async () => {
		await shopping.addManualItem('u1', '2026-11-23', { name: 'Foil', quantity: null, unit: null });
		expect(await sync()).toEqual([]);
	});
});

describe('setShoppingItemChecked', () => {
	it('creates a pantry item when there is none, and un-ticking removes it', async () => {
		await plan(0, 'Salad', [['Spinach', '200', 'g']]);
		const item = await byName('Spinach');

		expect(await shopping.setShoppingItemChecked('u1', item!.id, true)).toBe(true);
		expect(await pantry.listPantryItems()).toEqual([
			expect.objectContaining({ name: 'Spinach', quantity: 200, unit: 'g' })
		]);
		// Bought and in the pantry, but still shown (checked) rather than vanishing.
		expect(await byName('Spinach')).toEqual(expect.objectContaining({ checked: true }));

		await shopping.setShoppingItemChecked('u1', item!.id, false);
		expect(await pantry.listPantryItems()).toEqual([]);
		expect(await byName('Spinach')).toEqual(expect.objectContaining({ checked: false }));
	});

	it('adds to a matching pantry item, and un-ticking subtracts it again', async () => {
		await plan(0, 'Risotto', [['Rice', '3', 'cups']]);
		await pantry.addPantryItem('u1', 'rice', 1, 'cup');
		const item = await byName('Rice');
		expect(item?.quantity).toBe(2);

		await shopping.setShoppingItemChecked('u1', item!.id, true);
		expect((await pantry.listPantryItems())[0]).toEqual(
			expect.objectContaining({ name: 'rice', quantity: 3, unit: 'cup' })
		);

		await shopping.setShoppingItemChecked('u1', item!.id, false);
		expect((await pantry.listPantryItems())[0]).toEqual(
			expect.objectContaining({ name: 'rice', quantity: 1 })
		);
	});

	it('converts into the pantry item’s unit', async () => {
		await plan(0, 'Roast', [['Potatoes', '500', 'g']]);
		await pantry.addPantryItem('u1', 'Potato', 0.25, 'kg');
		const item = await byName('Potatoes');
		await shopping.setShoppingItemChecked('u1', item!.id, true);
		expect((await pantry.listPantryItems())[0].quantity).toBe(0.5);
	});

	it('leaves a pantry item with no amount unchanged both ways', async () => {
		await shopping.addManualItem('u1', WEEK, { name: 'Milk', quantity: 2, unit: 'l' });
		const milk = await pantry.addPantryItem('u1', 'Milk', null, null);
		const item = await byName('Milk');

		await shopping.setShoppingItemChecked('u1', item!.id, true);
		await shopping.setShoppingItemChecked('u1', item!.id, false);
		expect(await pantry.listPantryItems()).toEqual([
			expect.objectContaining({ id: milk.id, quantity: null })
		]);
	});

	it('is a no-op when the state already matches, and false for an unknown id', async () => {
		await shopping.addManualItem('u1', WEEK, { name: 'Foil', quantity: null, unit: null });
		const item = await byName('Foil');
		await shopping.setShoppingItemChecked('u1', item!.id, true);
		await shopping.setShoppingItemChecked('u1', item!.id, true);
		expect(await pantry.listPantryItems()).toHaveLength(1);
		expect(await shopping.setShoppingItemChecked('u1', 'missing', true)).toBe(false);
	});
});

describe('removeManualItem', () => {
	it('removes manual items only', async () => {
		await plan(0, 'Pasta', [['Spaghetti', '400', 'g']]);
		await shopping.addManualItem('u1', WEEK, { name: 'Foil', quantity: null, unit: null });
		const items = await sync();
		const generated = items.find((i) => !i.manual)!;
		const manual = items.find((i) => i.manual)!;

		expect(await shopping.removeManualItem(generated.id)).toBe(false);
		expect(await shopping.removeManualItem(manual.id)).toBe(true);
		expect((await sync()).map((i) => i.name)).toEqual(['Spaghetti']);
	});
});
