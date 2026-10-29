import { parseIsoDate, toLocalIsoDate } from '#lib/dates.js';
import { DAY_LABELS, type MealPlanEntryWithRecipe } from '#lib/types.js';

import { toApiRecipe } from './recipes';

/** A week as /api/v1 returns it: always seven days, Monday first, empty days with `recipe: null`. */
export function toApiWeek(weekStartDate: string, entries: MealPlanEntryWithRecipe[]) {
	const monday = parseIsoDate(weekStartDate);
	if (!monday) throw new Error(`Invalid week start date: ${weekStartDate}`);
	const byDay = new Map(entries.map((e) => [e.entry.dayOfWeek, e]));

	return {
		weekStartDate,
		days: DAY_LABELS.map((label, dayOfWeek) => {
			const date = new Date(monday);
			date.setDate(monday.getDate() + dayOfWeek);
			const planned = byDay.get(dayOfWeek);
			return {
				dayOfWeek,
				day: label,
				date: toLocalIsoDate(date),
				entryId: planned?.entry.id ?? null,
				recipe: planned ? toApiRecipe(planned.recipe) : null
			};
		})
	};
}
