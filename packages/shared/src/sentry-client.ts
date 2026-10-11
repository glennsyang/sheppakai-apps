import * as Sentry from '@sentry/sveltekit';

import { sentryDataCollection } from './sentry-data-collection';

/**
 * Client-side Sentry setup shared by every app's `hooks.client.ts`. Returns the
 * `handleError` hook to export from there.
 */
export function initClientSentry(options: {
	dsn: string | undefined;
	/** Drop SvelteKit's history.pushState/replaceState warnings (raised by LayerChart). */
	suppressRouterWarnings?: boolean;
}) {
	Sentry.init({
		dsn: options.dsn,

		tracesSampleRate: 0.2,

		// Keep user IPs, headers and user context out of Sentry; requestId is the only prod correlation key.
		dataCollection: sentryDataCollection
	});

	if (options.suppressRouterWarnings) {
		const originalWarn = console.warn;
		console.warn = function (...args: unknown[]) {
			const message = String(args[0]);
			if (message.includes('history.pushState') || message.includes('history.replaceState')) {
				return;
			}
			originalWarn.apply(console, args);
		};
	}

	return Sentry.handleErrorWithSentry();
}
