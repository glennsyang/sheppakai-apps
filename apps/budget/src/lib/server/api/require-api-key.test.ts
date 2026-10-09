// The check itself is tested in @sheppakai/shared/api-key. This covers the app wiring:
// this app's auth, ALLOWED_EMAILS, ADMIN_USER_IDS and owner lookup.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyApiKey = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const mockFindUserById = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());

vi.mock('../auth', () => ({
	auth: { api: { verifyApiKey: mockVerifyApiKey } },
	allowedEmails: new Set(['owner@example.com'])
}));

vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: 'env-admin' }));

vi.mock('$lib/server/db/queries', () => ({
	userQueries: { findById: mockFindUserById }
}));

vi.mock('$lib/server/logger', () => ({
	logger: {
		warn: vi.fn<(...args: unknown[]) => void>(),
		error: vi.fn<(...args: unknown[]) => void>(),
		info: vi.fn<(...args: unknown[]) => void>(),
		debug: vi.fn<(...args: unknown[]) => void>()
	}
}));

import { requireApiKey } from './require-api-key';

const owner = { id: 'user1', email: 'owner@example.com', role: 'admin', banned: false };
const call = () =>
	requireApiKey(
		new Request('https://example.com/api/v1/transactions', {
			headers: { authorization: 'Bearer sk_test_123' }
		}),
		'transactions:write'
	);

describe('requireApiKey (budget wiring)', () => {
	beforeEach(() => {
		mockVerifyApiKey.mockReset();
		mockVerifyApiKey.mockResolvedValue({
			valid: true,
			error: null,
			key: { id: 'key1', referenceId: 'user1' }
		});
		mockFindUserById.mockReset();
		mockFindUserById.mockResolvedValue(owner);
	});

	it('verifies through this app auth and looks the owner up without relations', async () => {
		expect(await call()).toEqual({ ok: true, apiKeyId: 'key1', userId: 'user1' });
		expect(mockVerifyApiKey).toHaveBeenCalledWith({
			body: { key: 'sk_test_123', permissions: { transactions: ['write'] } }
		});
		expect(mockFindUserById).toHaveBeenCalledWith('user1', false);
	});

	it('accepts an ADMIN_USER_IDS admin and rejects an owner outside ALLOWED_EMAILS', async () => {
		mockFindUserById.mockResolvedValue({ ...owner, id: 'env-admin', role: 'user' });
		expect((await call()).ok).toBe(true);

		mockFindUserById.mockResolvedValue({ ...owner, email: 'removed@example.com' });
		expect(await call()).toMatchObject({ ok: false, status: 401, code: 'invalid_api_key' });
	});
});
