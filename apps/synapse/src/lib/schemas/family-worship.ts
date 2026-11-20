import { z } from 'zod';

import { isHttpUrl, parseLinkLines } from '#lib/utils/family-worship.js';

import { booleanFromForm } from './common';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)');

/**
 * Topic catalog entry; `id` is set when editing. `links` is a textarea, one URL per line.
 */
export const topicSchema = z.object({
	id: z.string().optional(),
	title: z.string().trim().min(1, 'Title is required').max(120, 'Title is too long'),
	description: z.string().max(2000, 'Description is too long').optional(),
	notes: z.string().max(4000, 'Notes are too long').optional(),
	scriptureRefs: z.string().max(500, 'Scripture references are too long').optional(),
	links: z
		.string()
		.optional()
		.refine((value) => parseLinkLines(value).every(isHttpUrl), {
			message: 'Each link must be a full http(s) URL on its own line'
		})
});

/** Set (or clear, with an empty topicId) the topic planned for one Wednesday. */
export const scheduleWeekSchema = z.object({
	weekOf: dateString,
	topicId: z.string().optional()
});

/**
 * Log (or edit, with `id`) what happened in a week. The week comes from `date`, so a study
 * moved to Thursday still lands on that week.
 */
export const sessionSchema = z
	.object({
		id: z.string().optional(),
		status: z.enum(['done', 'skipped']).default('done'),
		date: dateString,
		topicId: z.string().optional(),
		notes: z.string().max(2000, 'Notes are too long').optional(),
		continueNextWeek: booleanFromForm.default(false)
	})
	.superRefine((value, ctx) => {
		if (value.status === 'done' && !value.topicId) {
			ctx.addIssue({ code: 'custom', path: ['topicId'], message: 'Pick the topic you covered' });
		}
	});
