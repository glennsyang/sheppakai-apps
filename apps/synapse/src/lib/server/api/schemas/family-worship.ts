import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)');
const note = z.string().trim().max(2000, 'note is too long').nullable().optional();

/** `GET /api/v1/family-worship/plan`: this week plus `weeks - 1` upcoming, and recent unlogged weeks. */
export const apiPlanQuerySchema = z.object({
	weeks: z.coerce.number().int().min(1).max(26).default(8),
	lookbackWeeks: z.coerce.number().int().min(0).max(12).default(4)
});

export const apiPlanWeekSchema = z.object({
	topicId: z.string().min(1, 'topicId is required')
});

export const apiSessionListQuerySchema = z.object({
	topicId: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const apiCreateSessionSchema = z.object({
	date: dateString,
	topicId: z.string().min(1, 'topicId is required'),
	note,
	/** Required to log into a Skipped Week (the skip is removed). */
	confirmUnskip: z.boolean().default(false),
	/** Plan the same topic for the following week. */
	continueNextWeek: z.boolean().default(false),
	/** When next week already holds another topic: replace it, or push later plans back a week. */
	nextWeekConflict: z.enum(['replace', 'shift']).optional()
});

export const apiUpdateSessionSchema = z
	.object({
		date: dateString.optional(),
		topicId: z.string().min(1, 'topicId cannot be empty').optional(),
		note,
		confirmUnskip: z.boolean().default(false)
	})
	.refine(
		(body) => body.date !== undefined || body.topicId !== undefined || body.note !== undefined,
		'Send at least one of date, topicId or note'
	);

export const apiSkipWeekSchema = z.object({
	weekStart: dateString,
	reason: z.string().trim().max(200, 'reason is too long').nullable().optional()
});
