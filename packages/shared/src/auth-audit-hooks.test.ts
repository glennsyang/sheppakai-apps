import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('better-auth/api', async (importOriginal) => ({
	...(await importOriginal<typeof import('better-auth/api')>()),
	// The real createAuthMiddleware wraps the callback in better-call's
	// middleware machinery — not worth mocking. The callback itself is what
	// this test exercises, so treat the wrapper as identity.
	createAuthMiddleware: (fn: unknown) => fn
}));

import { APIError } from 'better-auth/api';

import { createAuthAfterHooks, logPasswordResetAudit } from './auth-audit-hooks';
import type { PasskeyAddedEmailPayload } from './email';

const mockState = {
	sendNewUserEmail: vi.fn<(to: string, name: string) => unknown>(),
	sendPasskeyAddedEmail: vi.fn<(payload: PasskeyAddedEmailPayload) => unknown>(),
	sendAuthAlerts: vi.fn<(message: string, title: string, priority: number) => void>(),
	loggerInfo: vi.fn<(message: string, meta?: Record<string, unknown>) => void>(),
	loggerError: vi.fn<(message: string, error?: unknown) => void>()
};

const deps = {
	logger: { info: mockState.loggerInfo, error: mockState.loggerError },
	sendNewUserEmail: mockState.sendNewUserEmail,
	sendPasskeyAddedEmail: mockState.sendPasskeyAddedEmail,
	sendAuthAlerts: mockState.sendAuthAlerts,
	profileUrl: 'https://app.example.com/profile'
};

beforeEach(() => {
	vi.clearAllMocks();
});

type FakeCtx = {
	path: string;
	body?: unknown;
	context: {
		newSession: {
			user: { id: string; email: string; name: string };
			session: { ipAddress: string };
		} | null;
		session?: { user: { id: string; email: string; name: string } } | null;
		returned?: unknown;
	};
};

function fakeCtx(overrides: Partial<FakeCtx> = {}): FakeCtx {
	return { path: '/unrelated', context: { newSession: null }, ...overrides };
}

const signedIn = { user: { id: 'user-1', email: 'user@example.com', name: 'User' } };

describe('createAuthAfterHooks', () => {
	const afterHook = createAuthAfterHooks('Test App', deps) as unknown as (
		ctx: FakeCtx
	) => Promise<void>;

	it('sends the welcome email and admin alert on /sign-up/email with a new session', async () => {
		await afterHook(
			fakeCtx({
				path: '/sign-up/email',
				context: {
					newSession: {
						user: { id: 'user-new', email: 'new@example.com', name: 'New User' },
						session: { ipAddress: '1.2.3.4' }
					}
				}
			})
		);

		expect(mockState.sendNewUserEmail).toHaveBeenCalledWith('new@example.com', 'New User');
		expect(mockState.sendAuthAlerts).toHaveBeenCalledWith(
			'New user registered: user-new',
			'Test App - New User Alert',
			4
		);
	});

	it('logs a rejecting welcome email instead of rejecting the hook', async () => {
		const failure = new Error('brevo down');
		mockState.sendNewUserEmail.mockRejectedValueOnce(failure);

		await expect(
			afterHook(
				fakeCtx({
					path: '/sign-up/email',
					context: {
						newSession: {
							user: { id: 'user-new', email: 'new@example.com', name: 'New User' },
							session: { ipAddress: '1.2.3.4' }
						}
					}
				})
			)
		).resolves.toBeUndefined();

		await vi.waitFor(() =>
			expect(mockState.loggerError).toHaveBeenCalledWith('New user email failed', failure)
		);
		expect(mockState.sendAuthAlerts).toHaveBeenCalled();
	});

	it('does nothing on /sign-up/email without a new session', async () => {
		await afterHook(fakeCtx({ path: '/sign-up/email' }));

		expect(mockState.sendNewUserEmail).not.toHaveBeenCalled();
		expect(mockState.sendAuthAlerts).not.toHaveBeenCalled();
	});

	it('logs the resolved email + IP on /sign-in/email with a new session', async () => {
		await afterHook(
			fakeCtx({
				path: '/sign-in/email',
				context: {
					newSession: {
						user: { id: 'user-1', email: 'user@example.com', name: 'User' },
						session: { ipAddress: '5.6.7.8' }
					}
				}
			})
		);

		expect(mockState.loggerInfo).toHaveBeenCalledWith(
			expect.stringContaining('Sign-in'),
			expect.objectContaining({ email: 'user@example.com', ip: '5.6.7.8', method: 'password' })
		);
	});

	it('logs Sign-in successful with method passkey on /passkey/verify-authentication', async () => {
		await afterHook(
			fakeCtx({
				path: '/passkey/verify-authentication',
				context: {
					newSession: {
						user: { id: 'user-1', email: 'user@example.com', name: 'User' },
						session: { ipAddress: '5.6.7.8' }
					}
				}
			})
		);

		expect(mockState.loggerInfo).toHaveBeenCalledWith('Sign-in successful', {
			email: 'user@example.com',
			ip: '5.6.7.8',
			method: 'passkey'
		});
	});

	it('logs nothing for a failed passkey sign-in (no new session)', async () => {
		await afterHook(fakeCtx({ path: '/passkey/verify-authentication' }));

		expect(mockState.loggerInfo).not.toHaveBeenCalled();
	});

	it('sends the passkey-added email and a security alert after registration', async () => {
		await afterHook(
			fakeCtx({
				path: '/passkey/verify-registration',
				context: {
					newSession: null,
					session: signedIn,
					returned: { id: 'pk-1', name: 'iPhone', userId: 'user-1' }
				}
			})
		);

		expect(mockState.loggerInfo).toHaveBeenCalledWith('Passkey added', {
			userId: 'user-1',
			passkeyId: 'pk-1'
		});
		expect(mockState.sendPasskeyAddedEmail).toHaveBeenCalledWith({
			to: 'user@example.com',
			name: 'User',
			deviceName: 'iPhone',
			addedAt: expect.any(Date),
			profileUrl: 'https://app.example.com/profile'
		});
		expect(mockState.sendAuthAlerts).toHaveBeenCalledWith(
			'Passkey added for user user-1',
			'Test App - Security Alert',
			4
		);
	});

	it('logs a failing passkey-added email instead of failing the registration', async () => {
		const failure = new Error('brevo down');
		mockState.sendPasskeyAddedEmail.mockRejectedValueOnce(failure);

		await expect(
			afterHook(
				fakeCtx({
					path: '/passkey/verify-registration',
					context: { newSession: null, session: signedIn, returned: { id: 'pk-1', name: '' } }
				})
			)
		).resolves.toBeUndefined();

		await vi.waitFor(() =>
			expect(mockState.loggerError).toHaveBeenCalledWith('Passkey added email failed', failure)
		);
		expect(mockState.sendPasskeyAddedEmail).toHaveBeenCalledWith(
			expect.objectContaining({ deviceName: null })
		);
		expect(mockState.sendAuthAlerts).toHaveBeenCalled();
	});

	it('sends nothing when passkey registration failed', async () => {
		await afterHook(
			fakeCtx({
				path: '/passkey/verify-registration',
				context: {
					newSession: null,
					session: signedIn,
					returned: APIError.from('BAD_REQUEST', {
						code: 'FAILED_TO_VERIFY_REGISTRATION',
						message: 'Failed to verify registration'
					})
				}
			})
		);

		expect(mockState.sendPasskeyAddedEmail).not.toHaveBeenCalled();
		expect(mockState.sendAuthAlerts).not.toHaveBeenCalled();
		expect(mockState.loggerInfo).not.toHaveBeenCalled();
	});

	it('logs a removed passkey on /passkey/delete-passkey', async () => {
		await afterHook(
			fakeCtx({
				path: '/passkey/delete-passkey',
				body: { id: 'pk-1' },
				context: { newSession: null, session: signedIn, returned: { status: true } }
			})
		);

		expect(mockState.loggerInfo).toHaveBeenCalledWith('Passkey removed', {
			userId: 'user-1',
			passkeyId: 'pk-1'
		});
	});

	it('does not fire on an unrelated path', async () => {
		await afterHook(fakeCtx({ path: '/reset-password' }));

		expect(mockState.sendNewUserEmail).not.toHaveBeenCalled();
		expect(mockState.sendAuthAlerts).not.toHaveBeenCalled();
		expect(mockState.loggerInfo).not.toHaveBeenCalled();
	});

	it('does not match a path that merely contains the endpoint as a substring', async () => {
		// Regression guard for the original bug: `.includes('/register')` never
		// matched the real `/sign-up/email` endpoint. Exact-match must not
		// accidentally match a longer path either.
		await afterHook(fakeCtx({ path: '/sign-up/email/extra' }));

		expect(mockState.sendNewUserEmail).not.toHaveBeenCalled();
	});
});

describe('logPasswordResetAudit', () => {
	it('logs and alerts with the given user and app name', () => {
		logPasswordResetAudit({ id: 'user-1', email: 'reset@example.com' }, 'Test App', deps);

		expect(mockState.loggerInfo).toHaveBeenCalledWith(
			expect.stringContaining('password reset completed'),
			expect.objectContaining({ userId: 'user-1', email: 'reset@example.com' })
		);
		expect(mockState.sendAuthAlerts).toHaveBeenCalledWith(
			'Password reset completed for user user-1',
			'Test App - Security Alert',
			4
		);
	});
});
