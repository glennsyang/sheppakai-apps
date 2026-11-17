import { redirect } from '@sveltejs/kit';

import { getMondayOf, parseIsoDate } from '#lib/dates.js';
import { weekStartDateSchema } from '#lib/schemas/mealPlan.js';
import { getMondayOfCurrentWeek } from '#lib/server/services/mealPlan.js';

/**
 * Resolve `?week=` to a Monday plan key. A real date that isn't a Monday redirects to
 * that week's Monday; anything unparseable redirects to the current week, so arbitrary
 * strings never become meal-plan keys and the URL always matches what's shown.
 */
export function resolveWeekStartDate(url: URL): string {
	const week = url.searchParams.get('week');
	if (week === null) return getMondayOfCurrentWeek();
	if (weekStartDateSchema.safeParse(week).success) return week;

	const date = parseIsoDate(week);
	if (date) throw redirect(302, `${url.pathname}?week=${getMondayOf(date)}`);
	throw redirect(302, url.pathname);
}
