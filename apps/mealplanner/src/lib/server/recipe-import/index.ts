// Bring a recipe in from outside: a web page (JSON-LD first, the model as fallback) or a
// photo. Both return an import result for the user to review before anything is saved.
import type { AiImage } from '@sheppakai/shared/ai-vision';

import type { RecipeImportResult } from '#lib/schemas/recipes.js';
import { logger } from '#lib/server/logger.js';

import { extractRecipe, isRecipeAiEnabled, UnreadableRecipeError } from './ai-extract';
import { htmlToText } from './html-text';
import { findJsonLdRecipe } from './json-ld';
import { fetchRecipePage } from './safe-fetch';

export { isRecipeAiEnabled, UnreadableRecipeError } from './ai-extract';
export { RecipeFetchError } from './safe-fetch';

export async function importRecipeFromUrl(url: string): Promise<RecipeImportResult> {
	const html = await fetchRecipePage(url);

	const fromJsonLd = findJsonLdRecipe(html);
	logger.info('Recipe page fetched', { host: new URL(url).hostname, jsonLd: Boolean(fromJsonLd) });
	if (fromJsonLd) return fromJsonLd;

	if (!isRecipeAiEnabled()) throw new UnreadableRecipeError('No JSON-LD recipe, AI disabled');
	return extractRecipe({ pageText: htmlToText(html) });
}

export function importRecipeFromPhoto(image: AiImage): Promise<RecipeImportResult> {
	return extractRecipe({ image });
}
