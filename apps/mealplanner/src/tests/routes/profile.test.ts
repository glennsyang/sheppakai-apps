import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, sendPasswordChangedEmail } = vi.hoisted(() => ({
	api: {
		updateUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		changePassword: vi.fn<(...args: unknown[]) => Promise<unknown>>()
	},
	sendPasswordChangedEmail: vi.fn<(...args: unknown[]) => Promise<unknown>>()
}));

vi.mock('#lib/server/auth/index.js', () => ({ auth: { api } }));
vi.mock('#lib/server/email/index.js', () => ({ sendPasswordChangedEmail }));
vi.mock('#lib/server/logger.js', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

import { actions, load } from '../../routes/(app)/profile/+page.server';

const USER = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'user' };

function post(fields: Record<string, string>) {
	return new Request('https://example.com/profile', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
}

// The action behaviour itself is tested in @sheppakai/shared/profile-actions; these check
// this app's wiring (its auth instance and password-changed email).
describe('profile actions — wiring', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		api.updateUser.mockResolvedValue({ status: true });
		api.changePassword.mockResolvedValue({});
		sendPasswordChangedEmail.mockResolvedValue(undefined);
	});

	it("updateName goes through this app's better-auth instance", async () => {
		const result = await actions.updateName({
			request: post({ name: 'New Name' }),
			locals: { user: USER }
		} as never);

		expect(api.updateUser).toHaveBeenCalledWith(
			expect.objectContaining({ body: { name: 'New Name' } })
		);
		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
	});

	it("changePassword sends this app's password-changed email", async () => {
		await actions.changePassword({
			request: post({
				currentPassword: 'old-password-123',
				newPassword: 'new-password-1234',
				confirmPassword: 'new-password-1234'
			}),
			getClientAddress: () => '203.0.113.7',
			locals: { user: USER }
		} as never);

		expect(api.changePassword).toHaveBeenCalledOnce();
		expect(sendPasswordChangedEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'alice@example.com', ipAddress: '203.0.113.7' })
		);
	});
});

// `load` is auto-wrapped by @sentry/sveltekit, which reads `event.request` / `event.route`.
describe('profile load', () => {
	it('returns the user with pre-filled name and password forms', async () => {
		const result = await load({
			locals: { user: USER },
			request: new Request('https://example.com/profile'),
			url: new URL('https://example.com/profile'),
			route: { id: '/(app)/profile' }
		} as never);

		expect(result).toMatchObject({
			user: USER,
			nameForm: { data: { name: 'Alice' } },
			passwordForm: { data: { currentPassword: '', newPassword: '', confirmPassword: '' } }
		});
	});
});
