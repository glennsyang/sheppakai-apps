import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/svelte';

/**
 * Browser-only Better Auth client for the passkey flows (sign-in button, autofill and the
 * Profile Passkeys list). Everything else still goes through SvelteKit form actions.
 * Same-origin, so `baseURL` is left to the default (`/api/auth` on the current origin).
 */
export function createPasskeyAuthClient() {
	return createAuthClient({ plugins: [passkeyClient()] });
}

/** Whether this browser can run WebAuthn at all; hide the passkey button when it can't. */
export function isPasskeySupported(): boolean {
	return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

export const PASSKEY_NOT_FOUND_MESSAGE =
	'No passkey found for this device. Sign in with your password, then add one from Profile.';
export const PASSKEY_ALREADY_REGISTERED_MESSAGE =
	'This device already has a passkey for your account.';
export const PASSKEY_SESSION_NOT_FRESH_MESSAGE =
	'For your security, sign out and sign in again before adding a passkey.';
export const PASSKEY_GENERIC_MESSAGE =
	'Passkey sign-in did not work. Try again, or sign in with your password.';

/**
 * Codes for a prompt the user dismissed (or that was aborted, e.g. autofill cancelled when
 * the password form submits). Browsers report "no matching passkey" as the same
 * `NotAllowedError` on purpose, so these all stay silent.
 */
const SILENT_CODES = new Set([
	'NotAllowedError',
	'AbortError',
	'AUTH_CANCELLED',
	'REGISTRATION_CANCELLED',
	'ERROR_CEREMONY_ABORTED',
	'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'
]);

type ErrorLike = { name?: unknown; code?: unknown; message?: unknown };

function asErrorLike(value: unknown): ErrorLike | undefined {
	return value && typeof value === 'object' ? value : undefined;
}

/**
 * Maps a passkey failure to the copy shown to the user, or `null` when nothing should be
 * shown (the user cancelled). Accepts either a thrown error (`DOMException`, WebAuthn
 * error) or the `error` of a Better Auth `{ data, error }` result. Server errors with
 * their own message (allowlist "Invalid email or password", the admin ban message) pass
 * through, matching what password sign-in shows.
 */
export function passkeyErrorMessage(error: unknown): string | null {
	const err = asErrorLike(error);
	if (!err) return PASSKEY_GENERIC_MESSAGE;

	const code = typeof err.code === 'string' ? err.code : undefined;
	const name = typeof err.name === 'string' ? err.name : undefined;
	if ((code && SILENT_CODES.has(code)) || (name && SILENT_CODES.has(name))) return null;

	if (code === 'PASSKEY_NOT_FOUND') return PASSKEY_NOT_FOUND_MESSAGE;
	if (code === 'PREVIOUSLY_REGISTERED' || code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
		return PASSKEY_ALREADY_REGISTERED_MESSAGE;
	}
	if (code === 'SESSION_NOT_FRESH') return PASSKEY_SESSION_NOT_FRESH_MESSAGE;
	if (code === 'BANNED_USER' || code === 'INVALID_EMAIL_OR_PASSWORD') {
		return typeof err.message === 'string' && err.message ? err.message : PASSKEY_GENERIC_MESSAGE;
	}
	return PASSKEY_GENERIC_MESSAGE;
}
