import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, sendPasswordChangedEmail, userQueries, accountQueries } = vi.hoisted(() => ({
	api: {
		updateUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		changePassword: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		listPasskeys: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		updatePasskey: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		deletePasskey: vi.fn<(...args: unknown[]) => Promise<unknown>>()
	},
	sendPasswordChangedEmail: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
	userQueries: { findById: vi.fn<(...args: unknown[]) => Promise<unknown>>() },
	accountQueries: { findByUserId: vi.fn<(...args: unknown[]) => Promise<unknown>>() }
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
vi.mock('#lib/server/db/queries/index.js', () => ({ userQueries, accountQueries }));

import { actions, load } from './+page.server';

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

// `load` is auto-wrapped by @sentry/sveltekit, which reads `event.request` / `event.route`.
describe('profile load — passkeys', () => {
	const loadEvent = () =>
		({
			locals: { user: USER },
			request: new Request('https://budget.example.com/profile', {
				headers: { cookie: 'session=abc' }
			}),
			url: new URL('https://budget.example.com/profile'),
			route: { id: '/(app)/profile' }
		}) as never;

	beforeEach(() => {
		vi.clearAllMocks();
		userQueries.findById.mockResolvedValue(USER);
		accountQueries.findByUserId.mockResolvedValue(null);
		api.listPasskeys.mockResolvedValue([]);
	});

	it("lists the user's passkeys with their provider and date, using the request's session", async () => {
		api.listPasskeys.mockResolvedValue([
			{ id: 'pk-1', name: 'iPhone', aaguid: null, createdAt: '2026-11-11T10:00:00.000Z' },
			// Apple Passwords' AAGUID
			{ id: 'pk-2', name: null, aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd', createdAt: null }
		]);

		const result = await load(loadEvent());

		const [{ headers }] = api.listPasskeys.mock.calls[0] as [{ headers: Headers }];
		expect(headers.get('cookie')).toBe('session=abc');
		expect(result).toMatchObject({
			passkeys: [
				{ id: 'pk-1', name: 'iPhone', provider: null, createdAt: new Date('2026-11-11T10:00:00Z') },
				{ id: 'pk-2', name: null, provider: 'Apple Passwords', createdAt: null }
			]
		});
		expect(result).not.toHaveProperty('passkeysLoadError');
	});

	it('still renders the profile when listing passkeys fails', async () => {
		api.listPasskeys.mockRejectedValue(new Error('db down'));

		const result = await load(loadEvent());

		expect(result).toMatchObject({
			user: USER,
			profileForm: { data: { name: 'Alice' } },
			passkeys: [],
			passkeysLoadError: expect.stringContaining('passkeys')
		});
		expect(result).not.toHaveProperty('loadError');
	});
});

describe('passkey actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		api.updatePasskey.mockResolvedValue({ passkey: {} });
		api.deletePasskey.mockResolvedValue({ status: true });
	});

	const event = (fields: Record<string, string>, user: typeof USER | null = USER) =>
		({ request: post(fields), locals: { user } }) as never;

	it('renames a passkey with a trimmed name', async () => {
		const result = await actions.renamePasskey(event({ id: 'pk-1', name: '  Work laptop ' }));

		expect(api.updatePasskey).toHaveBeenCalledWith(
			expect.objectContaining({ body: { id: 'pk-1', name: 'Work laptop' } })
		);
		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
	});

	it('rejects an empty or too-long name without calling Better Auth', async () => {
		const empty = await actions.renamePasskey(event({ id: 'pk-1', name: '   ' }));
		const long = await actions.renamePasskey(event({ id: 'pk-1', name: 'x'.repeat(51) }));

		expect(api.updatePasskey).not.toHaveBeenCalled();
		expect(empty).toMatchObject({ status: 400 });
		expect(long).toMatchObject({ status: 400 });
	});

	it('shows an error when the rename fails', async () => {
		api.updatePasskey.mockRejectedValue(new Error('not yours'));

		const result = await actions.renamePasskey(event({ id: 'pk-1', name: 'Phone' }));

		expect(result).toMatchObject({
			status: 500,
			data: { form: { message: { type: 'error', text: expect.stringContaining('rename') } } }
		});
	});

	it('removes a passkey', async () => {
		const result = await actions.removePasskey(event({ id: 'pk-1' }));

		expect(api.deletePasskey).toHaveBeenCalledWith(
			expect.objectContaining({ body: { id: 'pk-1' } })
		);
		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
	});

	it('shows an error when the removal fails', async () => {
		api.deletePasskey.mockRejectedValue(new Error('not found'));

		const result = await actions.removePasskey(event({ id: 'pk-1' }));

		expect(result).toMatchObject({
			status: 500,
			data: { form: { message: { type: 'error', text: expect.stringContaining('remove') } } }
		});
	});

	it('requires a signed-in user', async () => {
		const result = await actions.removePasskey(event({ id: 'pk-1' }, null));

		expect(api.deletePasskey).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 401 });
	});
});
