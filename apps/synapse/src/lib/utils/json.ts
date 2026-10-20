import { z } from 'zod';

export const stringListSchema = z.array(z.string());
export const numberListSchema = z.array(z.number());

/**
 * Parses a JSON column and checks it against `schema`. Missing, malformed or wrong-shaped
 * JSON returns `fallback` rather than throwing.
 */
export function safeParse<T>(
	json: string | null | undefined,
	schema: z.ZodType<T>,
	fallback: T
): T {
	if (!json) return fallback;
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return fallback;
	}
	const result = schema.safeParse(parsed);
	return result.success ? result.data : fallback;
}
