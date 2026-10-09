import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: 'admin-by-id' }));

const { load } = await import('../../routes/(app)/+layout.server');

function runLoad(user: { id: string; role: string }) {
	const url = new URL('http://localhost/');
	return load({ locals: { user }, url, request: new Request(url) } as never);
}

describe('(app) layout load', () => {
	it('flags a user listed in ADMIN_USER_IDS as admin even with role user', async () => {
		await expect(runLoad({ id: 'admin-by-id', role: 'user' })).resolves.toMatchObject({
			isAdmin: true
		});
	});

	it('flags a user with role admin as admin', async () => {
		await expect(runLoad({ id: 'someone', role: 'admin' })).resolves.toMatchObject({
			isAdmin: true
		});
	});

	it('does not flag a regular user as admin', async () => {
		await expect(runLoad({ id: 'someone', role: 'user' })).resolves.toMatchObject({
			isAdmin: false
		});
	});
});
