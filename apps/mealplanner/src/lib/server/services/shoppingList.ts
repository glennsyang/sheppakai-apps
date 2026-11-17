// The week's shopping list (#194): regenerated from the plan and pantry on every read,
// keeping manual items and checked state. Ticking an item restocks the pantry.

import { and, eq } from 'drizzle-orm';

import { logger } from '#lib/server/logger.js';
import { AISLES, aisleFor, buildNeeds } from '#lib/shopping.js';
import type { ShoppingListItem } from '#lib/types.js';

import { getDb } from '../db';
import { shoppingListItems } from '../db/schema';
import { generateId, withTimestampsForCreate, withTimestampsForUpdate } from '../db/utils';
import { getMealPlanWithEntries } from './mealPlan';
import { listPantryItems, restockPantry, undoRestock } from './pantry';

type Row = typeof shoppingListItems.$inferSelect;

function rowToItem(row: Row): ShoppingListItem {
	return {
		id: row.id,
		weekStartDate: row.weekStartDate,
		name: row.name,
		quantity: row.quantity,
		unit: row.unit,
		aisle: row.aisle,
		checked: row.checked,
		manual: row.manual
	};
}

function aisleRank(aisle: string): number {
	const index = AISLES.indexOf(aisle as (typeof AISLES)[number]);
	return index === -1 ? AISLES.length : index;
}

function byAisleThenName(a: ShoppingListItem, b: ShoppingListItem): number {
	return aisleRank(a.aisle) - aisleRank(b.aisle) || a.name.localeCompare(b.name);
}

/**
 * Brings the week's generated rows in line with what the plan needs after pantry stock and
 * returns the whole list. Unchecked rows follow the plan; checked rows stay as bought even
 * when the plan or pantry no longer calls for them; manual rows are left alone.
 */
export async function syncShoppingList(
	userId: string | null,
	weekStartDate: string
): Promise<ShoppingListItem[]> {
	const [entries, pantry] = await Promise.all([
		getMealPlanWithEntries(weekStartDate),
		listPantryItems()
	]);
	const needs = buildNeeds(
		entries.map((e) => e.recipe.ingredientsJson),
		pantry
	);
	const now = new Date();

	const rows = getDb().transaction((tx) => {
		const existing = tx
			.select()
			.from(shoppingListItems)
			.where(eq(shoppingListItems.weekStartDate, weekStartDate))
			.all();
		const byKey = new Map(existing.map((row) => [row.itemKey, row]));
		const neededKeys = new Set(needs.map((need) => need.key));

		for (const need of needs) {
			const row = byKey.get(need.key);
			if (!row) {
				tx.insert(shoppingListItems)
					.values({
						id: generateId(),
						userId,
						weekStartDate,
						itemKey: need.key,
						name: need.name,
						quantity: need.quantity,
						unit: need.unit,
						aisle: need.aisle,
						...withTimestampsForCreate(now)
					})
					// Another request synced the same week first; its row is equivalent.
					.onConflictDoNothing({
						target: [shoppingListItems.weekStartDate, shoppingListItems.itemKey]
					})
					.run();
			} else if (
				!row.checked &&
				(row.quantity !== need.quantity || row.unit !== need.unit || row.aisle !== need.aisle)
			) {
				tx.update(shoppingListItems)
					.set({
						quantity: need.quantity,
						unit: need.unit,
						aisle: need.aisle,
						...withTimestampsForUpdate(now)
					})
					.where(eq(shoppingListItems.id, row.id))
					.run();
			}
		}

		for (const row of existing) {
			if (!row.manual && !row.checked && !neededKeys.has(row.itemKey)) {
				tx.delete(shoppingListItems).where(eq(shoppingListItems.id, row.id)).run();
			}
		}

		return tx
			.select()
			.from(shoppingListItems)
			.where(eq(shoppingListItems.weekStartDate, weekStartDate))
			.all();
	});

	logger.debug('syncShoppingList', { weekStartDate, needs: needs.length, rows: rows.length });
	return rows.map(rowToItem).sort(byAisleThenName);
}

export async function addManualItem(
	userId: string,
	weekStartDate: string,
	item: { name: string; quantity: number | null; unit: string | null }
): Promise<ShoppingListItem> {
	logger.debug('addManualItem', { userId, weekStartDate });
	const id = generateId();
	const row = getDb()
		.insert(shoppingListItems)
		.values({
			id,
			userId,
			weekStartDate,
			itemKey: `manual:${id}`,
			name: item.name,
			quantity: item.quantity,
			unit: item.unit,
			aisle: aisleFor(item.name),
			manual: true,
			...withTimestampsForCreate()
		})
		.returning()
		.get();
	return rowToItem(row);
}

/** Removes a manual item (generated items follow the plan). Returns whether one was deleted. */
export async function removeManualItem(id: string): Promise<boolean> {
	logger.debug('removeManualItem', { id });
	const deleted = getDb()
		.delete(shoppingListItems)
		.where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.manual, true)))
		.returning({ id: shoppingListItems.id })
		.all();
	return deleted.length > 0;
}

/**
 * Ticks or un-ticks an item. Ticking restocks the pantry; un-ticking undoes that restock.
 * Returns `false` when the item doesn't exist.
 */
export async function setShoppingItemChecked(
	userId: string,
	id: string,
	checked: boolean
): Promise<boolean> {
	logger.debug('setShoppingItemChecked', { userId, id, checked });
	const now = new Date();
	return getDb().transaction((tx) => {
		const row = tx.select().from(shoppingListItems).where(eq(shoppingListItems.id, id)).get();
		if (!row) return false;
		if (row.checked === checked) return true;

		if (checked) {
			const restock = restockPantry(tx, userId, row, now);
			tx.update(shoppingListItems)
				.set({
					checked: true,
					pantryItemId: restock.pantryItemId,
					pantryAddedQuantity: restock.addedQuantity,
					pantryCreated: restock.created,
					...withTimestampsForUpdate(now)
				})
				.where(eq(shoppingListItems.id, id))
				.run();
			return true;
		}

		if (row.pantryItemId) {
			undoRestock(
				tx,
				{
					pantryItemId: row.pantryItemId,
					addedQuantity: row.pantryAddedQuantity,
					created: row.pantryCreated
				},
				now
			);
		}
		tx.update(shoppingListItems)
			.set({
				checked: false,
				pantryItemId: null,
				pantryAddedQuantity: null,
				pantryCreated: false,
				...withTimestampsForUpdate(now)
			})
			.where(eq(shoppingListItems.id, id))
			.run();
		return true;
	});
}
