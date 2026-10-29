// Runs the shared API-key store against this app's real schema and migrations through Better
// Auth's drizzle adapter, so the snake_case column mapping is exercised for real.
import { fileURLToPath } from 'node:url';

import { createApiKeyStore } from '@sheppakai/shared/api-key-admin';
import { createApiKeyPlugin } from '@sheppakai/shared/api-key-plugin';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it, vi } from 'vitest';

import * as schema from '../../lib/server/db/schema';

function buildAuth() {
	const db = drizzle(new Database(':memory:'), { schema });
	migrate(db, {
		migrationsFolder: fileURLToPath(new URL('../../lib/server/db/migrations', import.meta.url))
	});
	return betterAuth({
		secret: 'test-secret-that-is-long-enough-for-better-auth',
		baseURL: 'https://app.example.com',
		database: drizzleAdapter(db, {
			provider: 'sqlite',
			schema: {
				user: schema.user,
				session: schema.session,
				account: schema.account,
				verification: schema.verification,
				apikey: schema.apiKey
			}
		}),
		advanced: { database: { generateId: () => crypto.randomUUID() } },
		plugins: [createApiKeyPlugin()]
	});
}

async function seed(auth: ReturnType<typeof buildAuth>, email: string, keyNames: string[]) {
	const { adapter } = await auth.$context;
	const now = new Date();
	const user = await adapter.create<Record<string, unknown>, { id: string }>({
		model: 'user',
		data: { email, name: email, emailVerified: true, createdAt: now, updatedAt: now }
	});
	const keys = [];
	for (const name of keyNames) {
		keys.push(
			await auth.api.createApiKey({
				body: { name, userId: user.id, permissions: { pantry: ['read'] } }
			})
		);
	}
	return { user, keys };
}

describe('shared API-key store on this app schema', () => {
	it('verifies, lists, disables and deletes keys through the drizzle adapter', async () => {
		const auth = buildAuth();
		const ada = await seed(auth, 'ada@example.com', ['ada-1', 'ada-2']);
		await seed(auth, 'bob@example.com', ['bob-1']);
		const store = createApiKeyStore(auth, { warn: vi.fn<() => void>() });

		const verified = await auth.api.verifyApiKey({
			body: { key: ada.keys[0].key, permissions: { pantry: ['read'] } }
		});
		expect(verified.valid).toBe(true);
		const wrongScope = await auth.api.verifyApiKey({
			body: { key: ada.keys[0].key, permissions: { pantry: ['write'] } }
		});
		expect(wrongScope.valid).toBe(false);

		const listed = await store.listAllWithOwner();
		expect(
			listed.map((key) => `${key.name} ${key.ownerEmail}`).sort((a, b) => a.localeCompare(b))
		).toEqual(['ada-1 ada@example.com', 'ada-2 ada@example.com', 'bob-1 bob@example.com']);
		expect(listed[0]).not.toHaveProperty('key');

		expect(await store.disableForUser(ada.user.id)).toBe(2);
		expect(await store.deleteById(ada.keys[0].id)).toBe(true);
		expect(await store.deleteById(ada.keys[0].id)).toBe(false);
		expect(await store.listAllWithOwner()).toHaveLength(2);
	});
});
