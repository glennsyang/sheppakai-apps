import { logger } from '$lib/server/logger';
import { listPantryItems } from '$lib/server/services/pantry';

import type { PageServerLoad } from './$types';

// No form actions: the page calls POST /api/suggest directly.
export const load: PageServerLoad = async () => {
	try {
		const pantryItems = await listPantryItems();
		return { pantryItems };
	} catch (error) {
		logger.error('Failed to load pantry items:', error);
		return {
			pantryItems: [],
			loadError: 'Failed to load your pantry. Please try refreshing the page.'
		};
	}
};
