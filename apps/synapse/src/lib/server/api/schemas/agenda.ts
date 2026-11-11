import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)');

/** `date` defaults to today (Pacific) in the handler, so it stays optional here. */
export const apiAgendaQuerySchema = z.object({
	date: dateString.optional()
});
