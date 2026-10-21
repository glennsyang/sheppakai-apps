import { z } from 'zod';

import { logger } from '#lib/server/logger.js';

export const stringListSchema = z.array(z.string());
export const numberListSchema = z.array(z.number());

/**
 * Parses a JSON column (or JSON form field) and checks it against `schema`. Missing input
 * returns `fallback` quietly; malformed or wrong-shaped JSON logs a warning naming `field`
 * and returns `fallback` rather than throwing.
 */
export function safeParse<T>(
	json: string | null | undefined,
	schema: z.ZodType<T>,
	fallback: T,
	field: string
): T {
	if (!json) return fallback;
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		logger.warn('JSON value is not valid JSON; using fallback', { field });
		return fallback;
	}
	const result = schema.safeParse(parsed);
	if (!result.success) {
		// Issue paths only, never the values: the JSON may hold user content.
		logger.warn('JSON value failed its schema check; using fallback', {
			field,
			issues: result.error.issues.map((issue) => issue.path.join('.') || '(root)')
		});
		return fallback;
	}
	return result.data;
}
