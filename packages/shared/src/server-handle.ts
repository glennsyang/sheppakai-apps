import type { Handle, HandleServerError } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { isUserAccessAllowed } from './auth-allowlist';

/** The slice of `@sheppakai/logger` the request pipeline uses. */
export interface RequestLogger {
	child(context: Record<string, unknown>): RequestLogger;
	info(message: string, meta?: Record<string, unknown>): void;
	warn(message: string, meta?: Record<string, unknown>): void;
	error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

type SessionLookup = {
	session: { token: string };
	user: {
		id: string;
		email: string;
		banned?: boolean | null;
		banExpires?: Date | string | null;
	};
} | null;

/** Each app's Better Auth instance, narrowed to what the handle calls. */
export type ServerHandleAuth = Parameters<typeof svelteKitHandler>[0]['auth'] & {
	api: {
		getSession(context: { headers: Headers }): Promise<SessionLookup>;
		revokeSession(context: { body: { token: string }; headers: Headers }): Promise<unknown>;
	};
};

interface ServerHandleOptions {
	auth: ServerHandleAuth;
	logger: RequestLogger;
	allowedEmails: Set<string>;
	/** `dev` from `$app/env`, passed in because this package can't import it. */
	dev: boolean;
	/** `building` from `$app/env`. */
	building: boolean;
}

/**
 * The request pipeline every app runs after `Sentry.sentryHandle()`: request ID and
 * request logging, the Better Auth session (re-checked against the allowlist), and the
 * security headers.
 */
export function createServerHandle(options: ServerHandleOptions): Handle {
	const { auth, logger, allowedEmails, dev, building } = options;

	return async ({ event, resolve }) => {
		if (dev && event.url.pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
			return new Response(undefined, { status: 404 });
		}

		const requestId = crypto.randomUUID();
		event.locals.requestId = requestId;

		let requestLogger = logger.child({
			requestId,
			method: event.request.method,
			url: event.url.pathname
		});

		const startTime = Date.now();

		requestLogger.info('Incoming request', {
			userAgent: event.request.headers.get('user-agent')
		});

		const session = await auth.api.getSession({
			headers: event.request.headers
		});

		// The allowlist and ban are otherwise only checked when a session is created, so a
		// user removed from ALLOWED_EMAILS (or banned) would keep a self-extending session.
		// Re-check on every request — this also covers the 5-minute cookie cache window.
		if (session && !isUserAccessAllowed(session.user, allowedEmails)) {
			requestLogger.warn('Session rejected', {
				userId: session.user.id,
				reason: 'owner_not_allowed'
			});
			try {
				await auth.api.revokeSession({
					body: { token: session.session.token },
					headers: event.request.headers
				});
			} catch (err) {
				requestLogger.error('Failed to revoke disallowed session', err, {
					userId: session.user.id
				});
			}
		} else if (session) {
			// better-auth types optional DB fields with `?:` while the Drizzle schemas use
			// `| null`; runtime values are always string | null (never undefined), so the
			// cast is safe.
			event.locals.session = session.session as NonNullable<typeof event.locals.session>;
			event.locals.user = session.user as NonNullable<typeof event.locals.user>;

			requestLogger = requestLogger.child({ userId: session.user.id });
		}

		const response = await svelteKitHandler({ event, resolve, auth, building });

		requestLogger.info('Request completed', {
			status: response.status,
			duration: `${Date.now() - startTime}ms`
		});

		response.headers.set('X-Frame-Options', 'DENY');
		response.headers.set('X-Content-Type-Options', 'nosniff');
		response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
		response.headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
		response.headers.set('X-Request-ID', requestId);

		if (!dev) {
			response.headers.set(
				'Strict-Transport-Security',
				'max-age=31536000; includeSubDomains; preload'
			);
		}

		// Content-Security-Policy is managed via kit.csp in each app's svelte.config.js
		// (nonce mode). SvelteKit generates a per-request nonce, injects it into the inline
		// scripts/styles it produces, and sets the CSP header automatically. Do NOT set
		// Content-Security-Policy here — it would override the nonce-bearing header SvelteKit
		// emits. See docs/CSP.md (repo root) for the shared strategy and per-app allowances.

		return response;
	};
}

/**
 * Global error handler with structured logging.
 *
 * Note: logger.error() already forwards to Sentry (captureException) internally in
 * production, so this is intentionally NOT wrapped in Sentry.handleErrorWithSentry() —
 * doing so would double-report every unhandled error.
 */
export function createHandleError(options: {
	logger: RequestLogger;
	dev: boolean;
}): HandleServerError {
	const { logger, dev } = options;

	return ({ error, event, status, message }) => {
		const requestId = event.locals.requestId ?? 'unknown';
		const userId = event.locals.user?.id ?? 'anonymous';

		logger.error('Unhandled server error', error, {
			requestId,
			userId,
			url: event.url.pathname,
			method: event.request.method,
			status,
			message,
			userAgent: event.request.headers.get('user-agent')
		});

		return {
			message: dev ? message : 'An unexpected error occurred',
			requestId
		};
	};
}
