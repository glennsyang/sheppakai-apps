import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequireApiKey, getApiKeyOwnerRejection, type ApiKeyOwner } from './api-key';
import { createAdminGuards } from './auth-guard';

const mockVerifyApiKey = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLoggerWarn = vi.fn<(...args: unknown[]) => void>();
const mockFindUserById = vi.fn<(userId: string) => Promise<ApiKeyOwner | undefined>>();

const activeAdmin: ApiKeyOwner = {
	id: 'user1',
	email: 'owner@example.com',
	role: 'admin',
	banned: false,
	banExpires: null
};

const allowedEmails = new Set(['owner@example.com']);
const { isAdminUser } = createAdminGuards(() => 'env-admin');

const requireApiKey = createRequireApiKey<string>({
	verifyApiKey: mockVerifyApiKey as Parameters<typeof createRequireApiKey>[0]['verifyApiKey'],
	findOwner: mockFindUserById,
	allowedEmails,
	isAdminUser,
	logger: { warn: mockLoggerWarn }
});

function request(headers: Record<string, string> = {}): Request {
	return new Request('https://example.com/api/v1/transactions', { headers });
}

describe('requireApiKey', () => {
	beforeEach(() => {
		mockVerifyApiKey.mockReset();
		mockLoggerWarn.mockReset();
		mockFindUserById.mockReset();
		mockFindUserById.mockResolvedValue(activeAdmin);
	});

	it('rejects a missing Authorization header', async () => {
		const result = await requireApiKey(request(), 'transactions:read');
		expect(result).toEqual({
			ok: false,
			status: 401,
			code: 'missing_header',
			message: expect.any(String)
		});
		expect(mockVerifyApiKey).not.toHaveBeenCalled();
		expect(mockLoggerWarn).toHaveBeenCalled();
	});

	it('rejects a malformed Authorization header', async () => {
		const result = await requireApiKey(request({ authorization: 'Bearer' }), 'transactions:read');
		expect(result).toEqual({
			ok: false,
			status: 401,
			code: 'malformed_header',
			message: expect.any(String)
		});
	});

	it('passes the required scope as a permissions record to verifyApiKey', async () => {
		mockVerifyApiKey.mockResolvedValue({
			valid: true,
			error: null,
			key: { id: 'key1', referenceId: 'user1' }
		});

		await requireApiKey(request({ authorization: 'Bearer sk_test_123' }), 'transactions:write');

		expect(mockVerifyApiKey).toHaveBeenCalledWith({
			body: { key: 'sk_test_123', permissions: { transactions: ['write'] } }
		});
	});

	it('returns the api key id and user id on success', async () => {
		mockVerifyApiKey.mockResolvedValue({
			valid: true,
			error: null,
			key: { id: 'key1', referenceId: 'user1' }
		});

		const result = await requireApiKey(
			request({ authorization: 'Bearer sk_test_123' }),
			'dashboard:read'
		);

		expect(result).toEqual({ ok: true, apiKeyId: 'key1', userId: 'user1' });
	});

	it('maps an invalid key (or insufficient scope) to a generic 401', async () => {
		mockVerifyApiKey.mockResolvedValue({
			valid: false,
			error: { message: 'not found', code: 'KEY_NOT_FOUND' },
			key: null
		});

		const result = await requireApiKey(
			request({ authorization: 'Bearer sk_test_123' }),
			'transactions:write'
		);

		expect(result).toEqual({
			ok: false,
			status: 401,
			code: 'invalid_api_key',
			message: expect.any(String)
		});
	});

	it('maps a rate-limited key to 429', async () => {
		mockVerifyApiKey.mockResolvedValue({
			valid: false,
			error: { message: 'rate limited', code: 'RATE_LIMITED' },
			key: null
		});

		const result = await requireApiKey(
			request({ authorization: 'Bearer sk_test_123' }),
			'transactions:read'
		);

		expect(result).toEqual({
			ok: false,
			status: 429,
			code: 'rate_limited',
			message: expect.any(String)
		});
	});

	it('maps a quota-exhausted key to 429', async () => {
		mockVerifyApiKey.mockResolvedValue({
			valid: false,
			error: { message: 'usage exceeded', code: 'USAGE_EXCEEDED' },
			key: null
		});

		const result = await requireApiKey(
			request({ authorization: 'Bearer sk_test_123' }),
			'transactions:read'
		);

		expect(result.ok).toBe(false);
		expect((result as { status: number }).status).toBe(429);
	});

	it('never logs the raw key value on failure', async () => {
		mockVerifyApiKey.mockResolvedValue({
			valid: false,
			error: { message: 'invalid', code: 'INVALID_API_KEY' },
			key: null
		});

		await requireApiKey(
			request({ authorization: 'Bearer sk_test_super_secret' }),
			'transactions:read'
		);

		for (const call of mockLoggerWarn.mock.calls) {
			expect(JSON.stringify(call)).not.toContain('sk_test_super_secret');
		}
	});

	describe('key owner checks', () => {
		function validKeyFor(ownerId: string) {
			mockVerifyApiKey.mockResolvedValue({
				valid: true,
				error: null,
				key: { id: 'key1', referenceId: ownerId }
			});
		}

		async function call() {
			return requireApiKey(request({ authorization: 'Bearer sk_test_123' }), 'transactions:read');
		}

		const invalidKey = {
			ok: false,
			status: 401,
			code: 'invalid_api_key',
			message: 'Invalid API key.'
		};

		it('looks up the key owner by the key reference id', async () => {
			validKeyFor('user1');
			await call();
			expect(mockFindUserById).toHaveBeenCalledWith('user1');
		});

		it('rejects a key whose owner was removed from ALLOWED_EMAILS', async () => {
			validKeyFor('user1');
			mockFindUserById.mockResolvedValue({ ...activeAdmin, email: 'removed@example.com' });

			expect(await call()).toEqual(invalidKey);
			expect(mockLoggerWarn).toHaveBeenCalledWith(
				'API key auth failed',
				expect.objectContaining({ reason: 'owner_not_allowed', apiKeyId: 'key1' })
			);
		});

		it('rejects a key whose owner is banned', async () => {
			validKeyFor('user1');
			mockFindUserById.mockResolvedValue({ ...activeAdmin, banned: true });

			expect(await call()).toEqual(invalidKey);
			expect(mockLoggerWarn).toHaveBeenCalledWith(
				'API key auth failed',
				expect.objectContaining({ reason: 'owner_banned', apiKeyId: 'key1' })
			);
		});

		it('rejects a key whose owner has a ban that has not yet expired', async () => {
			validKeyFor('user1');
			mockFindUserById.mockResolvedValue({
				...activeAdmin,
				banned: true,
				banExpires: new Date(Date.now() + 60_000)
			});

			expect(await call()).toEqual(invalidKey);
		});

		it('accepts a key whose owner had a ban that has since expired', async () => {
			validKeyFor('user1');
			mockFindUserById.mockResolvedValue({
				...activeAdmin,
				banned: true,
				banExpires: new Date(Date.now() - 60_000)
			});

			expect(await call()).toEqual({ ok: true, apiKeyId: 'key1', userId: 'user1' });
		});

		it('rejects a key whose owner was demoted to a plain user', async () => {
			validKeyFor('user1');
			mockFindUserById.mockResolvedValue({ ...activeAdmin, role: 'user' });

			expect(await call()).toEqual(invalidKey);
			expect(mockLoggerWarn).toHaveBeenCalledWith(
				'API key auth failed',
				expect.objectContaining({ reason: 'owner_not_admin' })
			);
		});

		it('accepts a key whose owner is an ADMIN_USER_IDS admin even with role user', async () => {
			validKeyFor('env-admin');
			mockFindUserById.mockResolvedValue({ ...activeAdmin, id: 'env-admin', role: 'user' });

			expect(await call()).toEqual({ ok: true, apiKeyId: 'key1', userId: 'env-admin' });
		});

		it('rejects a key whose owner no longer exists', async () => {
			validKeyFor('user1');
			mockFindUserById.mockResolvedValue(undefined);

			expect(await call()).toEqual(invalidKey);
			expect(mockLoggerWarn).toHaveBeenCalledWith(
				'API key auth failed',
				expect.objectContaining({ reason: 'owner_not_found' })
			);
		});

		it('does not look up an owner when the key itself is invalid', async () => {
			mockVerifyApiKey.mockResolvedValue({
				valid: false,
				error: { message: 'not found', code: 'KEY_NOT_FOUND' },
				key: null
			});

			await call();
			expect(mockFindUserById).not.toHaveBeenCalled();
		});
	});
});

describe('getApiKeyOwnerRejection', () => {
	it('checks existence, then ban, then allowlist, then admin', () => {
		const banned = { ...activeAdmin, banned: true, email: 'removed@example.com', role: 'user' };
		expect(getApiKeyOwnerRejection(undefined, allowedEmails, isAdminUser)).toBe('owner_not_found');
		expect(getApiKeyOwnerRejection(banned, allowedEmails, isAdminUser)).toBe('owner_banned');
		expect(
			getApiKeyOwnerRejection(
				{ ...activeAdmin, email: 'removed@example.com', role: 'user' },
				allowedEmails,
				isAdminUser
			)
		).toBe('owner_not_allowed');
		expect(
			getApiKeyOwnerRejection({ ...activeAdmin, role: 'user' }, allowedEmails, isAdminUser)
		).toBe('owner_not_admin');
		expect(getApiKeyOwnerRejection(activeAdmin, allowedEmails, isAdminUser)).toBeNull();
	});

	it('matches allowlisted emails case-insensitively', () => {
		expect(
			getApiKeyOwnerRejection(
				{ ...activeAdmin, email: ' Owner@Example.com ' },
				allowedEmails,
				isAdminUser
			)
		).toBeNull();
	});
});
