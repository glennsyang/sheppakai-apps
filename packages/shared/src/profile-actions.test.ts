import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProfileActions, type ProfileActionsDeps } from './profile-actions';

const api = {
	updateUser: vi.fn<(ctx: unknown) => Promise<unknown>>(),
	changePassword: vi.fn<(ctx: unknown) => Promise<unknown>>()
};
const sendPasswordChangedEmail = vi.fn<(payload: unknown) => Promise<unknown>>();
const logger = {
	info: vi.fn<(message: string, meta?: Record<string, unknown>) => void>(),
	error: vi.fn<(message: string, error?: unknown) => void>()
};

const actions = createProfileActions({
	auth: { api } as unknown as ProfileActionsDeps['auth'],
	sendPasswordChangedEmail,
	getErrorMessage: (_error, fallback) => fallback,
	logger
});

const currentUser = { id: 'user-1', name: 'Test User', email: 'user@example.com' };

function changePasswordRequest(headers: Record<string, string> = {}) {
	return new Request('https://app.example.com/profile?/changePassword', {
		method: 'POST',
		headers,
		body: new URLSearchParams({
			currentPassword: 'old-password-123',
			newPassword: 'new-password-1234',
			confirmPassword: 'new-password-1234'
		})
	});
}

function nameRequest(name: string) {
	return new Request('https://app.example.com/profile?/updateName', {
		method: 'POST',
		body: new URLSearchParams({ name })
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	api.updateUser.mockResolvedValue({ status: true });
	api.changePassword.mockResolvedValue({});
	sendPasswordChangedEmail.mockResolvedValue(undefined);
});

describe('updateName', () => {
	it('updates the name through better-auth so its user-update hooks run', async () => {
		const request = nameRequest('New Name');

		const result = await actions.updateName({ request, locals: { user: currentUser } } as never);

		expect(api.updateUser).toHaveBeenCalledWith({
			body: { name: 'New Name' },
			headers: request.headers
		});
		expect(result).toMatchObject({ form: { message: { type: 'success', text: 'Name updated.' } } });
	});

	it('rejects an empty name without calling better-auth', async () => {
		const result = await actions.updateName({
			request: nameRequest(''),
			locals: { user: currentUser }
		} as never);

		expect(result).toMatchObject({ status: 400 });
		expect(api.updateUser).not.toHaveBeenCalled();
	});

	it('reports a 500 when better-auth rejects the update', async () => {
		api.updateUser.mockRejectedValue(new Error('nope'));

		const result = await actions.updateName({
			request: nameRequest('New Name'),
			locals: { user: currentUser }
		} as never);

		expect(result).toMatchObject({ status: 500 });
		expect(logger.error).toHaveBeenCalled();
	});

	it('returns 401 when signed out', async () => {
		const result = await actions.updateName({
			request: nameRequest('New Name'),
			locals: { user: null }
		} as never);

		expect(result).toMatchObject({ status: 401 });
	});
});

describe('changePassword', () => {
	it('changes the password, revokes other sessions and sends the alert email', async () => {
		const result = await actions.changePassword({
			request: changePasswordRequest(),
			getClientAddress: () => '203.0.113.7',
			locals: { user: currentUser }
		} as never);

		expect(api.changePassword).toHaveBeenCalledWith({
			body: {
				currentPassword: 'old-password-123',
				newPassword: 'new-password-1234',
				revokeOtherSessions: true
			},
			headers: expect.any(Headers)
		});
		expect(sendPasswordChangedEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'user@example.com', name: 'Test User' })
		);
		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
	});

	it('reports the getClientAddress() IP, not a client-supplied X-Forwarded-For', async () => {
		await actions.changePassword({
			request: changePasswordRequest({
				'x-forwarded-for': '1.2.3.4',
				'x-real-ip': '1.2.3.4',
				'x-client-ip': '1.2.3.4'
			}),
			getClientAddress: () => '203.0.113.7',
			locals: { user: currentUser }
		} as never);

		expect(sendPasswordChangedEmail).toHaveBeenCalledWith(
			expect.objectContaining({ ipAddress: '203.0.113.7' })
		);
		expect(logger.info).toHaveBeenCalledWith(
			'Security event: password changed and other sessions revoked',
			expect.objectContaining({ ipAddress: '203.0.113.7' })
		);
	});

	it('still changes the password when getClientAddress() throws', async () => {
		const result = await actions.changePassword({
			request: changePasswordRequest(),
			getClientAddress: () => {
				throw new Error('Address header was specified with ADDRESS_HEADER but is absent');
			},
			locals: { user: currentUser }
		} as never);

		expect(api.changePassword).toHaveBeenCalledOnce();
		expect(sendPasswordChangedEmail).toHaveBeenCalledWith(
			expect.objectContaining({ ipAddress: undefined })
		);
		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
	});

	it('still reports success when the alert email fails', async () => {
		sendPasswordChangedEmail.mockRejectedValue(new Error('brevo down'));

		const result = await actions.changePassword({
			request: changePasswordRequest(),
			getClientAddress: () => '203.0.113.7',
			locals: { user: currentUser }
		} as never);

		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
	});

	it('returns 400 with the mapped message when better-auth rejects the change', async () => {
		api.changePassword.mockRejectedValue(new Error('INVALID_PASSWORD'));

		const result = await actions.changePassword({
			request: changePasswordRequest(),
			getClientAddress: () => '203.0.113.7',
			locals: { user: { ...currentUser, id: 'user-wrong-password' } }
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: {
				form: {
					message: {
						type: 'error',
						text: 'Current password is incorrect or password change failed.'
					}
				}
			}
		});
		expect(sendPasswordChangedEmail).not.toHaveBeenCalled();
	});

	it('rate-limits repeated attempts per user', async () => {
		const user = { ...currentUser, id: 'user-rate-limited' };
		const attempt = () =>
			actions.changePassword({
				request: changePasswordRequest(),
				getClientAddress: () => '203.0.113.7',
				locals: { user }
			} as never);

		for (let i = 0; i < 5; i++) {
			await attempt();
		}
		api.changePassword.mockClear();

		const result = await attempt();

		expect(api.changePassword).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 429 });
	});
});
