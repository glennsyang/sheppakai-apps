import { building, dev } from '$app/env';
import { SENTRY_DSN } from '$app/env/public';
import { sentryDataCollection } from '$lib/sentry-data-collection';
import { allowedEmails, auth } from '$lib/server/auth';
import { logger } from '$lib/server/logger';
import * as Sentry from '@sentry/sveltekit';
import { createHandleError, createServerHandle } from '@sheppakai/shared/server-handle';
import { sequence } from '@sveltejs/kit/hooks';

Sentry.init({
	dsn: SENTRY_DSN,
	tracesSampleRate: 1.0,
	// Same restrictive baseline as hooks.client.ts. Loosening it server-side would let Sentry
	// capture cookies, bodies and full headers — including the auth session cookie — which the
	// browser SDK can't reach since client JS has no access to HttpOnly cookies or
	// server-internal headers. Server-side error context is already captured explicitly by
	// createHandleError (requestId, userId, url, method, status) via the structured logger, so Sentry's own PII
	// capture isn't needed here.
	dataCollection: sentryDataCollection,
	// logger.warn()/logger.error() report via captureMessage; without this every call would get
	// a synthetic call-site stack trace and regroup existing issues.
	attachStacktrace: false
});

// Request ID, request logging, session + allowlist re-check and security headers live in
// @sheppakai/shared/server-handle so the three apps can't drift apart.
export const handle = sequence(
	Sentry.sentryHandle(),
	createServerHandle({ auth, logger, allowedEmails, dev, building })
);

export const handleError = createHandleError({ logger, dev });
