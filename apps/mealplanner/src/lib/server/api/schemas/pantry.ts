import { addPantryItemSchema } from '#lib/schemas/pantry.js';

// Same field rules as the pantry page's add form, so the API and the UI can't drift.
export const apiCreatePantryItemSchema = addPantryItemSchema;

export const apiUpdatePantryItemSchema = addPantryItemSchema
	.partial()
	.refine((patch) => Object.keys(patch).length > 0, 'Provide at least one field to update');
