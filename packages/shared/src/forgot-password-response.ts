// Shared by every app. Success and failure return the exact same banner, so no path can be used
// to probe whether an email has an account.
export const FORGOT_PASSWORD_RESPONSE = {
	type: 'success',
	text: 'If an account exists with that email, you will receive a password reset link.'
} as const;
