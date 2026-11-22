import { relations } from 'drizzle-orm';
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import recurringBill from './recurringBill';

/**
 * The amount and cadence a recurring bill had over a run of months. `effectiveFrom` and
 * `effectiveTo` are inclusive `YYYY-MM` keys; `effectiveTo` is null while the price is open.
 */
const billPrice = sqliteTable(
	'bill_prices',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		recurringBillId: text('recurring_id')
			.notNull()
			.references(() => recurringBill.id, { onDelete: 'cascade' }),
		amount: real('amount').notNull(),
		cadence: text('cadence').$type<'Monthly' | 'Yearly'>().notNull(),
		effectiveFrom: text('effective_from').notNull(),
		effectiveTo: text('effective_to')
	},
	(table) => [index('bill_prices_bill_from_idx').on(table.recurringBillId, table.effectiveFrom)]
);

export const billPriceRelations = relations(billPrice, ({ one }) => ({
	recurringBill: one(recurringBill, {
		fields: [billPrice.recurringBillId],
		references: [recurringBill.id]
	})
}));

export default billPrice;
