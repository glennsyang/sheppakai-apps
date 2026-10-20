import { z } from 'zod';

import { isMoodValue, type MoodValue } from '#lib/utils/mood.js';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)');

export const apiUpsertMoodSchema = z
	.object({
		date: dateString,
		mood: z.custom<MoodValue>(
			(value) => typeof value === 'string' && isMoodValue(value),
			'Choose a valid mood'
		),
		customMood: z.string().trim().max(40, 'Custom mood must be 40 characters or fewer').optional(),
		notes: z.string().trim().max(280, 'Notes must be 280 characters or fewer').optional()
	})
	.superRefine((data, ctx) => {
		if (data.mood === 'custom' && !data.customMood?.trim()) {
			ctx.addIssue({
				code: 'custom',
				message: 'Add a custom mood label',
				path: ['customMood']
			});
		}
	});

export const apiMoodListQuerySchema = z
	.object({
		startDate: dateString.optional(),
		endDate: dateString.optional()
	})
	.refine((data) => (data.startDate === undefined) === (data.endDate === undefined), {
		message: 'startDate and endDate must be given together',
		path: ['startDate']
	});

export type ApiUpsertMoodInput = z.infer<typeof apiUpsertMoodSchema>;
