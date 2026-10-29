// Route-level tests for /api/v1: auth, validation, 404s, happy paths and the audit trail.
// requireApiKey and the services are mocked; handleApiWrite runs for real against a mocked
// audit-log writer.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireApiKey: vi.fn<(request: Request, scope: string) => Promise<unknown>>(),
	recordApiWrite: vi.fn<(entry: unknown) => Promise<void>>(),
	limiterCheck: vi.fn<() => Promise<{ limited: boolean; retryAfter: number }>>(),
	suggestMeals: vi.fn<(items: string[]) => Promise<unknown>>(),
	pantry: {
		listPantryItems: vi.fn<() => Promise<unknown[]>>(),
		addPantryItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		getPantryItem: vi.fn<(id: string) => Promise<unknown>>(),
		updatePantryItem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		removePantryItem: vi.fn<(id: string) => Promise<boolean>>()
	},
	recipes: {
		listRecipes: vi.fn<(options: unknown) => Promise<unknown[]>>(),
		getRecipe: vi.fn<(id: string) => Promise<unknown>>(),
		saveRecipe: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		updateRecipe: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		deleteRecipe: vi.fn<(id: string) => Promise<boolean>>()
	},
	mealPlan: {
		getMealPlanWithEntries: vi.fn<(week: string) => Promise<unknown[]>>(),
		getMondayOfCurrentWeek: vi.fn<() => string>(),
		addMealPlanEntry: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		clearMealPlanDay: vi.fn<(week: string, day: number) => Promise<boolean>>()
	}
}));

vi.mock('#lib/server/api/require-api-key.js', () => ({ requireApiKey: mocks.requireApiKey }));
vi.mock('#lib/server/api/audit-log.js', () => ({ recordApiWrite: mocks.recordApiWrite }));
vi.mock('#lib/server/rate-limiter.js', () => ({
	createUserRateLimiter: () => ({ check: mocks.limiterCheck })
}));
vi.mock('#lib/server/ai/gemini.js', () => ({ suggestMeals: mocks.suggestMeals }));
vi.mock('#lib/server/services/pantry.js', () => mocks.pantry);
vi.mock('#lib/server/services/recipes.js', () => mocks.recipes);
vi.mock('#lib/server/services/mealPlan.js', () => mocks.mealPlan);
vi.mock('#lib/server/logger.js', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

import * as pantry from '../../routes/api/v1/pantry/+server';
import * as pantryItem from '../../routes/api/v1/pantry/[id]/+server';
import * as plans from '../../routes/api/v1/plans/+server';
import * as planDay from '../../routes/api/v1/plans/[week]/days/[day]/+server';
import * as recipes from '../../routes/api/v1/recipes/+server';
import * as recipe from '../../routes/api/v1/recipes/[id]/+server';
import * as suggestions from '../../routes/api/v1/suggestions/+server';

const KEY = { ok: true, apiKeyId: 'key-1', userId: 'user-1' };
const INVALID = { ok: false, status: 401, code: 'invalid_api_key', message: 'Invalid API key.' };

const RECIPE = {
	id: 'r1',
	userId: 'user-1',
	name: 'Lemon chicken',
	description: 'Bright',
	ingredientsJson: [{ name: 'chicken', quantity: '4', unit: '' }],
	instructionsJson: ['Roast it'],
	prepTimeMinutes: 40,
	servings: 4,
	source: 'ai',
	createdAt: new Date(0),
	updatedAt: new Date(0)
};

type Handler = (event: never) => Response | Promise<Response>;

function call(
	handler: Handler,
	path: string,
	init: { method?: string; body?: unknown; params?: Record<string, string> } = {}
) {
	const url = new URL(`https://mealplanner.example.com${path}`);
	const request = new Request(url, {
		method: init.method ?? 'GET',
		headers: { authorization: 'Bearer sk_test', 'content-type': 'application/json' },
		body: init.body === undefined ? undefined : JSON.stringify(init.body)
	});
	return handler({ request, url, params: init.params ?? {} } as never) as Promise<Response>;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requireApiKey.mockResolvedValue(KEY);
	mocks.recordApiWrite.mockResolvedValue();
	mocks.limiterCheck.mockResolvedValue({ limited: false, retryAfter: 0 });
	mocks.mealPlan.getMondayOfCurrentWeek.mockReturnValue('2026-10-26');
	mocks.mealPlan.getMealPlanWithEntries.mockResolvedValue([]);
});

describe('auth', () => {
	it('checks the scope each route needs and passes the failure through', async () => {
		mocks.requireApiKey.mockResolvedValue(INVALID);
		const cases: [Handler, string, string, string][] = [
			[pantry.GET, 'GET', '/api/v1/pantry', 'pantry:read'],
			[pantry.POST, 'POST', '/api/v1/pantry', 'pantry:write'],
			[recipes.GET, 'GET', '/api/v1/recipes', 'recipes:read'],
			[recipe.DELETE, 'DELETE', '/api/v1/recipes/r1', 'recipes:write'],
			[plans.GET, 'GET', '/api/v1/plans', 'plans:read'],
			[planDay.PUT, 'PUT', '/api/v1/plans/2026-10-26/days/0', 'plans:write'],
			[suggestions.POST, 'POST', '/api/v1/suggestions', 'suggest:write']
		];
		for (const [handler, method, path, scope] of cases) {
			const res = await call(handler, path, { method, body: method === 'GET' ? undefined : {} });
			expect(res.status).toBe(401);
			expect((await res.json()).error.code).toBe('invalid_api_key');
			expect(mocks.requireApiKey).toHaveBeenLastCalledWith(expect.any(Request), scope);
		}
		expect(mocks.recordApiWrite).not.toHaveBeenCalled();
	});
});

describe('pantry', () => {
	it('lists items', async () => {
		mocks.pantry.listPantryItems.mockResolvedValue([{ id: 'p1', name: 'Rice' }]);
		const res = await call(pantry.GET, '/api/v1/pantry');
		expect(await res.json()).toEqual({ data: [{ id: 'p1', name: 'Rice' }] });
	});

	it('creates an item as the key owner and audits the write', async () => {
		mocks.pantry.addPantryItem.mockResolvedValue({ id: 'p1', name: 'Rice' });
		const res = await call(pantry.POST, '/api/v1/pantry', {
			method: 'POST',
			body: { name: 'Rice', quantity: 2, unit: 'kg' }
		});
		expect(res.status).toBe(201);
		expect(mocks.pantry.addPantryItem).toHaveBeenCalledWith('user-1', 'Rice', 2, 'kg');
		expect(mocks.recordApiWrite).toHaveBeenCalledWith({
			apiKeyId: 'key-1',
			userId: 'user-1',
			method: 'POST',
			path: '/api/v1/pantry',
			action: 'pantry:write',
			statusCode: 201
		});
	});

	it('rejects an invalid body without writing', async () => {
		const res = await call(pantry.POST, '/api/v1/pantry', { method: 'POST', body: { name: '' } });
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('validation_failed');
		expect(mocks.pantry.addPantryItem).not.toHaveBeenCalled();
	});

	it('returns 404 for a missing item on GET, PATCH and DELETE', async () => {
		mocks.pantry.getPantryItem.mockResolvedValue(null);
		mocks.pantry.updatePantryItem.mockResolvedValue(null);
		mocks.pantry.removePantryItem.mockResolvedValue(false);
		const params = { id: 'gone' };
		const path = '/api/v1/pantry/gone';

		expect((await call(pantryItem.GET, path, { params })).status).toBe(404);
		const patch = await call(pantryItem.PATCH, path, {
			method: 'PATCH',
			body: { quantity: 1 },
			params
		});
		expect(patch.status).toBe(404);
		expect((await call(pantryItem.DELETE, path, { method: 'DELETE', params })).status).toBe(404);
		expect(mocks.recordApiWrite).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
	});

	it('rejects an empty PATCH', async () => {
		const res = await call(pantryItem.PATCH, '/api/v1/pantry/p1', {
			method: 'PATCH',
			body: {},
			params: { id: 'p1' }
		});
		expect(res.status).toBe(400);
	});
});

describe('recipes', () => {
	it('lists recipes with plain ingredient/instruction names', async () => {
		mocks.recipes.listRecipes.mockResolvedValue([RECIPE]);
		const res = await call(recipes.GET, '/api/v1/recipes?source=ai&limit=5');
		const { data } = await res.json();
		expect(mocks.recipes.listRecipes).toHaveBeenCalledWith({ source: 'ai', limit: 5 });
		expect(data[0]).toMatchObject({
			ingredients: RECIPE.ingredientsJson,
			instructions: ['Roast it']
		});
		expect(data[0]).not.toHaveProperty('ingredientsJson');
	});

	it('creates a custom recipe with defaults', async () => {
		mocks.recipes.saveRecipe.mockResolvedValue({ ...RECIPE, source: 'custom' });
		const res = await call(recipes.POST, '/api/v1/recipes', {
			method: 'POST',
			body: { name: 'Tacos' }
		});
		expect(res.status).toBe(201);
		expect(mocks.recipes.saveRecipe).toHaveBeenCalledWith('user-1', {
			name: 'Tacos',
			description: '',
			ingredientsJson: [],
			instructionsJson: [],
			prepTimeMinutes: 0,
			servings: 1,
			source: 'custom'
		});
	});

	it('merges a PATCH onto the stored recipe', async () => {
		mocks.recipes.getRecipe.mockResolvedValue(RECIPE);
		mocks.recipes.updateRecipe.mockResolvedValue({ ...RECIPE, servings: 6 });
		const res = await call(recipe.PATCH, '/api/v1/recipes/r1', {
			method: 'PATCH',
			body: { servings: 6 },
			params: { id: 'r1' }
		});
		expect(res.status).toBe(200);
		expect(mocks.recipes.updateRecipe).toHaveBeenCalledWith('r1', {
			name: RECIPE.name,
			description: RECIPE.description,
			ingredientsJson: RECIPE.ingredientsJson,
			instructionsJson: RECIPE.instructionsJson,
			prepTimeMinutes: 40,
			servings: 6
		});
	});

	it('returns 404 when deleting a missing recipe', async () => {
		mocks.recipes.deleteRecipe.mockResolvedValue(false);
		const res = await call(recipe.DELETE, '/api/v1/recipes/gone', {
			method: 'DELETE',
			params: { id: 'gone' }
		});
		expect(res.status).toBe(404);
	});
});

describe('plans', () => {
	it('defaults to the current week and always returns seven days', async () => {
		const res = await call(plans.GET, '/api/v1/plans');
		const { data } = await res.json();
		expect(mocks.mealPlan.getMealPlanWithEntries).toHaveBeenCalledWith('2026-10-26');
		expect(data.days).toHaveLength(7);
		expect(data.days[6]).toMatchObject({ day: 'Sunday', date: '2026-11-01', recipe: null });
	});

	it('resolves any date to the Monday of its week', async () => {
		await call(plans.GET, '/api/v1/plans?week=2026-10-29');
		expect(mocks.mealPlan.getMealPlanWithEntries).toHaveBeenCalledWith('2026-10-26');
	});

	it('rejects an invalid week date', async () => {
		const res = await call(plans.GET, '/api/v1/plans?week=2026-02-30');
		expect(res.status).toBe(400);
	});

	it('sets a day and returns the updated week', async () => {
		mocks.recipes.getRecipe.mockResolvedValue(RECIPE);
		mocks.mealPlan.getMealPlanWithEntries.mockResolvedValue([
			{ entry: { id: 'e1', dayOfWeek: 2 }, recipe: RECIPE }
		]);
		const res = await call(planDay.PUT, '/api/v1/plans/2026-10-26/days/2', {
			method: 'PUT',
			body: { recipeId: 'r1' },
			params: { week: '2026-10-26', day: '2' }
		});
		expect(res.status).toBe(200);
		expect(mocks.mealPlan.addMealPlanEntry).toHaveBeenCalledWith('user-1', '2026-10-26', 2, 'r1');
		const { data } = await res.json();
		expect(data.days[2]).toMatchObject({ entryId: 'e1', recipe: { id: 'r1' } });
	});

	it('requires a Monday and a 0-6 day for writes', async () => {
		const notMonday = await call(planDay.PUT, '/api/v1/plans/2026-10-27/days/0', {
			method: 'PUT',
			body: { recipeId: 'r1' },
			params: { week: '2026-10-27', day: '0' }
		});
		const badDay = await call(planDay.DELETE, '/api/v1/plans/2026-10-26/days/7', {
			method: 'DELETE',
			params: { week: '2026-10-26', day: '7' }
		});
		expect(notMonday.status).toBe(400);
		expect(badDay.status).toBe(400);
		expect(mocks.recordApiWrite).not.toHaveBeenCalled();
	});

	it('returns 404 for a missing recipe and for clearing an empty day', async () => {
		mocks.recipes.getRecipe.mockResolvedValue(null);
		mocks.mealPlan.clearMealPlanDay.mockResolvedValue(false);
		const params = { week: '2026-10-26', day: '1' };
		const put = await call(planDay.PUT, '/api/v1/plans/2026-10-26/days/1', {
			method: 'PUT',
			body: { recipeId: 'gone' },
			params
		});
		const del = await call(planDay.DELETE, '/api/v1/plans/2026-10-26/days/1', {
			method: 'DELETE',
			params
		});
		expect(put.status).toBe(404);
		expect(del.status).toBe(404);
		expect(mocks.mealPlan.addMealPlanEntry).not.toHaveBeenCalled();
	});
});

describe('suggestions', () => {
	it('returns suggestions and audits the call', async () => {
		mocks.suggestMeals.mockResolvedValue([{ name: 'Fried rice' }]);
		const res = await call(suggestions.POST, '/api/v1/suggestions', {
			method: 'POST',
			body: { items: ['rice', 'egg'] }
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: [{ name: 'Fried rice' }] });
		expect(mocks.limiterCheck).toHaveBeenCalledWith(expect.anything(), { userId: 'apikey:key-1' });
		expect(mocks.recordApiWrite).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'suggest:write', statusCode: 200 })
		);
	});

	it('returns 429 with Retry-After when the key is over its suggestion limit', async () => {
		mocks.limiterCheck.mockResolvedValue({ limited: true, retryAfter: 30 });
		const res = await call(suggestions.POST, '/api/v1/suggestions', {
			method: 'POST',
			body: { items: ['rice'] }
		});
		expect(res.status).toBe(429);
		expect(res.headers.get('Retry-After')).toBe('30');
		expect(mocks.suggestMeals).not.toHaveBeenCalled();
	});
});
