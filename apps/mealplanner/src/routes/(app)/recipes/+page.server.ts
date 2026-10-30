import { logger } from '#lib/server/logger.js';
import { searchRecipes } from '#lib/server/services/recipes.js';

import type { PageServerLoad } from './$types';

const MAX_QUERY_LENGTH = 100;
const LIBRARY_LIMIT = 500;

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH).trim();
	try {
		return { recipes: await searchRecipes({ q, limit: LIBRARY_LIMIT }), q };
	} catch (error) {
		logger.error('Failed to load recipes:', error);
		return {
			recipes: [],
			q,
			loadError: 'Failed to load your recipes. Please try refreshing the page.'
		};
	}
};
