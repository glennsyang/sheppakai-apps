import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, sendPasswordChangedEmail, upsertUserSettings } = vi.hoisted(() => ({
	upsertUserSettings: vi.fn<(...args: unknown[]) => Promise<void>>(),
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
vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: '' }));
vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => void>() }));
vi.mock('#lib/server/db/writes/user-settings.js', () => ({ upsertUserSettings }));

const { actions } = await import('./+page.server');

const USER = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'user' };

function post(fields: Record<string, string>) {
	return new Request('https://synapse.example.com/profile', {
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

describe('updateMorningDigestSettings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		upsertUserSettings.mockResolvedValue(undefined);
	});

	it('saves the opt-in and send time for the current user', async () => {
		const result = await actions.updateMorningDigestSettings({
			request: post({ enabled: 'on', sendTime: '07:30' }),
			locals: { user: USER }
		} as never);

		expect(upsertUserSettings).toHaveBeenCalledWith(expect.anything(), 'user-1', {
			enabled: true,
			sendTime: '07:30'
		});
		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
	});

	it('treats an unchecked box as opting out', async () => {
		await actions.updateMorningDigestSettings({
			request: post({ sendTime: '06:00' }),
			locals: { user: USER }
		} as never);

		expect(upsertUserSettings).toHaveBeenCalledWith(expect.anything(), 'user-1', {
			enabled: false,
			sendTime: '06:00'
		});
	});

	it('rejects a malformed send time without saving', async () => {
		const result = await actions.updateMorningDigestSettings({
			request: post({ enabled: 'on', sendTime: '25:00' }),
			locals: { user: USER }
		} as never);

		expect(upsertUserSettings).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 400 });
	});
});
