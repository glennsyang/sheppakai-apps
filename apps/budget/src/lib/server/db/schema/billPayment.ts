import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import recurringBill from './recurringBill';

/**
 * A recurring bill marked paid for one period: `YYYY-MM` for Monthly bills, `YYYY` for Yearly.
 * No row means unpaid, so a new period starts unpaid without a reset job.
 */
const billPayment = sqliteTable(
	'bill_payments',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		recurringBillId: text('recurring_id')
			.notNull()
			.references(() => recurringBill.id, { onDelete: 'cascade' }),
		period: text('period').notNull(),
		paidAt: integer('paid_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('bill_payments_bill_period_idx').on(table.recurringBillId, table.period)]
);

export const billPaymentRelations = relations(billPayment, ({ one }) => ({
	recurringBill: one(recurringBill, {
		fields: [billPayment.recurringBillId],
		references: [recurringBill.id]
	})
}));

export default billPayment;
