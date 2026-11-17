import { eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';
import { convertQuantity, normalizeIngredientName } from '#lib/shopping.js';
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

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** What `restockPantry` changed, so `undoRestock` can reverse exactly that. */
interface RestockResult {
	pantryItemId: string;
	/** Amount added to an existing item, in that item's unit; `null` when nothing was added. */
	addedQuantity: number | null;
	created: boolean;
}

/**
 * Puts a bought item into the pantry: merges into an item with the same normalized name
 * (adding the amount when both amounts are known and the units convert), otherwise creates
 * one. Must run inside the caller's transaction.
 */
export function restockPantry(
	tx: Tx,
	userId: string,
	item: { name: string; quantity: number | null; unit: string | null },
	now: Date
): RestockResult {
	const key = normalizeIngredientName(item.name);
	const match = tx
		.select()
		.from(pantryItems)
		.all()
		.find((row) => normalizeIngredientName(row.name) === key);

	if (match) {
		const added =
			match.quantity === null || item.quantity === null
				? null
				: convertQuantity(item.quantity, item.unit, match.unit);
		if (added !== null && match.quantity !== null) {
			tx.update(pantryItems)
				.set({ quantity: tidyQuantity(match.quantity + added), ...withTimestampsForUpdate(now) })
				.where(eq(pantryItems.id, match.id))
				.run();
		}
		return { pantryItemId: match.id, addedQuantity: added, created: false };
	}

	const id = generateId();
	tx.insert(pantryItems)
		.values({
			id,
			userId,
			name: item.name,
			quantity: item.quantity,
			unit: item.unit,
			...withTimestampsForCreate(now)
		})
		.run();
	return { pantryItemId: id, addedQuantity: null, created: true };
}

/** Reverses a `restockPantry`. Must run inside the caller's transaction. */
export function undoRestock(tx: Tx, restock: RestockResult, now: Date): void {
	if (restock.created) {
		tx.delete(pantryItems).where(eq(pantryItems.id, restock.pantryItemId)).run();
		return;
	}
	if (restock.addedQuantity === null) return;
	const row = tx.select().from(pantryItems).where(eq(pantryItems.id, restock.pantryItemId)).get();
	if (!row || row.quantity === null) return;
	const left = tidyQuantity(row.quantity - restock.addedQuantity);
	if (left <= 0) {
		tx.delete(pantryItems).where(eq(pantryItems.id, row.id)).run();
		return;
	}
	tx.update(pantryItems)
		.set({ quantity: left, ...withTimestampsForUpdate(now) })
		.where(eq(pantryItems.id, row.id))
		.run();
}

function tidyQuantity(value: number): number {
	return Math.round(value * 100) / 100;
}
