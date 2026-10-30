import { toAiImage } from '@sheppakai/shared/ai-vision';
import { isRedirect, redirect, type RequestEvent } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { ingredientsJsonSchema, instructionsJsonSchema } from '#lib/schemas/mealPlan.js';
import {
	importResultToForm,
	importUrlSchema,
	type RecipeImportResult,
	recipeFormSchema
} from '#lib/schemas/recipes.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { logger } from '#lib/server/logger.js';
import { createUserRateLimiter } from '#lib/server/rate-limiter.js';
import {
	importRecipeFromPhoto,
	importRecipeFromUrl,
	isRecipeAiEnabled,
	RecipeFetchError,
	UnreadableRecipeError
} from '#lib/server/recipe-import/index.js';
import { saveRecipe } from '#lib/server/services/recipes.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	form: await superValidate(zod4(recipeFormSchema)),
	photoImportEnabled: isRecipeAiEnabled()
});

// Each import is a page fetch and often a paid AI call; 20 an hour covers a busy evening.
const importLimiter = createUserRateLimiter([20, 'h']);

type ImportOutcome =
	| { result: RecipeImportResult; sourceUrl?: string }
	| { error: string; status: 400 | 413 | 429 | 503 };

/**
 * Shared shell of both imports: rate limit, run, and answer with the recipe as form data for
 * review (nothing is saved), or an error message on an empty form.
 */
async function runImport(
	event: RequestEvent,
	userId: string,
	kind: 'url' | 'photo',
	run: () => Promise<ImportOutcome>
) {
	const emptyForm = await superValidate(zod4(recipeFormSchema));
	const fail = (text: string, status: 400 | 413 | 422 | 429 | 502 | 503) =>
		message(emptyForm, { type: 'error', text }, { status });

	const limit = await importLimiter.check(event, { userId });
	if (limit.limited)
		return fail(`Too many imports. Try again in ${limit.retryAfter} seconds.`, 429);

	try {
		const outcome = await run();
		if ('error' in outcome) return fail(outcome.error, outcome.status);
		const form = await superValidate(
			importResultToForm(outcome.result, outcome.sourceUrl),
			zod4(recipeFormSchema)
		);
		return message(form, {
			type: 'success',
			text: 'Recipe imported. Check the details, then save.'
		});
	} catch (err) {
		if (isRedirect(err)) throw err;
		if (err instanceof RecipeFetchError) {
			logger.warn('Recipe page fetch refused', { userId, reason: err.message });
			return fail(err.message, 422);
		}
		if (err instanceof UnreadableRecipeError) {
			logger.warn('Recipe import unreadable', { userId, kind, reason: err.message });
			return fail(
				kind === 'url'
					? "Couldn't find a recipe on that page. Try another link, or add it by hand."
					: "Couldn't read a recipe in that photo. Try a sharper, flatter photo, or add it by hand.",
				422
			);
		}
		logger.error('Recipe import failed', err, { userId, kind });
		return fail('Importing failed. Try again, or add the recipe by hand.', 502);
	}
}

export const actions: Actions = {
	create: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(recipeFormSchema));
		if (!form.valid) return invalidForm(form);

		let id: string;
		try {
			const recipe = await saveRecipe(user.id, {
				name: form.data.name,
				description: form.data.description,
				ingredientsJson: ingredientsJsonSchema.parse(form.data.ingredientsJson),
				instructionsJson: instructionsJsonSchema.parse(form.data.instructionsJson),
				prepTimeMinutes: form.data.prepTimeMinutes,
				servings: form.data.servings,
				source: form.data.source,
				sourceUrl: form.data.sourceUrl || null
			});
			id = recipe.id;
		} catch (err) {
			if (isRedirect(err)) throw err;
			logger.error('Failed to create recipe', err, { userId: user.id });
			return message(
				form,
				{ type: 'error', text: 'Could not save that recipe. Please try again.' },
				{ status: 500 }
			);
		}
		throw redirect(303, `/recipes/${id}`);
	}),

	/** Reads a recipe off a web page into the form for review. Nothing is saved. */
	importUrl: requireAuth(async (event, user) =>
		runImport(event, user.id, 'url', async () => {
			const parsed = importUrlSchema.safeParse({
				url: (await event.request.formData()).get('url') ?? ''
			});
			if (!parsed.success) {
				return { error: 'Enter a web address starting with http(s)://', status: 400 };
			}
			return { result: await importRecipeFromUrl(parsed.data.url), sourceUrl: parsed.data.url };
		})
	),

	/** Reads a photographed recipe into the form for review. The photo is never stored. */
	importPhoto: requireAuth(async (event, user) =>
		runImport(event, user.id, 'photo', async () => {
			if (!isRecipeAiEnabled()) return { error: 'Photo import is not set up.', status: 503 };

			let photo: FormDataEntryValue | null;
			try {
				photo = (await event.request.formData()).get('photo');
			} catch (err) {
				// Bodies over adapter-node's BODY_SIZE_LIMIT fail here, not in toAiImage.
				logger.warn('Recipe photo unreadable', { userId: user.id, reason: String(err) });
				return { error: 'That photo is too large to upload. Try a smaller one.', status: 413 };
			}
			const image = await toAiImage(photo);
			if (!image) return { error: 'Upload a JPEG, PNG or WebP photo under 5 MB.', status: 400 };
			return { result: await importRecipeFromPhoto(image) };
		})
	)
};
