import type { ZodType } from 'zod';

import type { ApiAuditEntry } from './api-audit-log';
import { apiError, apiSuccess, type ApiErrorCode } from './api-response';

/**
 * Thrown by `db/writes/*` functions for expected, user-facing failures (not found,
 * a duplicate title, etc.) so route handlers can map them straight to an `apiError`
 * response instead of falling through to a generic 500.
 */
export class ApiWriteError extends Error {
	code: ApiErrorCode;
	status: number;

	constructor(code: ApiErrorCode, message: string, status: number) {
		super(message);
		this.name = 'ApiWriteError';
		this.code = code;
		this.status = status;
	}
}

/**
 * Reads and validates a JSON request body: `invalid_json` / `validation_failed` (400) on
 * failure, the parsed data otherwise.
 */
export async function parseJsonBody<T>(
	request: Request,
	schema: ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return {
			ok: false,
			response: apiError('invalid_json', 'Request body must be valid JSON.', 400)
		};
	}

	return validate(body, schema);
}

/**
 * Validates a GET route's query string (`?a=1&b=2` as a flat object): `validation_failed`
 * (400) on failure, the parsed data otherwise.
 */
export function parseQuery<T>(
	url: URL,
	schema: ZodType<T>
): { ok: true; data: T } | { ok: false; response: Response } {
	return validate(Object.fromEntries(url.searchParams), schema);
}

function validate<T>(
	input: unknown,
	schema: ZodType<T>
): { ok: true; data: T } | { ok: false; response: Response } {
	const parsed = schema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			response: apiError(
				'validation_failed',
				parsed.error.issues.map((i) => i.message).join('; '),
				400
			)
		};
	}

	return { ok: true, data: parsed.data };
}

type WriteContext = Omit<ApiAuditEntry, 'statusCode'>;

/**
 * Returns `handleApiWrite`, the success/failure envelope for every `/api/v1/*` write route:
 * runs `perform`, records an audit-log entry for the outcome either way (per the
 * audit-trail guarantee in docs/API_CONVENTIONS.md), and maps a thrown `ApiWriteError` to
 * its typed response or anything else to a logged 500.
 */
export function createHandleApiWrite(deps: {
	recordApiWrite: (entry: ApiAuditEntry) => Promise<void>;
	logger: { error(message: string, error?: unknown): void };
}) {
	const { recordApiWrite, logger } = deps;

	return async function handleApiWrite<T>(
		context: WriteContext,
		perform: () => Promise<T>,
		options: { successStatus?: number; failureMessage: string }
	): Promise<Response> {
		const successStatus = options.successStatus ?? 201;

		try {
			const result = await perform();
			await recordApiWrite({ ...context, statusCode: successStatus });
			return apiSuccess(result, successStatus);
		} catch (error) {
			const statusCode = error instanceof ApiWriteError ? error.status : 500;
			await recordApiWrite({ ...context, statusCode });

			if (error instanceof ApiWriteError) {
				return apiError(error.code, error.message, error.status);
			}

			logger.error(`API: ${options.failureMessage}`, error);
			return apiError('internal_error', `${options.failureMessage}.`, 500);
		}
	};
}
