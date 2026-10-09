// The check itself is tested in @sheppakai/shared/api-key. This covers the app wiring:
// this app's auth, ALLOWED_EMAILS, ADMIN_USER_IDS and owner lookup.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
	verifyApiKey: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
	ownerRows: [] as unknown[],
	where: vi.fn<(...args: unknown[]) => void>()
}));

vi.mock('../auth', () => ({
	auth: { api: { verifyApiKey: mockState.verifyApiKey } },
	allowedEmails: new Set(['owner@example.com'])
}));

vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: 'env-admin' }));

vi.mock('$lib/server/db', () => {
	const chain = {
		select: () => chain,
		from: () => chain,
		where: (...args: unknown[]) => {
			mockState.where(...args);
			return chain;
		},
		limit: async () => mockState.ownerRows
	};
	return { getDb: () => chain };
});

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
		new Request('https://example.com/api/v1/tasks', {
			headers: { authorization: 'Bearer sk_test_123' }
		}),
		'tasks:write'
	);

describe('requireApiKey (synapse wiring)', () => {
	beforeEach(() => {
		mockState.verifyApiKey.mockReset();
		mockState.verifyApiKey.mockResolvedValue({
			valid: true,
			error: null,
			key: { id: 'key1', referenceId: 'user1' }
		});
		mockState.where.mockReset();
		mockState.ownerRows = [owner];
	});

	it('verifies through this app auth and looks the owner up by id', async () => {
		expect(await call()).toEqual({ ok: true, apiKeyId: 'key1', userId: 'user1' });
		expect(mockState.verifyApiKey).toHaveBeenCalledWith({
			body: { key: 'sk_test_123', permissions: { tasks: ['write'] } }
		});
		expect(mockState.where).toHaveBeenCalledTimes(1);
	});

	it('now also requires the owner to be an admin', async () => {
		mockState.ownerRows = [{ ...owner, role: 'user' }];
		expect(await call()).toMatchObject({ ok: false, status: 401, code: 'invalid_api_key' });

		mockState.ownerRows = [{ ...owner, id: 'env-admin', role: 'user' }];
		expect((await call()).ok).toBe(true);
	});

	it('rejects a key whose owner no longer exists', async () => {
		mockState.ownerRows = [];
		expect(await call()).toMatchObject({ ok: false, code: 'invalid_api_key' });
	});
});
