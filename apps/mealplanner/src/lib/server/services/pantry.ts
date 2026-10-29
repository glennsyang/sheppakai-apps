import { eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';
import type { PantryItem } from '#lib/types.js';

import { getDb } from '../db';
import { pantryItems } from '../db/schema';
import { generateId, withTimestampsForCreate, withTimestampsForUpdate } from '../db/utils';

function rowToItem(row: typeof pantryItems.$inferSelect): PantryItem {
	return {
		id: row.id,
		userId: row.userId,
		name: row.name,
		quantity: row.quantity,
		unit: row.unit,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

export async function listPantryItems(): Promise<PantryItem[]> {
	logger.debug('listPantryItems');
	const db = getDb();
	const rows = db.select().from(pantryItems).all();
	return rows.map(rowToItem);
}

export async function addPantryItem(
	userId: string,
	name: string,
	quantity?: number | null,
	unit?: string | null
): Promise<PantryItem> {
	logger.debug('addPantryItem', { userId, name });
	const id = generateId();
	const db = getDb();
	await db.insert(pantryItems).values({
		id,
		userId,
		name,
		quantity: quantity ?? null,
		unit: unit ?? null,
		...withTimestampsForCreate()
	});
	const [row] = db.select().from(pantryItems).where(eq(pantryItems.id, id)).all();
	return rowToItem(row);
}

export async function getPantryItem(itemId: string): Promise<PantryItem | null> {
	const row = getDb().select().from(pantryItems).where(eq(pantryItems.id, itemId)).get();
	return row ? rowToItem(row) : null;
}

/** Updates only the given fields. Returns `null` when the item doesn't exist. */
export async function updatePantryItem(
	itemId: string,
	patch: { name?: string; quantity?: number | null; unit?: string | null }
): Promise<PantryItem | null> {
	logger.debug('updatePantryItem', { itemId });
	const row = getDb()
		.update(pantryItems)
		.set({ ...patch, ...withTimestampsForUpdate() })
		.where(eq(pantryItems.id, itemId))
		.returning()
		.get();
	return row ? rowToItem(row) : null;
}

/** Returns whether a row was deleted. */
export async function removePantryItem(itemId: string): Promise<boolean> {
	logger.debug('removePantryItem', { itemId });
	const db = getDb();
	const deleted = db
		.delete(pantryItems)
		.where(eq(pantryItems.id, itemId))
		.returning({ id: pantryItems.id })
		.all();
	return deleted.length > 0;
}
