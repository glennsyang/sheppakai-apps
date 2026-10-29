import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)');

export const apiMeditationListQuerySchema = z
	.object({
		startDate: dateString.optional(),
		endDate: dateString.optional(),
		limit: z.coerce.number().int().min(1).max(200).default(50)
	})
	.refine((data) => (data.startDate === undefined) === (data.endDate === undefined), {
		message: 'startDate and endDate must be given together',
		path: ['startDate']
	});
