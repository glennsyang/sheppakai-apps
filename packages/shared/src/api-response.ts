/**
 * JSON-API counterpart to the superforms `message(form, {...}, {status})` contract in
 * docs/ERROR_HANDLING_POLICY.md: exactly one success shape, one error shape, explicit
 * HTTP status, no ad-hoc fourth shape. `/api/v1/*` routes have no superform to attach a
 * message to, so this is the equivalent envelope for plain JSON responses.
 */
export type ApiErrorCode =
	| 'missing_header'
	| 'invalid_scheme'
	| 'malformed_header'
	| 'invalid_api_key'
	| 'unauthorized'
	| 'rate_limited'
	| 'validation_failed'
	| 'invalid_json'
	| 'not_found'
	| 'conflict'
	| 'internal_error';

export function apiSuccess<T>(data: T, status = 200): Response {
	return Response.json({ data }, { status });
}

/**
 * `reason` is an optional machine-readable detail under the `code`, for clients that need to tell
 * apart several rule violations sharing one code (e.g. which `conflict` it was).
 */
export function apiError(
	code: ApiErrorCode,
	message: string,
	status: number,
	reason?: string
): Response {
	return Response.json(
		{ error: reason ? { code, message, reason } : { code, message } },
		{ status }
	);
}
