import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/server/db/index', () => ({ db: {} }));
vi.mock('../../lib/server/logger', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '../../lib/server/db/schema';

// Built from the real migrations, so the test schema can't drift from production.
function makeDb() {
	const db = drizzle(new Database(':memory:'), { schema });
	migrate(db, {
		migrationsFolder: fileURLToPath(new URL('../../lib/server/db/migrations', import.meta.url))
	});
	return db;
}

describe('pantry operations (in-memory SQLite)', () => {
	const db = makeDb();
	const userId = 'test-user-1';
	const otherUserId = 'other-user';

	beforeEach(() => {
		const now = new Date();
		// Clear all pantry items (shared data model — no per-user filtering)
		db.delete(schema.pantryItems).run();
		// pantry_items.user_id references user.id, so both owners must exist.
		db.insert(schema.user)
			.values(
				[userId, otherUserId].map((id) => ({
					id,
					name: id,
					email: `${id}@test.com`,
					emailVerified: false,
					createdAt: now,
					updatedAt: now
				}))
			)
			.onConflictDoNothing()
			.run();
	});

	it('inserts and retrieves a pantry item', () => {
		const now = new Date();
		const id = randomUUID();
		db.insert(schema.pantryItems)
			.values({
				id,
				userId,
				name: 'Tomatoes',
				quantity: 3,
				unit: 'pieces',
				createdAt: now,
				updatedAt: now
			})
			.run();

		const items = db.select().from(schema.pantryItems).all();
		expect(items).toHaveLength(1);
		expect(items[0].name).toBe('Tomatoes');
		expect(items[0].quantity).toBe(3);
	});

	it('deletes a pantry item by id regardless of owner', () => {
		const now = new Date();
		const id = randomUUID();
		db.insert(schema.pantryItems)
			.values({
				id,
				userId: otherUserId,
				name: 'Garlic',
				quantity: null,
				unit: null,
				createdAt: now,
				updatedAt: now
			})
			.run();

		// Any user can delete any item by id in the shared model
		db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, id)).run();

		const items = db.select().from(schema.pantryItems).all();
		expect(items).toHaveLength(0);
	});

	it('lists items from all users', () => {
		const now = new Date();
		db.insert(schema.pantryItems)
			.values({
				id: randomUUID(),
				userId,
				name: 'Onion',
				quantity: null,
				unit: null,
				createdAt: now,
				updatedAt: now
			})
			.run();
		db.insert(schema.pantryItems)
			.values({
				id: randomUUID(),
				userId: otherUserId,
				name: 'Garlic',
				quantity: null,
				unit: null,
				createdAt: now,
				updatedAt: now
			})
			.run();

		const items = db.select().from(schema.pantryItems).all();
		expect(items).toHaveLength(2);
	});
});
