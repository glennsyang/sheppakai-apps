import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import recurring from './recurring';

/**
 * A recurring bill marked paid for one period: `YYYY-MM` for Monthly bills, `YYYY` for Yearly.
 * No row means unpaid, so a new period starts unpaid without a reset job.
 */
const recurringPayment = sqliteTable(
	'recurring_payment',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		recurringId: text('recurring_id')
			.notNull()
			.references(() => recurring.id, { onDelete: 'cascade' }),
		period: text('period').notNull(),
		paidAt: integer('paid_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('recurring_payment_recurring_period_idx').on(table.recurringId, table.period)
	]
);

export const recurringPaymentRelations = relations(recurringPayment, ({ one }) => ({
	recurring: one(recurring, {
		fields: [recurringPayment.recurringId],
		references: [recurring.id]
	})
}));

export default recurringPayment;
