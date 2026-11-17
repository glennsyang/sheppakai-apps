import { z } from 'zod';

import { weekStartDateSchema } from './mealPlan';

export const addShoppingItemSchema = z.object({
	weekStartDate: weekStartDateSchema,
	name: z.string().trim().min(1, 'Item name is required').max(100, 'Item name too long'),
	quantity: z.coerce.number().positive().nullable().optional(),
	unit: z.string().trim().max(30, 'Unit too long').nullable().optional()
});

export const toggleShoppingItemSchema = z.object({
	id: z.string().min(1, 'Item ID is required'),
	// The state to set, as the checkbox form posts it.
	checked: z.enum(['true', 'false'])
});

export const removeShoppingItemSchema = z.object({
	id: z.string().min(1, 'Item ID is required')
});
