import { weekdayIndex } from '#lib/dates.js';
import { logger } from '#lib/server/logger.js';
import { getMealPlanWithEntries } from '#lib/server/services/mealPlan.js';
import { listPantryItems } from '#lib/server/services/pantry.js';
import { currentWeek } from '#lib/server/week.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const weekStartDate = currentWeek();
	// Server-local guess at today; the page corrects it to the browser's own clock.
	const todayIndex = weekdayIndex(new Date());

	try {
		const [entries, pantryItems] = await Promise.all([
			getMealPlanWithEntries(weekStartDate),
			listPantryItems()
		]);

		return { weekStartDate, entries, pantryCount: pantryItems.length, todayIndex };
	} catch (error) {
		logger.error("Failed to load this week's meals:", error);
		return {
			weekStartDate,
			entries: [],
			pantryCount: 0,
			todayIndex,
			loadError: "Failed to load this week's plan. Please try refreshing the page."
		};
	}
};
