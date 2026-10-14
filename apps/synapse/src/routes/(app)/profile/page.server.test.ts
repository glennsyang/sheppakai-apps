import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateUser = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown>>());

vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: '' }));

vi.mock('#lib/server/auth.js', () => ({ auth: { api: { updateUser: mockUpdateUser } } }));

vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => void>() }));

vi.mock('#lib/server/email/index.js', () => ({ sendPasswordChangedEmail: vi.fn<() => void>() }));

vi.mock('#lib/server/logger.js', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

const { actions } = await import('./+page.server');

const currentUser = { id: 'user-1', name: 'Old Name', email: 'user@example.com' };

function updateRequest(name: string) {
	return new Request('https://synapse.example.com/profile?/update', {
		method: 'POST',
		body: new URLSearchParams({ name })
	});
}

describe('profile update action', () => {
	beforeEach(() => {
		mockUpdateUser.mockReset();
		mockUpdateUser.mockResolvedValue({ status: true });
	});

	it('updates the name through better-auth so its user-update hooks run', async () => {
		const request = updateRequest('New Name');

		const result = await actions.update({ request, locals: { user: currentUser } } as never);

		expect(mockUpdateUser).toHaveBeenCalledWith({
			body: { name: 'New Name' },
			headers: request.headers
		});
		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
	});

	it('reports a 500 when better-auth rejects the update', async () => {
		mockUpdateUser.mockRejectedValue(new Error('nope'));

		const result = await actions.update({
			request: updateRequest('New Name'),
			locals: { user: currentUser }
		} as never);

		expect(result).toMatchObject({ status: 500 });
	});
});
