import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
	svelteKitHandler: vi.fn()
}));

vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: mockState.svelteKitHandler
}));

import {
	createHandleError,
	createServerHandle,
	type RequestLogger,
	type ServerHandleAuth
} from './server-handle';

function fakeLogger() {
	const logger = {
		child: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	};
	logger.child.mockReturnValue(logger);
	return logger satisfies RequestLogger;
}

function fakeEvent(pathname = '/dashboard') {
	return {
		url: new URL(`http://localhost${pathname}`),
		request: new Request(`http://localhost${pathname}`, {
			headers: { 'user-agent': 'vitest' }
		}),
		locals: {} as App.Locals
	} as unknown as RequestEvent;
}

const session = {
	session: { token: 'tok-1' },
	user: { id: 'user-1', email: 'owner@example.com', banned: false }
};

function fakeAuth(lookup: typeof session | null = session) {
	return {
		handler: vi.fn(),
		options: {},
		api: {
			getSession: vi.fn().mockResolvedValue(lookup),
			revokeSession: vi.fn().mockResolvedValue(undefined)
		}
	} satisfies ServerHandleAuth;
}

const allowedEmails = new Set(['owner@example.com']);
const resolve = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	mockState.svelteKitHandler.mockImplementation(async () => new Response('ok'));
});

describe('createServerHandle', () => {
	it('puts an allowed session on locals and sets the security headers', async () => {
		const auth = fakeAuth();
		const handle = createServerHandle({
			auth,
			logger: fakeLogger(),
			allowedEmails,
			dev: false,
			building: false
		});
		const event = fakeEvent();

		const response = await handle({ event, resolve });

		expect(event.locals.user).toEqual(session.user);
		expect(event.locals.session).toEqual(session.session);
		expect(event.locals.requestId).toEqual(expect.any(String));
		expect(auth.api.revokeSession).not.toHaveBeenCalled();
		expect(response.headers.get('X-Request-ID')).toBe(event.locals.requestId);
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
		expect(response.headers.get('Content-Security-Policy')).toBeNull();
	});

	it('leaves HSTS off in dev', async () => {
		const handle = createServerHandle({
			auth: fakeAuth(),
			logger: fakeLogger(),
			allowedEmails,
			dev: true,
			building: false
		});

		const response = await handle({ event: fakeEvent(), resolve });

		expect(response.headers.get('Strict-Transport-Security')).toBeNull();
	});

	it('revokes a session whose user is no longer allowed', async () => {
		const auth = fakeAuth({
			...session,
			user: { ...session.user, email: 'removed@example.com' }
		});
		const logger = fakeLogger();
		const handle = createServerHandle({ auth, logger, allowedEmails, dev: false, building: false });
		const event = fakeEvent();

		await handle({ event, resolve });

		expect(auth.api.revokeSession).toHaveBeenCalledWith({
			body: { token: 'tok-1' },
			headers: event.request.headers
		});
		expect(event.locals.user).toBeUndefined();
		expect(event.locals.session).toBeUndefined();
		expect(logger.warn).toHaveBeenCalledWith('Session rejected', {
			userId: 'user-1',
			reason: 'owner_not_allowed'
		});
	});

	it('revokes a banned user and logs a failed revoke without throwing', async () => {
		const auth = fakeAuth({ ...session, user: { ...session.user, banned: true } });
		const failure = new Error('db down');
		auth.api.revokeSession.mockRejectedValue(failure);
		const logger = fakeLogger();
		const handle = createServerHandle({ auth, logger, allowedEmails, dev: false, building: false });
		const event = fakeEvent();

		const response = await handle({ event, resolve });

		expect(response.status).toBe(200);
		expect(event.locals.user).toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith('Failed to revoke disallowed session', failure, {
			userId: 'user-1'
		});
	});

	it('passes signed-out requests straight through', async () => {
		const auth = fakeAuth(null);
		const handle = createServerHandle({
			auth,
			logger: fakeLogger(),
			allowedEmails,
			dev: false,
			building: true
		});
		const event = fakeEvent();

		await handle({ event, resolve });

		expect(event.locals.user).toBeUndefined();
		expect(mockState.svelteKitHandler).toHaveBeenCalledWith({
			event,
			resolve,
			auth,
			building: true
		});
	});

	it('answers the Chrome devtools probe with 404 in dev only', async () => {
		const auth = fakeAuth();
		const path = '/.well-known/appspecific/com.chrome.devtools.json';
		const devHandle = createServerHandle({
			auth,
			logger: fakeLogger(),
			allowedEmails,
			dev: true,
			building: false
		});

		const response = await devHandle({ event: fakeEvent(path), resolve });

		expect(response.status).toBe(404);
		expect(auth.api.getSession).not.toHaveBeenCalled();
	});
});

describe('createHandleError', () => {
	const input = (event: RequestEvent) => ({
		error: new Error('boom'),
		event,
		status: 500,
		message: 'Internal Error'
	});

	it('logs the error with request context and hides the message in production', () => {
		const logger = fakeLogger();
		const event = fakeEvent();
		event.locals.requestId = 'req-1';
		event.locals.user = { id: 'user-1' };

		const result = createHandleError({ logger, dev: false })(input(event));

		expect(result).toEqual({ message: 'An unexpected error occurred', requestId: 'req-1' });
		expect(logger.error).toHaveBeenCalledWith(
			'Unhandled server error',
			expect.any(Error),
			expect.objectContaining({ requestId: 'req-1', userId: 'user-1', status: 500 })
		);
	});

	it('shows the real message in dev and falls back for missing context', () => {
		const logger = fakeLogger();

		const result = createHandleError({ logger, dev: true })(input(fakeEvent()));

		expect(result).toEqual({ message: 'Internal Error', requestId: 'unknown' });
		expect(logger.error).toHaveBeenCalledWith(
			'Unhandled server error',
			expect.any(Error),
			expect.objectContaining({ userId: 'anonymous' })
		);
	});
});
