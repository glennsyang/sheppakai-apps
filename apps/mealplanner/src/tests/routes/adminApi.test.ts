import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listAllWithOwner: vi.fn<() => Promise<unknown[]>>(),
	deleteById: vi.fn<(id: string) => Promise<boolean>>(),
	listApiAuditEntries: vi.fn<() => Promise<unknown[]>>(),
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: '' }));
vi.mock('#lib/server/auth/index.js', () => ({ auth: { api: {} } }));
// The store and the actions' behaviour are tested in @sheppakai/shared/api-key-admin.
vi.mock('#lib/server/api/api-key-store.js', () => ({
	apiKeyStore: { listAllWithOwner: mocks.listAllWithOwner, deleteById: mocks.deleteById }
}));
vi.mock('#lib/server/api/audit-log.js', () => ({
	listApiAuditEntries: mocks.listApiAuditEntries
}));
vi.mock('#lib/server/logger.js', () => ({ logger: mocks.logger }));

import { isHttpError } from '@sveltejs/kit';

import * as apiKeys from '../../routes/(app)/admin/api-keys/+page.server';
import * as apiLogs from '../../routes/(app)/admin/api-logs/+page.server';

const ADMIN = { id: 'admin-1', role: 'admin' };
const PLAIN = { id: 'user-1', role: 'user' };

function loadEvent(user: unknown, path: string) {
	const url = new URL(`https://mealplanner.example.com${path}`);
	return {
		locals: { user },
		request: new Request(url),
		url,
		route: { id: `/(app)${path}` }
	} as never;
}

async function rejection(run: () => unknown) {
	try {
		await run();
	} catch (error) {
		return error;
	}
	return null;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.listAllWithOwner.mockResolvedValue([]);
	mocks.deleteById.mockResolvedValue(true);
	mocks.listApiAuditEntries.mockResolvedValue([]);
});

describe('admin api-keys page', () => {
	it("lists every user's keys with a create form", async () => {
		mocks.listAllWithOwner.mockResolvedValue([{ id: 'k1' }, { id: 'k2' }]);
		const result = (await apiKeys.load(loadEvent(ADMIN, '/admin/api-keys'))) as {
			apiKeys: unknown[];
			createForm: { id: string };
		};
		expect(result.apiKeys).toHaveLength(2);
		expect(result.createForm.id).toBe('createApiKey');
	});

	it('rejects a non-admin before reading keys', async () => {
		const error = await rejection(() => apiKeys.load(loadEvent(PLAIN, '/admin/api-keys')));
		expect(isHttpError(error) && error.status).toBe(403);
		expect(mocks.listAllWithOwner).not.toHaveBeenCalled();
	});

	it('returns a loadError when the store fails', async () => {
		mocks.listAllWithOwner.mockRejectedValue(new Error('db down'));
		const result = await apiKeys.load(loadEvent(ADMIN, '/admin/api-keys'));
		expect(result).toMatchObject({ apiKeys: [], loadError: expect.any(String) });
	});

	it('revokes a key for an admin and refuses a non-admin', async () => {
		const revoke = (user: unknown) =>
			apiKeys.actions.revokeApiKey({
				request: new Request('https://mealplanner.example.com/admin/api-keys?/revokeApiKey', {
					method: 'POST',
					body: new URLSearchParams({ id: 'k1' })
				}),
				locals: { user }
			} as never);

		const denied = (await revoke(PLAIN)) as { status: number };
		expect(denied.status).toBe(403);
		expect(mocks.deleteById).not.toHaveBeenCalled();

		await revoke(ADMIN);
		expect(mocks.deleteById).toHaveBeenCalledWith('k1');
	});
});

describe('admin api-logs page', () => {
	it('loads the audit entries for an admin', async () => {
		mocks.listApiAuditEntries.mockResolvedValue([{ id: 'a1' }]);
		expect(await apiLogs.load(loadEvent(ADMIN, '/admin/api-logs'))).toEqual({
			entries: [{ id: 'a1' }]
		});
	});

	it('rejects a non-admin and reports a load failure', async () => {
		const error = await rejection(() => apiLogs.load(loadEvent(PLAIN, '/admin/api-logs')));
		expect(isHttpError(error) && error.status).toBe(403);

		mocks.listApiAuditEntries.mockRejectedValue(new Error('db down'));
		expect(await apiLogs.load(loadEvent(ADMIN, '/admin/api-logs'))).toMatchObject({
			entries: [],
			loadError: expect.any(String)
		});
	});
});
