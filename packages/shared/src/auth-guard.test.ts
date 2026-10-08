import { describe, expect, it, vi } from 'vitest';

import { createAdminGuards } from './auth-guard';

type Locals = App.Locals;
const event = (user: Locals['user']) => ({ locals: { user } }) as never;

const { isAdminUser, requireAdmin, assertAdmin } = createAdminGuards(
	() => ' env-admin-1 ,env-admin-2,, '
);

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
		const handler = vi.fn();
		const result = await requireAdmin(handler)(event(null));
		expect(result).toMatchObject({ status: 401 });
		expect(handler).not.toHaveBeenCalled();
	});

	it('returns 403 for a non-admin', async () => {
		const result = await requireAdmin(vi.fn())(event({ id: 'u1', role: 'user' }));
		expect(result).toMatchObject({ status: 403 });
	});

	it('runs the handler for an ADMIN_USER_IDS admin without the admin role', async () => {
		const user = { id: 'env-admin-1', role: 'user' };
		const handler = vi.fn(async () => 'ok');
		await expect(requireAdmin(handler)(event(user))).resolves.toBe('ok');
		expect(handler).toHaveBeenCalledWith(expect.anything(), user);
	});
});

describe('assertAdmin', () => {
	it('redirects to sign-in when signed out and throws 403 for a non-admin', () => {
		expect(() => assertAdmin({ user: null })).toThrow(
			expect.objectContaining({ status: 302, location: '/sign-in' })
		);
		expect(() => assertAdmin({ user: { id: 'u1', role: 'user' } })).toThrow(
			expect.objectContaining({ status: 403 })
		);
	});

	it('returns the user for an admin', () => {
		const user = { id: 'env-admin-2', role: null };
		expect(assertAdmin({ user })).toBe(user);
	});
});
