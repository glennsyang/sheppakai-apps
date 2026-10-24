import type { MealType } from '#lib/schemas/fitness.js';

interface LoggedMeal {
	date: string;
	timeOfDay: string;
	description: string;
	caloriesEstimate: number | null;
}

export interface FrequentMeal {
	description: string;
	timeOfDay: MealType;
	caloriesEstimate: number | null;
	count: number;
	lastDate: string;
}

const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function isMealType(value: string): value is MealType {
	return (MEAL_TYPES as readonly string[]).includes(value);
}

/** Whitespace and case don't make two meals different ("Oatmeal " and "oatmeal"). */
function mealKey(description: string): string {
	return description.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The meals worth offering as one-tap re-logs: grouped by description, most-logged first, ties
 * broken by most recent. Each keeps the wording and calories of its latest log and the meal type
 * it's most often logged as.
 */
export function getFrequentMeals(meals: LoggedMeal[], limit = 5): FrequentMeal[] {
	const groups = new Map<
		string,
		{ latest: LoggedMeal; count: number; typeCounts: Map<MealType, number> }
	>();

	for (const meal of meals) {
		const key = mealKey(meal.description);
		if (!key || !isMealType(meal.timeOfDay)) continue;

		const group = groups.get(key);
		if (!group) {
			groups.set(key, { latest: meal, count: 1, typeCounts: new Map([[meal.timeOfDay, 1]]) });
			continue;
		}

		group.count += 1;
		group.typeCounts.set(meal.timeOfDay, (group.typeCounts.get(meal.timeOfDay) ?? 0) + 1);
		if (meal.date > group.latest.date) group.latest = meal;
	}

	return [...groups.values()]
		.map(({ latest, count, typeCounts }) => ({
			description: latest.description.trim(),
			timeOfDay: [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0],
			caloriesEstimate: latest.caloriesEstimate,
			count,
			lastDate: latest.date
		}))
		.sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
		.slice(0, limit);
}
