import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signOutMock, loggerMock } = vi.hoisted(() => ({
	signOutMock: vi.fn<() => Promise<unknown>>(),
	loggerMock: { error: vi.fn<() => void>() }
}));

vi.mock('#lib/server/auth/index.js', () => ({ auth: { api: { signOut: signOutMock } } }));
vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));

import { isRedirect } from '@sveltejs/kit';

import { SIGN_IN_ROUTE } from '#lib/auth-routes.js';

import { actions } from '../../routes/(auth)/sign-out/+page.server';

const ctx = () =>
	({ request: new Request('https://example.com/sign-out', { method: 'POST' }) }) as never;

async function runAction(): Promise<unknown> {
	try {
		await actions.default(ctx());
	} catch (err) {
		return err;
	}
	throw new Error('Expected sign-out to throw a redirect');
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('sign-out action', () => {
	it('signs out and redirects to sign-in', async () => {
		signOutMock.mockResolvedValueOnce({ success: true });

		const err = await runAction();

		expect(signOutMock).toHaveBeenCalledOnce();
		expect(isRedirect(err) && err.location).toBe(SIGN_IN_ROUTE);
		expect(loggerMock.error).not.toHaveBeenCalled();
	});

	it('still redirects to sign-in and logs an error when better-auth fails', async () => {
		signOutMock.mockRejectedValueOnce(new Error('Session not found'));

		const err = await runAction();

		expect(isRedirect(err) && err.location).toBe(SIGN_IN_ROUTE);
		expect(loggerMock.error).toHaveBeenCalledWith('Sign-out failed', expect.any(Error));
	});
});
