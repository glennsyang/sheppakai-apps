import { redirect } from '@sveltejs/kit';

import { getMondayOf, parseIsoDate } from '#lib/dates.js';
import { weekStartDateSchema } from '#lib/schemas/mealPlan.js';

/**
 * The Monday (`YYYY-MM-DD`) of the week containing `today`, read from local date
 * components so a local-midnight date never shifts to the previous day via UTC.
 */
export function currentWeek(today: Date = new Date()): string {
	return getMondayOf(today);
}

/**
 * Resolve `?week=` to a Monday plan key. A real date that isn't a Monday redirects to
 * that week's Monday; anything unparseable redirects to the current week, so arbitrary
 * strings never become meal-plan keys and the URL always matches what's shown.
 */
export function resolveWeekStartDate(url: URL): string {
	const week = url.searchParams.get('week');
	if (week === null) return currentWeek();
	if (weekStartDateSchema.safeParse(week).success) return week;

	const date = parseIsoDate(week);
	if (date) throw redirect(302, `${url.pathname}?week=${getMondayOf(date)}`);
	throw redirect(302, url.pathname);
}
