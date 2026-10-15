import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listAllWithOwnerMock, deleteByIdMock, loggerMock } = vi.hoisted(() => ({
	listAllWithOwnerMock: vi.fn<() => Promise<unknown[]>>(),
	deleteByIdMock: vi.fn<(keyId: string) => Promise<boolean>>(),
	loggerMock: {
		error: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		debug: vi.fn<() => void>()
	}
}));

vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: '' }));

vi.mock('#lib/server/auth.js', () => ({ auth: { api: {} } }));

// The store itself (and the actions' behaviour) is tested in @sheppakai/shared/api-key-admin.
vi.mock('#lib/server/api/api-key-store.js', () => ({
	apiKeyStore: { listAllWithOwner: listAllWithOwnerMock, deleteById: deleteByIdMock }
}));

vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));

import { actions, load } from './+page.server';

const adminLocals = { user: { id: 'admin-1', role: 'admin' } } as App.Locals;

// Sentry's Vite plugin auto-wraps `load`, and its wrapper reads `event.request`/`url`/`route`.
function loadEvent(locals: App.Locals) {
	return {
		locals,
		request: new Request('https://budget.example.com/admin/api-keys'),
		url: new URL('https://budget.example.com/admin/api-keys'),
		route: { id: '/(app)/admin/api-keys' }
	} as never;
}

function revokeRequest(id: string) {
	return new Request('https://budget.example.com/admin/api-keys?/revokeApiKey', {
		method: 'POST',
		body: new URLSearchParams({ id })
	});
}

describe('admin api-keys page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listAllWithOwnerMock.mockResolvedValue([]);
		deleteByIdMock.mockResolvedValue(true);
	});

	describe('load', () => {
		it("lists every user's keys, not just the caller's", async () => {
			const keys = [
				{ id: 'k1', ownerId: 'admin-1' },
				{ id: 'k2', ownerId: 'admin-2' }
			];
			listAllWithOwnerMock.mockResolvedValue(keys);

			const result = await load(loadEvent(adminLocals));

			expect(result).toMatchObject({ apiKeys: keys });
		});

		it('refuses a non-admin before querying any keys', async () => {
			await expect(
				load(loadEvent({ user: { id: 'u-1', role: 'user' } } as App.Locals))
			).rejects.toMatchObject({ status: 403 });
			expect(listAllWithOwnerMock).not.toHaveBeenCalled();
		});
	});

	describe('revokeApiKey', () => {
		it('deletes a key by id regardless of who owns it', async () => {
			const result = await actions.revokeApiKey({
				request: revokeRequest('other-admins-key'),
				locals: adminLocals
			} as never);

			expect(deleteByIdMock).toHaveBeenCalledWith('other-admins-key');
			expect(result).toMatchObject({ form: { message: { type: 'success' } } });
		});

		it('returns 404 when the key does not exist', async () => {
			deleteByIdMock.mockResolvedValue(false);

			const result = await actions.revokeApiKey({
				request: revokeRequest('missing'),
				locals: adminLocals
			} as never);

			expect(result).toMatchObject({
				status: 404,
				data: { form: { message: { type: 'error', text: 'API key not found.' } } }
			});
		});

		it('rejects a non-admin caller without deleting anything', async () => {
			const result = await actions.revokeApiKey({
				request: revokeRequest('k1'),
				locals: { user: { id: 'u-1', role: 'user' } } as App.Locals
			} as never);

			expect(deleteByIdMock).not.toHaveBeenCalled();
			expect(result).toMatchObject({ status: 403 });
		});
	});
});
