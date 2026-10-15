import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, sendPasswordChangedEmail } = vi.hoisted(() => ({
	api: {
		updateUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		changePassword: vi.fn<(...args: unknown[]) => Promise<unknown>>()
	},
	sendPasswordChangedEmail: vi.fn<(...args: unknown[]) => Promise<unknown>>()
}));

vi.mock('#lib/server/auth.js', () => ({ auth: { api } }));
vi.mock('#lib/server/email/index.js', () => ({ sendPasswordChangedEmail }));
vi.mock('#lib/server/logger.js', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));
vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => void>() }));

import { actions } from './+page.server';

const USER = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'user' };

function post(fields: Record<string, string>) {
	return new Request('https://budget.example.com/profile', {
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
