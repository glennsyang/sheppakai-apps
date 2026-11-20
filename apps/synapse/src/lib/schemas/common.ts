import { z } from 'zod';

/** The lone `id` a delete/confirm action posts — `ConfirmDialog` always sends one. */
export const idSchema = z.object({
	id: z.string().trim().min(1, 'ID is required')
});

/**
 * For actions that take their target from the route params and post no fields of their own.
 * Validating against an empty schema still gives the action a form, so a failure can answer
 * with `message(form, …)` per `docs/ERROR_HANDLING_POLICY.md`.
 */
export const noFieldsSchema = z.object({});

/** A checkbox/boolean form field: 'on' / 'true' / '1' → true; absent or empty → false. */
export const booleanFromForm = z.preprocess((value) => {
	if (value === true || value === 'true' || value === 'on' || value === 1 || value === '1') {
		return true;
	}

	if (
		value === false ||
		value === 'false' ||
		value === 0 ||
		value === '0' ||
		value === undefined ||
		value === null ||
		value === ''
	) {
		return false;
	}

	return value;
}, z.boolean());
