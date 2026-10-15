import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: 'env-admin-1,env-admin-2' }));

import { isAdminUser } from './auth-guard';

// The guard logic is tested in @sheppakai/shared/auth-guard; this pins the binding to this
// app's ADMIN_USER_IDS.
describe('isAdminUser', () => {
	it('is true for a user with the admin role', () => {
		expect(isAdminUser({ id: 'u1', role: 'admin' })).toBe(true);
	});

	it('is true for a user listed in ADMIN_USER_IDS, whatever their role', () => {
		expect(isAdminUser({ id: 'env-admin-2', role: 'user' })).toBe(true);
		expect(isAdminUser({ id: 'env-admin-1', role: null })).toBe(true);
	});

	it('is false for a plain user not in ADMIN_USER_IDS', () => {
		expect(isAdminUser({ id: 'u1', role: 'user' })).toBe(false);
		expect(isAdminUser({ id: 'u1' })).toBe(false);
	});
});
