// The check itself is tested in @sheppakai/shared/api-key. This covers the app wiring:
// this app's auth, ALLOWED_EMAILS, ADMIN_USER_IDS and owner lookup.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyApiKey = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const mockOwner = vi.hoisted(() => vi.fn<() => unknown>());

vi.mock('#lib/server/auth/index.js', () => ({
	auth: { api: { verifyApiKey: mockVerifyApiKey } },
	allowedEmails: new Set(['owner@example.com'])
}));
vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: 'env-admin' }));
vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ get: mockOwner }) }) }) })
}));
vi.mock('#lib/server/logger.js', () => ({
	logger: {
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		debug: vi.fn<() => void>()
	}
}));

import { requireApiKey } from '#lib/server/api/require-api-key.js';

const owner = { id: 'user1', email: 'owner@example.com', role: 'admin', banned: false };
const call = () =>
	requireApiKey(
		new Request('https://example.com/api/v1/pantry', {
			headers: { authorization: 'Bearer sk_test_123' }
		}),
		'pantry:write'
	);

describe('requireApiKey (mealplanner wiring)', () => {
	beforeEach(() => {
		mockVerifyApiKey.mockReset();
		mockVerifyApiKey.mockResolvedValue({
			valid: true,
			error: null,
			key: { id: 'key1', referenceId: 'user1' }
		});
		mockOwner.mockReset();
		mockOwner.mockReturnValue(owner);
	});

	it('verifies the scope through this app auth', async () => {
		expect(await call()).toEqual({ ok: true, apiKeyId: 'key1', userId: 'user1' });
		expect(mockVerifyApiKey).toHaveBeenCalledWith({
			body: { key: 'sk_test_123', permissions: { pantry: ['write'] } }
		});
	});

	it('accepts an ADMIN_USER_IDS admin and rejects an owner outside ALLOWED_EMAILS or missing', async () => {
		mockOwner.mockReturnValue({ ...owner, id: 'env-admin', role: 'user' });
		expect((await call()).ok).toBe(true);

		mockOwner.mockReturnValue({ ...owner, email: 'removed@example.com' });
		expect(await call()).toMatchObject({ ok: false, status: 401, code: 'invalid_api_key' });

		mockOwner.mockReturnValue(undefined);
		expect(await call()).toMatchObject({ ok: false, status: 401, code: 'invalid_api_key' });
	});
});
