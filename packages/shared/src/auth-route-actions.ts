// The `load`/`actions` pairs behind every app's `(auth)` pages. Each app binds its
// Better Auth instance, logger and wrappers via `createAuthRouteActions` in its own
// `#lib/server/auth-route-actions`, and each `+page.server.ts` just re-exports one entry.

import { redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';

import { invalidAuthForm, type createAuthFormHandler } from './auth-form-handler';
import { createAuthLoadForm, createRedirectIfAuthenticated } from './auth-form-helpers';
import { RESET_PASSWORD_ROUTE, SIGN_IN_ROUTE, VERIFY_EMAIL_ROUTE } from './auth-routes';
import {
	forgotPasswordSchema,
	resendVerificationSchema,
	resetPasswordSchema,
	signInSchema
} from './auth-schemas';
import { getBetterAuthErrorCode } from './better-auth-errors';
import { FORGOT_PASSWORD_RESPONSE } from './forgot-password-response';
import { rateLimitedMessage, type createAuthRateLimiter } from './rate-limiter';

/** The Better Auth server API calls the auth pages make. */
export interface AuthPagesApi {
	api: {
		signInEmail(options: {
			body: { email: string; password: string };
			headers: Headers;
		}): Promise<unknown>;
		signOut(options: { headers: Headers }): Promise<unknown>;
		requestPasswordReset(options: {
			body: { email: string; redirectTo: string };
			headers: Headers;
		}): Promise<unknown>;
		resetPassword(options: { body: { token: string; newPassword: string } }): Promise<unknown>;
		sendVerificationEmail(options: { body: { email: string }; headers: Headers }): Promise<unknown>;
	};
}

export interface AuthRouteActionsDeps {
	auth: AuthPagesApi;
	logger: { error(message: string, error?: unknown): void };
	/** The app's bound `createAuthFormHandler(...)`. */
	handleAuthFormAction: ReturnType<typeof createAuthFormHandler>;
	/** Injected rather than imported so route tests can mock the app's rate-limiter module. */
	createAuthRateLimiter: typeof createAuthRateLimiter;
	/** Where an already-signed-in visitor, or a successful sign-in, lands. */
	postLoginRoute: string;
}

const INVALID_EMAIL_MESSAGE = 'Please enter a valid email address.';

const INVALID_RESET_LINK_MESSAGE = 'This reset link is invalid or has expired. Request a new one.';

const GENERIC_RESEND_RESULT =
	'If an unverified account exists, a fresh verification link is on its way.';

type LoadEvent = Pick<RequestEvent, 'locals' | 'url'>;

function isEmailNotVerified(error: unknown): boolean {
	return getBetterAuthErrorCode(error) === 'EMAIL_NOT_VERIFIED';
}

export function createAuthRouteActions(deps: AuthRouteActionsDeps) {
	const { auth, logger, handleAuthFormAction, postLoginRoute } = deps;
	const redirectIfAuthenticated = createRedirectIfAuthenticated(postLoginRoute);

	function signIn() {
		const limiter = deps.createAuthRateLimiter();

		return {
			load: async ({ locals, url }: LoadEvent) => {
				redirectIfAuthenticated(locals.user);

				const form = await createAuthLoadForm(signInSchema);
				// Whitelisted flags only — reset-password redirects here with ?reset=success and
				// verify-email with ?verify=invalid. No query text is reflected.
				const resetComplete = url.searchParams.get('reset') === 'success';
				const invalidVerificationLink = url.searchParams.get('verify') === 'invalid';

				return { form, resetComplete, invalidVerificationLink };
			},
			actions: {
				default: async (event: RequestEvent) => {
					const { request } = event;
					const form = await superValidate(request, zod4(signInSchema));
					if (!form.valid) {
						return invalidAuthForm(form);
					}

					const rateLimitStatus = await limiter.check(event);
					if (rateLimitStatus.limited) {
						return rateLimitedMessage(form, rateLimitStatus.retryAfter);
					}

					return handleAuthFormAction(
						form,
						async () => {
							try {
								await auth.api.signInEmail({
									body: { email: form.data.email, password: form.data.password },
									headers: request.headers
								});
							} catch (error) {
								// An unverified account can't sign in, but better-auth
								// (emailVerification.sendOnSignIn) has just re-sent a fresh
								// verification link. Send the user to the page that explains that,
								// instead of surfacing a dead-end "email not verified" form error.
								if (isEmailNotVerified(error)) {
									throw redirect(
										302,
										`${VERIFY_EMAIL_ROUTE}?email=${encodeURIComponent(form.data.email)}`
									);
								}
								throw error;
							}

							throw redirect(302, postLoginRoute);
						},
						{
							loggerContext: 'Sign-in failed',
							fallbackMessage: 'An error occurred during sign-in. Please try again.'
						}
					);
				}
			}
		};
	}

	function signOut() {
		return {
			actions: {
				default: async ({ request }: RequestEvent) => {
					// Sign-out always lands on sign-in: if Better Auth fails to revoke the session,
					// log it rather than surfacing a 500 the user can't act on. The (app) guard
					// re-checks the session either way.
					try {
						await auth.api.signOut({ headers: request.headers });
					} catch (error) {
						logger.error('Sign-out failed', error);
					}

					throw redirect(302, SIGN_IN_ROUTE);
				}
			}
		};
	}

	function forgotPassword() {
		const limiter = deps.createAuthRateLimiter();

		return {
			load: async ({ locals }: LoadEvent) => {
				redirectIfAuthenticated(locals.user);
				const form = await createAuthLoadForm(forgotPasswordSchema);

				return { form };
			},
			actions: {
				default: async (event: RequestEvent) => {
					const { request } = event;
					const form = await superValidate(request, zod4(forgotPasswordSchema));
					if (!form.valid) {
						return invalidAuthForm(form, INVALID_EMAIL_MESSAGE);
					}

					const rateLimitStatus = await limiter.check(event);
					if (rateLimitStatus.limited) {
						return rateLimitedMessage(form, rateLimitStatus.retryAfter);
					}

					return handleAuthFormAction(
						form,
						async () => {
							await auth.api.requestPasswordReset({
								body: { email: form.data.email, redirectTo: RESET_PASSWORD_ROUTE },
								headers: request.headers
							});

							return message(form, FORGOT_PASSWORD_RESPONSE);
						},
						{
							loggerContext: 'Password reset request failed',
							fallbackMessage: FORGOT_PASSWORD_RESPONSE.text,
							// Same text *and* same styling as the success path, so the banner cannot
							// be used to probe whether an account exists.
							errorType: FORGOT_PASSWORD_RESPONSE.type
						}
					);
				}
			}
		};
	}

	function resetPassword() {
		const limiter = deps.createAuthRateLimiter();

		return {
			load: async ({ locals, url }: LoadEvent) => {
				redirectIfAuthenticated(locals.user);

				const token = url.searchParams.get('token');
				// Better Auth's built-in GET verifier redirects here with `?error=INVALID_TOKEN`
				// when the emailed link is expired or malformed, and with `?token=...` when valid.
				const invalid = !token || url.searchParams.has('error');

				const form = await createAuthLoadForm(resetPasswordSchema);

				return { token, invalid, form };
			},
			actions: {
				default: async (event: RequestEvent) => {
					const { request } = event;
					const form = await superValidate(request, zod4(resetPasswordSchema));
					if (!form.data.token) {
						return invalidAuthForm(form, INVALID_RESET_LINK_MESSAGE);
					}
					if (!form.valid) {
						return invalidAuthForm(form);
					}

					const rateLimitStatus = await limiter.check(event);
					if (rateLimitStatus.limited) {
						return rateLimitedMessage(form, rateLimitStatus.retryAfter);
					}

					const token = form.data.token;
					return handleAuthFormAction(
						form,
						async () => {
							await auth.api.resetPassword({
								body: { token, newPassword: form.data.password }
							});

							// Whitelisted flag only — the sign-in page renders a fixed confirmation
							// banner for ?reset=success; no message text is reflected through the URL.
							throw redirect(302, `${SIGN_IN_ROUTE}?reset=success`);
						},
						{
							loggerContext: 'Password reset failed',
							fallbackMessage: INVALID_RESET_LINK_MESSAGE
						}
					);
				}
			}
		};
	}

	function verifyEmail() {
		const limiter = deps.createAuthRateLimiter();

		return {
			load: async ({ locals, url }: LoadEvent) => {
				redirectIfAuthenticated(locals.user);

				const email = url.searchParams.get('email');
				// Whitelisted flag only — the sign-in page renders a fixed banner for
				// ?verify=invalid; no message text is reflected through the URL.
				if (!email) {
					throw redirect(302, `${SIGN_IN_ROUTE}?verify=invalid`);
				}

				const verificationForm = await superValidate({ email }, zod4(resendVerificationSchema), {
					errors: false
				});

				return { email, verificationForm };
			},
			actions: {
				resend: async (event: RequestEvent) => {
					const { request } = event;
					const form = await superValidate(request, zod4(resendVerificationSchema));
					if (!form.valid) {
						return invalidAuthForm(form, INVALID_EMAIL_MESSAGE);
					}

					const rateLimitStatus = await limiter.check(event);
					if (rateLimitStatus.limited) {
						return rateLimitedMessage(form, rateLimitStatus.retryAfter);
					}

					return handleAuthFormAction(
						form,
						async () => {
							await auth.api.sendVerificationEmail({
								body: { email: form.data.email },
								headers: request.headers
							});

							return message(form, { type: 'success', text: GENERIC_RESEND_RESULT });
						},
						{
							loggerContext: 'Failed to resend verification email',
							fallbackMessage: 'We could not send a verification email. Please try again shortly.'
						}
					);
				}
			}
		};
	}

	return {
		signIn: signIn(),
		signOut: signOut(),
		forgotPassword: forgotPassword(),
		resetPassword: resetPassword(),
		verifyEmail: verifyEmail()
	};
}
