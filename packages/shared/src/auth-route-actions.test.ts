import { isRedirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthFormHandler } from './auth-form-handler';
import { createAuthRouteActions, type AuthPagesApi } from './auth-route-actions';
import { FORGOT_PASSWORD_RESPONSE } from './forgot-password-response';

const api = {
	signInEmail: vi.fn<(options: unknown) => Promise<unknown>>(),
	signOut: vi.fn<(options: unknown) => Promise<unknown>>(),
	requestPasswordReset: vi.fn<(options: unknown) => Promise<unknown>>(),
	resetPassword: vi.fn<(options: unknown) => Promise<unknown>>(),
	sendVerificationEmail: vi.fn<(options: unknown) => Promise<unknown>>()
};
const logger = { error: vi.fn<(message: string, error?: unknown) => void>() };
const rateLimitCheck = vi.fn<() => Promise<{ limited: boolean; retryAfter: number }>>();

const routes = createAuthRouteActions({
	auth: { api } as unknown as AuthPagesApi,
	logger,
	handleAuthFormAction: createAuthFormHandler({
		logger,
		getErrorMessage: (_error, fallback) => fallback
	}),
	createAuthRateLimiter: () => ({ check: rateLimitCheck }) as never,
	postLoginRoute: '/dashboard'
});

function post(path: string, fields: Record<string, string>) {
	return new Request(`https://app.example.com${path}`, {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
}

function loadEvent(url: string, user: unknown = null) {
	return { locals: { user }, url: new URL(url) } as never;
}

async function thrown(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (error) {
		return error;
	}
	throw new Error('expected a throw');
}

const tooMany = (seconds: number) => ({
	status: 429,
	data: {
		form: {
			message: { type: 'error', text: `Too many attempts. Please try again in ${seconds} seconds.` }
		}
	}
});

beforeEach(() => {
	vi.clearAllMocks();
	rateLimitCheck.mockResolvedValue({ limited: false, retryAfter: 0 });
});

describe('signIn', () => {
	const fields = { email: 'user@example.com', password: 'correct-horse-battery' };

	it('redirects an already signed-in visitor to the post-login route', async () => {
		const err = await thrown(() =>
			routes.signIn.load(loadEvent('https://app.example.com/sign-in', { id: 'u1' }))
		);
		expect(isRedirect(err) && err.location).toBe('/dashboard');
	});

	it('surfaces only whitelisted query flags', async () => {
		const result = await routes.signIn.load(
			loadEvent('https://app.example.com/sign-in?reset=success&verify=invalid')
		);
		expect(result).toMatchObject({ resetComplete: true, invalidVerificationLink: true });
	});

	it('signs in and redirects to the post-login route', async () => {
		api.signInEmail.mockResolvedValueOnce({});
		const request = post('/sign-in', fields);

		const err = await thrown(() => routes.signIn.actions.default({ request } as never));

		expect(api.signInEmail).toHaveBeenCalledWith({ body: fields, headers: request.headers });
		expect(isRedirect(err) && err.location).toBe('/dashboard');
	});

	it('sends an unverified user to verify-email instead of a dead-end error', async () => {
		api.signInEmail.mockRejectedValueOnce({ body: { code: 'EMAIL_NOT_VERIFIED' } });

		const err = await thrown(() =>
			routes.signIn.actions.default({ request: post('/sign-in', fields) } as never)
		);

		expect(isRedirect(err) && err.location).toBe('/verify-email?email=user%40example.com');
	});

	it('returns a form error for bad credentials', async () => {
		api.signInEmail.mockRejectedValueOnce(new Error('INVALID_EMAIL_OR_PASSWORD'));

		const result = await routes.signIn.actions.default({
			request: post('/sign-in', fields)
		} as never);

		expect(result).toMatchObject({ status: 400, data: { form: { message: { type: 'error' } } } });
	});

	it('returns a 429 and skips Better Auth when rate limited', async () => {
		rateLimitCheck.mockResolvedValueOnce({ limited: true, retryAfter: 9 });

		const result = await routes.signIn.actions.default({
			request: post('/sign-in', fields)
		} as never);

		expect(api.signInEmail).not.toHaveBeenCalled();
		expect(result).toMatchObject(tooMany(9));
	});
});

describe('signOut', () => {
	const run = () =>
		thrown(() =>
			routes.signOut.actions.default({
				request: new Request('https://app.example.com/sign-out', { method: 'POST' })
			} as never)
		);

	it('signs out and redirects to sign-in', async () => {
		api.signOut.mockResolvedValueOnce({ success: true });

		const err = await run();

		expect(api.signOut).toHaveBeenCalledOnce();
		expect(isRedirect(err) && err.location).toBe('/sign-in');
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('still redirects to sign-in and logs when Better Auth fails', async () => {
		api.signOut.mockRejectedValueOnce(new Error('Session not found'));

		const err = await run();

		expect(isRedirect(err) && err.location).toBe('/sign-in');
		expect(logger.error).toHaveBeenCalledWith('Sign-out failed', expect.any(Error));
	});
});

describe('forgotPassword', () => {
	const run = (email: string) =>
		routes.forgotPassword.actions.default({
			request: post('/forgot-password', { email })
		} as never);

	it('asks Better Auth to send a reset link for a valid email', async () => {
		api.requestPasswordReset.mockResolvedValueOnce({ status: true });

		const result = await run('user@example.com');

		expect(api.requestPasswordReset).toHaveBeenCalledWith({
			body: { email: 'user@example.com', redirectTo: '/reset-password' },
			headers: expect.any(Headers)
		});
		expect(result).toMatchObject({ form: { message: FORGOT_PASSWORD_RESPONSE } });
	});

	it('does not call Better Auth for an invalid email', async () => {
		const result = await run('not-an-email');

		expect(api.requestPasswordReset).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 400 });
	});

	it('answers a failure with the same banner, text and styling, as success', async () => {
		api.requestPasswordReset.mockRejectedValueOnce(new Error('Password reset request failed'));

		const result = await run('user@example.com');

		expect(logger.error).toHaveBeenCalledWith('Password reset request failed', expect.any(Error));
		expect(result).toMatchObject({
			status: 400,
			data: { form: { message: FORGOT_PASSWORD_RESPONSE } }
		});
	});

	it('returns a 429 and skips Better Auth when rate limited', async () => {
		rateLimitCheck.mockResolvedValueOnce({ limited: true, retryAfter: 42 });

		const result = await run('user@example.com');

		expect(api.requestPasswordReset).not.toHaveBeenCalled();
		expect(result).toMatchObject(tooMany(42));
	});
});

describe('resetPassword', () => {
	const validFields = {
		token: 'reset-token-123',
		password: 'Brand-New-Secret1!',
		confirmPassword: 'Brand-New-Secret1!'
	};
	const run = (fields: Record<string, string>) =>
		routes.resetPassword.actions.default({ request: post('/reset-password', fields) } as never);

	it('resets the password and redirects to sign-in with the success flag', async () => {
		api.resetPassword.mockResolvedValueOnce({ status: true });

		const err = await thrown(() => run(validFields));

		expect(api.resetPassword).toHaveBeenCalledWith({
			body: { token: 'reset-token-123', newPassword: 'Brand-New-Secret1!' }
		});
		expect(isRedirect(err) && err.location).toBe('/sign-in?reset=success');
	});

	it('rejects a submission with no token', async () => {
		const { token: _token, ...withoutToken } = validFields;

		const result = await run(withoutToken);

		expect(api.resetPassword).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 400 });
	});

	it('rejects mismatched passwords without calling Better Auth', async () => {
		const result = await run({ ...validFields, confirmPassword: 'different-secret' });

		expect(api.resetPassword).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 400 });
	});

	it('returns a generic error and logs when the token is invalid or expired', async () => {
		api.resetPassword.mockRejectedValueOnce(new Error('INVALID_TOKEN'));

		const result = await run(validFields);

		expect(logger.error).toHaveBeenCalledWith('Password reset failed', expect.any(Error));
		expect(result).toMatchObject({
			status: 400,
			data: {
				form: {
					message: {
						type: 'error',
						text: 'This reset link is invalid or has expired. Request a new one.'
					}
				}
			}
		});
	});

	it('returns a 429 and skips Better Auth when rate limited', async () => {
		rateLimitCheck.mockResolvedValueOnce({ limited: true, retryAfter: 17 });

		const result = await run(validFields);

		expect(api.resetPassword).not.toHaveBeenCalled();
		expect(result).toMatchObject(tooMany(17));
	});

	it.each([
		['the token param is missing', 'https://app.example.com/reset-password', null, true],
		[
			"Better Auth's verifier redirected back with ?error=",
			'https://app.example.com/reset-password?token=bad&error=INVALID_TOKEN',
			'bad',
			true
		],
		[
			'a token is present with no ?error=',
			'https://app.example.com/reset-password?token=good',
			'good',
			false
		]
	])('load marks the link invalid=%s when %s', async (_case, url, token, invalid) => {
		const result = await routes.resetPassword.load(loadEvent(url));

		expect(result).toMatchObject({ token, invalid });
	});
});

describe('verifyEmail', () => {
	const run = (email: string) =>
		routes.verifyEmail.actions.resend({
			request: post('/verify-email?/resend', { email })
		} as never);
	const GENERIC_RESULT =
		'If an unverified account exists, a fresh verification link is on its way.';

	it('redirects to sign-in when there is no email to verify', async () => {
		const err = await thrown(() =>
			routes.verifyEmail.load(loadEvent('https://app.example.com/verify-email'))
		);

		expect(isRedirect(err) && err.location).toBe('/sign-in?verify=invalid');
	});

	it('asks Better Auth to send a new link for a valid email', async () => {
		api.sendVerificationEmail.mockResolvedValueOnce({ status: true });

		const result = await run('user@example.com');

		expect(api.sendVerificationEmail).toHaveBeenCalledWith({
			body: { email: 'user@example.com' },
			headers: expect.any(Headers)
		});
		expect(result).toMatchObject({ form: { message: { type: 'success', text: GENERIC_RESULT } } });
	});

	it('does not call Better Auth for an invalid email', async () => {
		const result = await run('not-an-email');

		expect(api.sendVerificationEmail).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 400 });
	});

	it('returns a generic error when Better Auth cannot send the email', async () => {
		api.sendVerificationEmail.mockRejectedValueOnce(new Error('send failed'));

		const result = await run('user@example.com');

		expect(logger.error).toHaveBeenCalledWith(
			'Failed to resend verification email',
			expect.any(Error)
		);
		expect(result).toMatchObject({
			status: 400,
			data: {
				form: {
					message: {
						type: 'error',
						text: 'We could not send a verification email. Please try again shortly.'
					}
				}
			}
		});
	});

	it('returns a 429 and skips Better Auth when rate limited', async () => {
		rateLimitCheck.mockResolvedValueOnce({ limited: true, retryAfter: 42 });

		const result = await run('user@example.com');

		expect(api.sendVerificationEmail).not.toHaveBeenCalled();
		expect(result).toMatchObject(tooMany(42));
	});
});
