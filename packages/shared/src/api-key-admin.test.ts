import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApiKeyAdminActions, createApiKeyStore, revokeApiKeySchema } from './api-key-admin';

function buildAuth() {
	const db: Record<string, Record<string, unknown>[]> = {
		user: [],
		session: [],
		account: [],
		verification: [],
		apikey: []
	};
	return betterAuth({
		secret: 'test-secret-that-is-long-enough-for-better-auth',
		baseURL: 'https://app.example.com',
		database: memoryAdapter(db),
		plugins: [apiKey({ references: 'user', storage: 'database', requireName: true })]
	});
}

type Auth = ReturnType<typeof buildAuth>;

const storeLogger = { warn: vi.fn<(message: string, meta?: Record<string, unknown>) => void>() };

async function seedUser(auth: Auth, email: string) {
	const { adapter } = await auth.$context;
	const now = new Date();
	return adapter.create<Record<string, unknown>, { id: string }>({
		model: 'user',
		data: { email, name: email.split('@')[0], emailVerified: true, createdAt: now, updatedAt: now }
	});
}

async function seedKey(auth: Auth, userId: string, name: string) {
	return auth.api.createApiKey({
		body: { name, userId, permissions: { tasks: ['read'] } }
	});
}

describe('createApiKeyStore (against a real Better Auth instance)', () => {
	let auth: Auth;

	beforeEach(() => {
		auth = buildAuth();
	});

	it("lists every user's keys with their owner, without the hashed key", async () => {
		const ada = await seedUser(auth, 'ada@example.com');
		const bob = await seedUser(auth, 'bob@example.com');
		await seedKey(auth, ada.id, 'ada-key');
		await seedKey(auth, bob.id, 'bob-key');

		const keys = await createApiKeyStore(auth, storeLogger).listAllWithOwner();

		expect(
			keys.map((key) => `${key.name} ${key.ownerEmail}`).sort((a, b) => a.localeCompare(b))
		).toEqual(['ada-key ada@example.com', 'bob-key bob@example.com']);
		expect(keys[0].permissions).toEqual({ tasks: ['read'] });
		expect(keys[0]).not.toHaveProperty('key');
		expect(keys[0]).not.toHaveProperty('referenceId');
	});

	it('logs and returns null permissions when the stored JSON is the wrong shape', async () => {
		const ada = await seedUser(auth, 'ada@example.com');
		const created = await seedKey(auth, ada.id, 'ada-key');
		const { adapter } = await auth.$context;
		await adapter.update({
			model: 'apikey',
			where: [{ field: 'id', value: created.id }],
			update: { permissions: '{"tasks":"read"}' }
		});
		const logger = { warn: vi.fn<(message: string, meta?: Record<string, unknown>) => void>() };

		const [key] = await createApiKeyStore(auth, logger).listAllWithOwner();

		expect(key.permissions).toBeNull();
		expect(logger.warn).toHaveBeenCalledWith('API key has unreadable stored permissions', {
			keyId: created.id
		});
	});

	it('deletes any key by id and reports whether one was deleted', async () => {
		const ada = await seedUser(auth, 'ada@example.com');
		const created = await seedKey(auth, ada.id, 'ada-key');
		const store = createApiKeyStore(auth, storeLogger);

		expect(await store.deleteById(created.id)).toBe(true);
		expect(await store.deleteById(created.id)).toBe(false);
		expect(await store.listAllWithOwner()).toEqual([]);
	});

	it("disables only that user's enabled keys", async () => {
		const ada = await seedUser(auth, 'ada@example.com');
		const bob = await seedUser(auth, 'bob@example.com');
		await seedKey(auth, ada.id, 'ada-1');
		await seedKey(auth, ada.id, 'ada-2');
		await seedKey(auth, bob.id, 'bob-1');
		const store = createApiKeyStore(auth, storeLogger);

		expect(await store.disableForUser(ada.id)).toBe(2);
		expect(await store.disableForUser(ada.id)).toBe(0);

		const enabledByName = Object.fromEntries(
			(await store.listAllWithOwner()).map((key) => [key.name, key.enabled])
		);
		expect(enabledByName).toEqual({ 'ada-1': false, 'ada-2': false, 'bob-1': true });
	});
});

describe('createApiKeyAdminActions', () => {
	const createSchema = z.object({
		name: z.string().min(1),
		scopes: z.array(z.enum(['tasks:read', 'tasks:write'])).min(1),
		expiresInDays: z.coerce.number().int().min(1).max(365).optional()
	});
	const logger = { info: vi.fn<() => void>(), error: vi.fn<() => void>() };
	const admin = { id: '', role: 'admin', email: 'admin@example.com', name: 'Admin' };

	function post(fields: [string, string][]) {
		const body = new URLSearchParams(fields);
		return new Request('https://app.example.com/admin', { method: 'POST', body });
	}

	it('creates a key for the admin with mapped permissions and returns the plaintext once', async () => {
		const auth = buildAuth();
		const user = await seedUser(auth, 'admin@example.com');
		const actions = createApiKeyAdminActions({
			auth,
			store: createApiKeyStore(auth, storeLogger),
			isAdminUser: (u) => u.role === 'admin',
			logger,
			createSchema,
			toPermissions: (scopes) => ({ tasks: scopes.map((scope) => scope.split(':')[1]) })
		});

		const result = (await actions.createApiKey({
			request: post([
				['name', 'ci'],
				['scopes', 'tasks:read'],
				['expiresInDays', '30']
			]),
			locals: { user: { ...admin, id: user.id } }
		} as never)) as { apiKey?: string; form: { message: { type: string } } };

		expect(result.apiKey).toEqual(expect.any(String));
		expect(result.form.message.type).toBe('success');
		const [key] = await createApiKeyStore(auth, storeLogger).listAllWithOwner();
		expect(key).toMatchObject({ name: 'ci', ownerId: user.id, permissions: { tasks: ['read'] } });
		expect(key.expiresAt).toBeInstanceOf(Date);
	});

	it('revokes a key, and answers 404 for an unknown one', async () => {
		const auth = buildAuth();
		const user = await seedUser(auth, 'admin@example.com');
		const created = await seedKey(auth, user.id, 'old');
		const actions = createApiKeyAdminActions({
			auth,
			store: createApiKeyStore(auth, storeLogger),
			isAdminUser: (u) => u.role === 'admin',
			logger,
			createSchema,
			toPermissions: () => ({})
		});
		const revoke = (id: string) =>
			actions.revokeApiKey({
				request: post([['id', id]]),
				locals: { user: { ...admin, id: user.id } }
			} as never);

		expect(await revoke(created.id)).toMatchObject({
			form: { message: { type: 'success', text: 'API key revoked.' } }
		});
		expect(await revoke(created.id)).toMatchObject({ status: 404 });
	});

	it('rejects a non-admin with 403', async () => {
		const auth = buildAuth();
		const actions = createApiKeyAdminActions({
			auth,
			store: createApiKeyStore(auth, storeLogger),
			isAdminUser: () => false,
			logger,
			createSchema,
			toPermissions: () => ({})
		});

		const result = await actions.revokeApiKey({
			request: post([['id', 'k1']]),
			locals: { user: { ...admin, role: 'user' } }
		} as never);

		expect(result).toMatchObject({ status: 403 });
	});
});

describe('revokeApiKeySchema', () => {
	it('requires a non-empty id but not a UUID', () => {
		expect(revokeApiKeySchema.safeParse({ id: '' }).success).toBe(false);
		expect(revokeApiKeySchema.safeParse({ id: 'key_abc' }).success).toBe(true);
	});
});
