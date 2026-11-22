import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import billPayment from './billPayment';
import billPrice from './billPrice';
import user from './user';

/**
 * A recurring bill's identity. `amount` and `cadence` hold the *current* values; the history
 * that dashboard totals read lives in `bill_prices`, and paid state per period lives in
 * `bill_payments`. Write all three through `#lib/server/db/writes/recurring-bills.ts`.
 */
const recurringBill = sqliteTable('recurring_bills', {
	id: text('id').primaryKey().$defaultFn(generateId),
	merchant: text('merchant').notNull(),
	description: text('description').notNull(),
	cadence: text('cadence').$type<'Monthly' | 'Yearly'>().notNull(),
	amount: real('amount').notNull(),
	dueDay: integer('due_day'),
	dueMonth: integer('due_month'),
	/** Soft delete: set when the bill is removed, so past months keep counting it. */
	endedAt: integer('ended_at', { mode: 'timestamp' }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const recurringBillRelations = relations(recurringBill, ({ one, many }) => ({
	user: one(user, { fields: [recurringBill.userId], references: [user.id] }),
	prices: many(billPrice),
	payments: many(billPayment)
}));

export default recurringBill;
