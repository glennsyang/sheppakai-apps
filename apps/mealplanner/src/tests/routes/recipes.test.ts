import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recipesMock, cooksMock, mealPlanMock, importMock, limiterCheck, loggerMock } = vi.hoisted(
	() => {
		class RecipeFetchError extends Error {}
		class UnreadableRecipeError extends Error {}
		class RecipeNotFoundError extends Error {}
		return {
			recipesMock: {
				saveRecipe: vi.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'recipe_1' }),
				saveSuggestion: vi.fn<() => Promise<unknown>>(),
				updateRecipe: vi.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'recipe_1' }),
				deleteRecipe: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
				setRecipeRating: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
				getRecipe: vi.fn<() => Promise<unknown>>(),
				searchRecipes: vi.fn<() => Promise<unknown>>().mockResolvedValue([])
			},
			cooksMock: {
				logCook: vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
				deleteCook: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
				listCooks: vi.fn<() => Promise<unknown>>().mockResolvedValue([])
			},
			mealPlanMock: {
				planDinner: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
				RecipeNotFoundError
			},
			importMock: {
				importRecipeFromUrl: vi.fn<() => Promise<unknown>>(),
				importRecipeFromPhoto: vi.fn<() => Promise<unknown>>(),
				isRecipeAiEnabled: vi.fn<() => boolean>().mockReturnValue(true),
				RecipeFetchError,
				UnreadableRecipeError
			},
			limiterCheck: vi
				.fn<() => Promise<{ limited: boolean; retryAfter: number }>>()
				.mockResolvedValue({ limited: false, retryAfter: 0 }),
			loggerMock: {
				debug: vi.fn<() => void>(),
				info: vi.fn<() => void>(),
				warn: vi.fn<() => void>(),
				error: vi.fn<() => void>()
			}
		};
	}
);

vi.mock('#lib/server/services/recipes.js', () => recipesMock);
vi.mock('#lib/server/services/recipeCooks.js', () => cooksMock);
vi.mock('#lib/server/services/mealPlan.js', () => mealPlanMock);
vi.mock('#lib/server/recipe-import/index.js', () => importMock);
vi.mock('#lib/server/rate-limiter.js', () => ({
	createUserRateLimiter: () => ({ check: limiterCheck })
}));
vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));

import { actions as listActions, load as listLoad } from '../../routes/(app)/recipes/+page.server';
import { actions as detailActions } from '../../routes/(app)/recipes/[id]/+page.server';
import { actions as newActions } from '../../routes/(app)/recipes/new/+page.server';

const USER = { id: 'user_1', name: 'Alice', email: 'alice@example.com', role: 'user' };

function ctx(fields: Record<string, string | Blob>, opts: { user?: boolean; id?: string } = {}) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	return {
		request: new Request('https://example.com/', { method: 'POST', body }),
		locals: opts.user === false ? {} : { user: USER },
		params: { id: opts.id ?? 'recipe_1' }
	} as never;
}

/** The superforms message on an action's returned `{ form }`, success or failure. */
function messageOf(result: unknown): { type: string; text: string } | undefined {
	const r = result as { form?: { message?: unknown }; data?: { form?: { message?: unknown } } };
	return (r.form?.message ?? r.data?.form?.message) as { type: string; text: string } | undefined;
}

beforeEach(() => {
	vi.clearAllMocks();
	limiterCheck.mockResolvedValue({ limited: false, retryAfter: 0 });
	importMock.isRecipeAiEnabled.mockReturnValue(true);
});

describe('recipe actions: unauthenticated', () => {
	it.each([
		['saveSuggestion', listActions.saveSuggestion],
		['create', newActions.create],
		['importUrl', newActions.importUrl],
		['update', detailActions.update],
		['delete', detailActions.delete],
		['rate', detailActions.rate],
		['logCook', detailActions.logCook],
		['addToPlanner', detailActions.addToPlanner]
	])('%s returns 401 without touching services', async (_name, action) => {
		const result = await action(ctx({ name: 'X', url: 'https://example.com' }, { user: false }));
		expect(result).toMatchObject({ status: 401 });
		for (const mock of [...Object.values(recipesMock), ...Object.values(cooksMock)]) {
			expect(mock).not.toHaveBeenCalled();
		}
		expect(importMock.importRecipeFromUrl).not.toHaveBeenCalled();
	});
});

describe('list load', () => {
	it('trims and caps the search query', async () => {
		const href = `https://example.com/recipes?q=${encodeURIComponent(' a'.repeat(80))}`;
		await listLoad({
			request: new Request(href),
			url: new URL(href),
			route: { id: '/(app)/recipes' }
		} as never);
		expect(recipesMock.searchRecipes).toHaveBeenCalledWith({
			q: 'a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a',
			limit: 500
		});
	});
});

describe('saveSuggestion', () => {
	const fields = {
		name: 'Fried Rice',
		description: 'From the pantry',
		ingredientsJson: '[{"name":"rice","quantity":"1","unit":"cup"}]',
		instructionsJson: '["Cook."]',
		prepTimeMinutes: '25',
		servings: '2'
	};

	it('saves a new Suggestion and returns its Recipe id', async () => {
		recipesMock.saveSuggestion.mockResolvedValue({ recipe: { id: 'recipe_9' }, reused: false });
		const result = await listActions.saveSuggestion(ctx(fields));

		expect(recipesMock.saveSuggestion).toHaveBeenCalledWith('user_1', {
			name: 'Fried Rice',
			description: 'From the pantry',
			ingredients: [{ name: 'rice', quantity: '1', unit: 'cup' }],
			steps: ['Cook.'],
			prepTimeMinutes: 25,
			servings: 2
		});
		expect(result).toMatchObject({ recipeId: 'recipe_9', reused: false });
		expect(messageOf(result)).toEqual({ type: 'success', text: 'Saved to your Library' });
		expect(recipesMock.saveRecipe).not.toHaveBeenCalled();
	});

	it('says "Already in your Library" when a Library Recipe is reused', async () => {
		recipesMock.saveSuggestion.mockResolvedValue({ recipe: { id: 'recipe_old' }, reused: true });
		const result = await listActions.saveSuggestion(ctx(fields));

		expect(result).toMatchObject({ recipeId: 'recipe_old', reused: true });
		expect(messageOf(result)).toEqual({ type: 'success', text: 'Already in your Library' });
	});

	it('rejects invalid input without saving', async () => {
		const result = await listActions.saveSuggestion(ctx({ ...fields, ingredientsJson: 'nope' }));
		expect(result).toMatchObject({ status: 400 });
		expect(recipesMock.saveSuggestion).not.toHaveBeenCalled();
	});

	it('answers a service failure with a 500 message', async () => {
		recipesMock.saveSuggestion.mockRejectedValue(new Error('db down'));
		const result = await listActions.saveSuggestion(ctx(fields));
		expect(result).toMatchObject({ status: 500 });
		expect(messageOf(result)).toMatchObject({ type: 'error' });
		expect(loggerMock.error).toHaveBeenCalled();
	});
});

describe('create', () => {
	it('saves an imported recipe with its source and redirects to it', async () => {
		await expect(
			newActions.create(
				ctx({
					name: 'Dal',
					ingredientsJson: '[{"quantity":"1","unit":"cup","name":"lentils"}]',
					instructionsJson: '["Simmer."]',
					prepTimeMinutes: '30',
					servings: '4',
					source: 'imported',
					sourceUrl: 'https://example.com/dal'
				})
			)
		).rejects.toMatchObject({ status: 303, location: '/recipes/recipe_1' });

		expect(recipesMock.saveRecipe).toHaveBeenCalledWith('user_1', {
			name: 'Dal',
			description: '',
			ingredientsJson: [{ quantity: '1', unit: 'cup', name: 'lentils' }],
			instructionsJson: ['Simmer.'],
			prepTimeMinutes: 30,
			servings: 4,
			source: 'imported',
			sourceUrl: 'https://example.com/dal'
		});
	});

	it('rejects a missing name without saving', async () => {
		const result = await newActions.create(ctx({ name: '' }));
		expect(result).toMatchObject({ status: 400 });
		expect(recipesMock.saveRecipe).not.toHaveBeenCalled();
	});
});

describe('update', () => {
	it('saves the edit from the drawer or the recipe page', async () => {
		const result = await detailActions.update(
			ctx(
				{
					name: ' Dal ',
					description: 'Weeknight',
					ingredientsJson: '[{"quantity":"1","unit":"cup","name":"lentils"}]',
					instructionsJson: '["Simmer."]',
					prepTimeMinutes: '30',
					servings: '4'
				},
				{ id: 'recipe_9' }
			)
		);

		expect(messageOf(result)).toEqual({ type: 'success', text: 'Recipe saved.' });
		expect(recipesMock.updateRecipe).toHaveBeenCalledWith('recipe_9', {
			name: 'Dal',
			description: 'Weeknight',
			ingredientsJson: [{ quantity: '1', unit: 'cup', name: 'lentils' }],
			instructionsJson: ['Simmer.'],
			prepTimeMinutes: 30,
			servings: 4
		});
	});

	it.each([
		['a blank name', { name: '  ' }],
		['zero servings', { name: 'Dal', servings: '0' }],
		['a prep time over a day', { name: 'Dal', prepTimeMinutes: '1441' }],
		['malformed ingredients', { name: 'Dal', ingredientsJson: '[{' }]
	])('rejects %s without saving', async (_label, fields) => {
		const result = await detailActions.update(ctx(fields));
		expect(result).toMatchObject({ status: 400 });
		expect(recipesMock.updateRecipe).not.toHaveBeenCalled();
	});
});

describe('importUrl', () => {
	const imported = {
		name: 'Soup',
		description: '',
		ingredients: [],
		steps: ['Heat.'],
		prepTimeMinutes: 10,
		servings: 2
	};

	it('fills the form for review without saving', async () => {
		importMock.importRecipeFromUrl.mockResolvedValue(imported);
		const result = (await newActions.importUrl(ctx({ url: 'https://example.com/soup' }))) as {
			form: { data: Record<string, unknown> };
		};

		expect(result.form.data).toMatchObject({
			name: 'Soup',
			instructionsJson: '["Heat."]',
			source: 'imported',
			sourceUrl: 'https://example.com/soup'
		});
		expect(messageOf(result)?.type).toBe('success');
		expect(recipesMock.saveRecipe).not.toHaveBeenCalled();
	});

	it('rejects a non-http URL before fetching', async () => {
		const result = await newActions.importUrl(ctx({ url: 'file:///etc/passwd' }));
		expect(result).toMatchObject({ status: 400 });
		expect(importMock.importRecipeFromUrl).not.toHaveBeenCalled();
	});

	it('shows the fetch refusal and the unreadable message', async () => {
		importMock.importRecipeFromUrl.mockRejectedValueOnce(
			new importMock.RecipeFetchError('That address isn’t on the public internet.')
		);
		const refused = await newActions.importUrl(ctx({ url: 'https://example.com/' }));
		expect(refused).toMatchObject({ status: 422 });
		expect(messageOf(refused)?.text).toBe('That address isn’t on the public internet.');

		importMock.importRecipeFromUrl.mockRejectedValueOnce(new importMock.UnreadableRecipeError('x'));
		const unreadable = await newActions.importUrl(ctx({ url: 'https://example.com/' }));
		expect(messageOf(unreadable)?.text).toMatch(/Couldn't find a recipe/);
	});

	it('is rate limited', async () => {
		limiterCheck.mockResolvedValueOnce({ limited: true, retryAfter: 60 });
		const result = await newActions.importUrl(ctx({ url: 'https://example.com/' }));
		expect(result).toMatchObject({ status: 429 });
		expect(importMock.importRecipeFromUrl).not.toHaveBeenCalled();
	});
});

describe('importPhoto', () => {
	const jpeg = () => new File([new Uint8Array([1, 2, 3])], 'r.jpg', { type: 'image/jpeg' });

	it('reads an uploaded photo', async () => {
		importMock.importRecipeFromPhoto.mockResolvedValue({
			name: 'Card recipe',
			description: '',
			ingredients: [],
			steps: [],
			prepTimeMinutes: 0,
			servings: 1
		});
		const result = (await newActions.importPhoto(ctx({ photo: jpeg() }))) as {
			form: { data: { name: string; sourceUrl: string } };
		};
		expect(result.form.data).toMatchObject({ name: 'Card recipe', sourceUrl: '' });
	});

	it('gives a clear error for an unreadable photo', async () => {
		importMock.importRecipeFromPhoto.mockRejectedValue(new importMock.UnreadableRecipeError('x'));
		const result = await newActions.importPhoto(ctx({ photo: jpeg() }));
		expect(result).toMatchObject({ status: 422 });
		expect(messageOf(result)?.text).toMatch(/Couldn't read a recipe in that photo/);
	});

	it('rejects a non-image upload and a disabled AI key', async () => {
		const text = new File(['hi'], 'a.txt', { type: 'text/plain' });
		expect(await newActions.importPhoto(ctx({ photo: text }))).toMatchObject({ status: 400 });

		importMock.isRecipeAiEnabled.mockReturnValue(false);
		expect(await newActions.importPhoto(ctx({ photo: jpeg() }))).toMatchObject({ status: 503 });
		expect(importMock.importRecipeFromPhoto).not.toHaveBeenCalled();
	});
});

describe('detail actions', () => {
	it('rate 0 clears the rating', async () => {
		await detailActions.rate(ctx({ rating: '0' }));
		expect(recipesMock.setRecipeRating).toHaveBeenCalledWith('recipe_1', null);

		await detailActions.rate(ctx({ rating: '4' }));
		expect(recipesMock.setRecipeRating).toHaveBeenCalledWith('recipe_1', 4);
	});

	it('logCook records the date and notes for the session user', async () => {
		await detailActions.logCook(ctx({ cookedOn: '2026-10-30', notes: ' Great ' }));
		expect(cooksMock.logCook).toHaveBeenCalledWith('user_1', 'recipe_1', {
			cookedOn: '2026-10-30',
			notes: 'Great'
		});
	});

	it('addToPlanner adds this recipe to the chosen Monday-week day', async () => {
		await detailActions.addToPlanner(ctx({ weekStartDate: '2026-11-02', dayOfWeek: '4' }));
		expect(mealPlanMock.planDinner).toHaveBeenCalledWith({
			userId: 'user_1',
			week: '2026-11-02',
			day: 4,
			dinner: { recipeId: 'recipe_1' }
		});

		const notMonday = await detailActions.addToPlanner(
			ctx({ weekStartDate: '2026-11-03', dayOfWeek: '4' })
		);
		expect(notMonday).toMatchObject({ status: 400 });
	});

	it('addToPlanner reports a recipe that no longer exists', async () => {
		mealPlanMock.planDinner.mockRejectedValueOnce(new mealPlanMock.RecipeNotFoundError());
		const result = await detailActions.addToPlanner(
			ctx({ weekStartDate: '2026-11-02', dayOfWeek: '4' })
		);
		expect(result).toMatchObject({
			status: 404,
			data: { form: { message: { type: 'error', text: 'That recipe no longer exists.' } } }
		});
	});

	it('delete redirects to the library, or reports a recipe already gone', async () => {
		await expect(detailActions.delete(ctx({}))).rejects.toMatchObject({
			status: 303,
			location: '/recipes'
		});

		recipesMock.deleteRecipe.mockResolvedValueOnce(false);
		expect(await detailActions.delete(ctx({}))).toMatchObject({ status: 404 });
	});
});
