import { logger } from '$lib/server/logger';
import type { PantryItem } from '$lib/types';
import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import { pantryItems } from '../db/schema';
import { generateId, withTimestampsForCreate } from '../db/utils';

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

export async function removePantryItem(itemId: string): Promise<void> {
	logger.debug('removePantryItem', { itemId });
	const db = getDb();
	await db.delete(pantryItems).where(eq(pantryItems.id, itemId));
}
