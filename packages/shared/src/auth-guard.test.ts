import { describe, expect, it, vi } from 'vitest';

import { createAdminGuards, getUser, requireAuth } from './auth-guard';

type Locals = App.Locals;
type Handler = (event: unknown, user: unknown) => Promise<string>;

const event = (user: Locals['user']) => ({ locals: { user } }) as never;

const { isAdminUser, requireAdmin, assertAdmin } = createAdminGuards(
	() => ' env-admin-1 ,env-admin-2,, '
);

const contact = { email: 'user@example.com', name: 'User' };
describe('isAdminUser', () => {
	it('accepts a DB admin role', () => {
		expect(isAdminUser({ id: 'u1', role: 'admin' })).toBe(true);
	});

	it('accepts an id bootstrapped via ADMIN_USER_IDS whatever its role', () => {
		expect(isAdminUser({ id: 'env-admin-2', role: 'user' })).toBe(true);
		expect(isAdminUser({ id: 'env-admin-1', role: null })).toBe(true);
	});

	it('rejects everyone else, including an empty id', () => {
		expect(isAdminUser({ id: 'u1', role: 'user' })).toBe(false);
		expect(isAdminUser({ id: '' })).toBe(false);
	});
});

describe('requireAdmin', () => {
	it('returns 401 when signed out', async () => {
		const handler = vi.fn<Handler>();
		const result = await requireAdmin(handler)(event(null));
		expect(result).toMatchObject({ status: 401 });
		expect(handler).not.toHaveBeenCalled();
	});

	it('returns 403 for a non-admin', async () => {
		const result = await requireAdmin(vi.fn<Handler>())(
			event({ id: 'u1', role: 'user', ...contact })
		);
		expect(result).toMatchObject({ status: 403 });
	});

	it('runs the handler for an ADMIN_USER_IDS admin without the admin role', async () => {
		const user = { id: 'env-admin-1', role: 'user', ...contact };
		const handler = vi.fn<Handler>(async () => 'ok');
		await expect(requireAdmin(handler)(event(user))).resolves.toBe('ok');
		expect(handler).toHaveBeenCalledWith(expect.anything(), user);
	});
});

describe('assertAdmin', () => {
	it('redirects to sign-in when signed out and throws 403 for a non-admin', () => {
		expect(() => assertAdmin({ user: null, session: null })).toThrow(
			expect.objectContaining({ status: 302, location: '/sign-in' })
		);
		expect(() =>
			assertAdmin({ user: { id: 'u1', role: 'user', ...contact }, session: null })
		).toThrow(expect.objectContaining({ status: 403 }));
	});

	it('returns the user for an admin', () => {
		const user = { id: 'env-admin-2', role: null, ...contact };
		expect(assertAdmin({ user, session: null })).toBe(user);
	});
});

describe('requireAuth', () => {
	it('returns 401 without calling the handler when signed out', async () => {
		const handler = vi.fn<Handler>();
		const result = await requireAuth(handler)(event(null));
		expect(result).toMatchObject({ status: 401 });
		expect(handler).not.toHaveBeenCalled();
	});

	it('passes the authenticated user to the handler and returns its result', async () => {
		const user = { id: 'u1', role: 'user', ...contact };
		const handler = vi.fn<Handler>(async () => 'ok');
		await expect(requireAuth(handler)(event(user))).resolves.toBe('ok');
		expect(handler).toHaveBeenCalledWith(expect.anything(), user);
	});
});

describe('getUser', () => {
	it('returns the user from locals when signed in', () => {
		const user = { id: 'u1', role: 'user', ...contact };
		expect(getUser({ user, session: null })).toBe(user);
	});

	it('redirects to sign-in when signed out', () => {
		expect(() => getUser({ user: null, session: null })).toThrow(
			expect.objectContaining({ status: 302, location: '/sign-in' })
		);
	});
});
