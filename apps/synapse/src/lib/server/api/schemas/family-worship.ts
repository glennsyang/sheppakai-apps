import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)');

export const apiTopicListQuerySchema = z.object({
	includeArchived: z
		.enum(['true', 'false'])
		.default('false')
		.transform((value) => value === 'true')
});

export const apiScheduleQuerySchema = z.object({
	weeks: z.coerce.number().int().min(1).max(26).default(8)
});

export const apiSessionListQuerySchema = z.object({
	topicId: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const apiLogSessionSchema = z
	.object({
		date: dateString,
		status: z.enum(['done', 'skipped']).default('done'),
		topicId: z.string().min(1).optional(),
		notes: z.string().max(2000).optional(),
		continueNextWeek: z.boolean().optional()
	})
	.refine((value) => value.status === 'skipped' || Boolean(value.topicId), {
		message: 'topicId is required when status is done',
		path: ['topicId']
	});

export const apiUpdateSessionSchema = z.object({
	date: dateString.optional(),
	status: z.enum(['done', 'skipped']).optional(),
	topicId: z.string().min(1).nullable().optional(),
	notes: z.string().max(2000).nullable().optional()
});
