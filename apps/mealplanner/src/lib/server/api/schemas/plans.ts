import { z } from 'zod';

import { parseIsoDate } from '#lib/dates.js';
import { weekStartDateSchema } from '#lib/schemas/mealPlan.js';

// Reads accept any date and resolve to the week containing it, so a caller can ask for
// "the week of today" without computing the Monday itself.
export const apiPlanQuerySchema = z.object({
	week: z
		.string()
		.refine((value) => parseIsoDate(value) !== null, 'Invalid date, expected YYYY-MM-DD')
		.optional()
});

// Writes name the exact plan, so they require the Monday the plan is keyed on.
export const apiPlanDayParamsSchema = z.object({
	week: weekStartDateSchema,
	day: z.coerce.number().int().min(0, 'Day must be 0-6').max(6, 'Day must be 0-6')
});

export const apiSetPlanDaySchema = z.object({
	recipeId: z.string().min(1, 'recipeId is required')
});
