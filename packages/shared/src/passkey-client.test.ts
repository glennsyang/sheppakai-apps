import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	createPasskeyAuthClient,
	isPasskeySupported,
	PASSKEY_ALREADY_REGISTERED_MESSAGE,
	PASSKEY_GENERIC_MESSAGE,
	PASSKEY_NOT_FOUND_MESSAGE,
	PASSKEY_SESSION_NOT_FRESH_MESSAGE,
	passkeyErrorMessage
} from './passkey-client';

describe('passkeyErrorMessage', () => {
	it('stays silent when the user cancels or the prompt is aborted', () => {
		expect(passkeyErrorMessage(new DOMException('cancelled', 'NotAllowedError'))).toBeNull();
		expect(passkeyErrorMessage(new DOMException('aborted', 'AbortError'))).toBeNull();
		expect(passkeyErrorMessage({ code: 'AUTH_CANCELLED', message: 'x' })).toBeNull();
		expect(passkeyErrorMessage({ code: 'REGISTRATION_CANCELLED', message: 'x' })).toBeNull();
		expect(passkeyErrorMessage({ code: 'ERROR_CEREMONY_ABORTED' })).toBeNull();
		expect(passkeyErrorMessage({ code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY' })).toBeNull();
	});

	it('explains a passkey the server no longer knows', () => {
		expect(passkeyErrorMessage({ code: 'PASSKEY_NOT_FOUND', message: 'Passkey not found' })).toBe(
			PASSKEY_NOT_FOUND_MESSAGE
		);
	});

	it('explains a device that already has a passkey', () => {
		expect(passkeyErrorMessage({ code: 'PREVIOUSLY_REGISTERED' })).toBe(
			PASSKEY_ALREADY_REGISTERED_MESSAGE
		);
		expect(passkeyErrorMessage({ code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' })).toBe(
			PASSKEY_ALREADY_REGISTERED_MESSAGE
		);
	});

	it('asks for a fresh sign-in when the session is too old to add a passkey', () => {
		expect(passkeyErrorMessage({ code: 'SESSION_NOT_FRESH', message: 'x' })).toBe(
			PASSKEY_SESSION_NOT_FRESH_MESSAGE
		);
	});

	it('passes through the allowlist and ban messages, as password sign-in shows them', () => {
		expect(
			passkeyErrorMessage({
				code: 'INVALID_EMAIL_OR_PASSWORD',
				message: 'Invalid email or password'
			})
		).toBe('Invalid email or password');
		expect(passkeyErrorMessage({ code: 'BANNED_USER', message: 'You have been banned' })).toBe(
			'You have been banned'
		);
	});

	it('falls back to generic copy for anything else', () => {
		expect(passkeyErrorMessage({ code: 'AUTHENTICATION_FAILED', message: 'internal' })).toBe(
			PASSKEY_GENERIC_MESSAGE
		);
		expect(passkeyErrorMessage(new Error('boom'))).toBe(PASSKEY_GENERIC_MESSAGE);
		expect(passkeyErrorMessage('nope')).toBe(PASSKEY_GENERIC_MESSAGE);
		expect(passkeyErrorMessage({ code: 'BANNED_USER' })).toBe(PASSKEY_GENERIC_MESSAGE);
	});
});

describe('isPasskeySupported', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('is false without a window (SSR)', () => {
		expect(isPasskeySupported()).toBe(false);
	});

	it('follows window.PublicKeyCredential', () => {
		vi.stubGlobal('window', {});
		expect(isPasskeySupported()).toBe(false);
		vi.stubGlobal('window', { PublicKeyCredential: function PublicKeyCredential() {} });
		expect(isPasskeySupported()).toBe(true);
	});
});

describe('createPasskeyAuthClient', () => {
	it('exposes the passkey actions', () => {
		const client = createPasskeyAuthClient();
		expect(typeof client.signIn.passkey).toBe('function');
		expect(typeof client.passkey.addPasskey).toBe('function');
		expect(typeof client.passkey.deletePasskey).toBe('function');
	});
});
