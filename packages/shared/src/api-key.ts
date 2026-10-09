import type { ApiErrorCode } from './api-response';
import { permissionsForScope } from './api-scopes';
import { isBanActive, isUserAccessAllowed } from './auth-allowlist';
import { parseBearerToken } from './bearer-token';

type ApiKeyAuthSuccess = { ok: true; apiKeyId: string; userId: string };
type ApiKeyAuthFailure = { ok: false; status: 401 | 429; code: ApiErrorCode; message: string };
export type ApiKeyAuthResult = ApiKeyAuthSuccess | ApiKeyAuthFailure;

/** The key owner's row, as each app's `findOwner` returns it. */
export type ApiKeyOwner = {
	id: string;
	email: string;
	role?: string | null;
	banned?: boolean | null;
	banExpires?: Date | string | null;
};

export type ApiKeyOwnerRejection =
	| 'owner_not_found'
	| 'owner_banned'
	| 'owner_not_allowed'
	| 'owner_not_admin';

type VerifyApiKeyResult = {
	valid: boolean;
	error?: { code?: string } | null;
	key?: { id: string; referenceId: string } | null;
};

interface RequireApiKeyDeps {
	verifyApiKey: (context: {
		body: { key: string; permissions: Record<string, string[]> };
	}) => Promise<VerifyApiKeyResult>;
	findOwner: (userId: string) => Promise<ApiKeyOwner | null | undefined>;
	allowedEmails: Set<string>;
	isAdminUser: (user: { id: string; role?: string | null }) => boolean;
	logger: { warn(message: string, meta?: Record<string, unknown>): void };
}

// The api-key plugin folds a rate-limited verification and an out-of-quota key into
// these two codes (see node_modules/@better-auth/api-key's verifyApiKey handler);
// everything else (unknown key, disabled, expired, or a scope the key doesn't have)
// comes back as a generic invalid-key failure, deliberately not distinguishable from
// each other so a caller can't probe which reason applies to a given key.
const RATE_LIMIT_ERROR_CODES = new Set(['RATE_LIMITED', 'USAGE_EXCEEDED']);

const INVALID_KEY: ApiKeyAuthFailure = {
	ok: false,
	status: 401,
	code: 'invalid_api_key',
	message: 'Invalid API key.'
};

/**
 * The one API-key owner rule for every app. The api-key plugin checks only the key row
 * (enabled, expiry, scope, rate limit), never its owner, and keys are minted only from the
 * admin page. So a key is live only while its owner still exists, is not banned, is still
 * in ALLOWED_EMAILS, and is still an admin. Otherwise a banned, removed or demoted admin's
 * keys would keep working until they expire (up to 365 days). Returns `null` when allowed.
 */
export function getApiKeyOwnerRejection(
	owner: ApiKeyOwner | null | undefined,
	allowedEmails: Set<string>,
	isAdminUser: RequireApiKeyDeps['isAdminUser']
): ApiKeyOwnerRejection | null {
	if (!owner) return 'owner_not_found';
	if (isBanActive(owner)) return 'owner_banned';
	if (!isUserAccessAllowed(owner, allowedEmails)) return 'owner_not_allowed';
	if (!isAdminUser(owner)) return 'owner_not_admin';
	return null;
}

/**
 * Returns `requireApiKey(request, scope)`, which authenticates an external `/api/v1/*`
 * request against an API key. It reads only the `Authorization: Bearer <key>` header —
 * never a query string, never `event.locals` — so this is a fully separate auth path from
 * session-cookie auth, by design: a valid session must never grant access to `/api/v1/*`,
 * and a valid API key must never grant access to session-only routes.
 */
export function createRequireApiKey<TScope extends string>(deps: RequireApiKeyDeps) {
	const { verifyApiKey, findOwner, allowedEmails, isAdminUser, logger } = deps;

	return async function requireApiKey(request: Request, scope: TScope): Promise<ApiKeyAuthResult> {
		const path = new URL(request.url).pathname;
		const parsed = parseBearerToken(request.headers.get('authorization'));

		if (parsed.reason) {
			logger.warn('API key auth failed', { path, reason: parsed.reason });
			return {
				ok: false,
				status: 401,
				code: parsed.reason,
				message: 'Missing or malformed Authorization header. Use "Authorization: Bearer <key>".'
			};
		}

		const result = await verifyApiKey({
			body: { key: parsed.token, permissions: permissionsForScope(scope) }
		});

		if (!result.valid || !result.key) {
			const errorCode = result.error?.code;
			logger.warn('API key auth failed', { path, reason: errorCode ?? 'invalid_api_key' });

			if (errorCode !== undefined && RATE_LIMIT_ERROR_CODES.has(errorCode)) {
				return {
					ok: false,
					status: 429,
					code: 'rate_limited',
					message: 'Rate limit exceeded for this API key. Try again later.'
				};
			}

			return INVALID_KEY;
		}

		// Same generic 401 as any other invalid key, so the response doesn't reveal the
		// owner's status.
		const owner = await findOwner(result.key.referenceId);
		const rejection = getApiKeyOwnerRejection(owner, allowedEmails, isAdminUser);
		if (rejection) {
			logger.warn('API key auth failed', { path, reason: rejection, apiKeyId: result.key.id });
			return INVALID_KEY;
		}

		return { ok: true, apiKeyId: result.key.id, userId: result.key.referenceId };
	};
}
