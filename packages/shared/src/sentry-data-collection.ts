import type * as Sentry from '@sentry/sveltekit';

import { redactSensitivePath } from './sensitive-path';

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type DataCollection = NonNullable<SentryOptions['dataCollection']>;
type BeforeSend = NonNullable<SentryOptions['beforeSend']>;
type BeforeSendSpan = NonNullable<SentryOptions['beforeSendSpan']>;

const piiHeaderDenylist = ['forwarded', '-ip', 'remote-', 'via', '-user'];

// Shared by hooks.client.ts and hooks.server.ts. An unset `dataCollection` collects everything
// (cookies, bodies, user info, IPs), so this pins the restrictive baseline explicitly: no user
// context or IPs, no cookies (keeps the auth session cookie out), no request/response bodies,
// and IP/forwarding headers stripped. requestId is the only prod correlation key.
export const sentryDataCollection: DataCollection = {
	userInfo: false,
	cookies: false,
	httpHeaders: {
		request: { deny: piiHeaderDenylist },
		response: { deny: piiHeaderDenylist }
	},
	httpBodies: [],
	urlQueryParams: { deny: piiHeaderDenylist },
	genAI: { inputs: false, outputs: false },
	databaseQueryData: false,
	graphQL: { document: false, variables: false }
};

// dataCollection filters `?token=` query params but not path segments, so reset-password
// tokens in /api/auth/reset-password/<token> would otherwise reach Sentry in the request
// URL, transaction names and span attributes. Server-only: set both in hooks.server.ts.
export const scrubSensitivePathsFromEvent: BeforeSend = (event) => {
	if (event.transaction) event.transaction = redactSensitivePath(event.transaction);
	if (event.request?.url) event.request.url = redactSensitivePath(event.request.url);
	return event;
};

export const scrubSensitivePathsFromSpan: BeforeSendSpan = (span) => {
	span.name = redactSensitivePath(span.name);
	for (const [key, value] of Object.entries(span.attributes)) {
		if (typeof value === 'string') span.attributes[key] = redactSensitivePath(value);
	}
	return span;
};
