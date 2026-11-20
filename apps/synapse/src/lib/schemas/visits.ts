import { z } from 'zod';

import { booleanFromForm } from './common';

/**
 * Schema for creating and updating people
 */
export const personSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
	isExempt: booleanFromForm.default(false)
});

/**
 * Schema for scheduling a future visit for a person with no logged visits yet
 */
export const scheduleVisitSchema = z.object({
	scheduledVisitDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)')
});

/**
 * Schema for creating and updating visits
 */
export const visitSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)'),
	time: z.preprocess(
		(value) => (value === '' ? undefined : value),
		z
			.string()
			.regex(/^\d{2}:\d{2}$/, 'Invalid time format (use HH:MM)')
			.optional()
	),
	companions: z.string().optional(),
	notes: z.string().optional(),
	nextVisitDate: z.preprocess(
		(value) => (value === '' ? undefined : value),
		z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)')
			.optional()
	)
});

/**
 * Schema for deleting a single visit
 */
export const deleteVisitSchema = z.object({
	visitId: z.string().min(1, 'Visit ID is required')
});

/**
 * Schema for restoring an archived person from Admin → Archived persons
 */
export const unarchivePersonSchema = z.object({
	personId: z.string().min(1, 'Person ID is required')
});
