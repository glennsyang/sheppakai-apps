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
