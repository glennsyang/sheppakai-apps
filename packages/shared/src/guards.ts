/** Narrows an unknown value (a caught error, a parsed JSON body) to a plain object whose keys can be read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
