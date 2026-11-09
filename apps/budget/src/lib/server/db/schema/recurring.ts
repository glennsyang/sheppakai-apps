import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import recurringPayment from './recurringPayment';
import recurringVersion from './recurringVersion';
import user from './user';

/**
 * A recurring bill's identity. `amount` and `cadence` hold the *current* values; the history
 * that dashboard totals read lives in `recurring_version`, and paid state per period lives in
 * `recurring_payment`. Write all three through `#lib/server/db/writes/recurring.ts`.
 */
const recurring = sqliteTable('recurring', {
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

export const recurringRelations = relations(recurring, ({ one, many }) => ({
	user: one(user, { fields: [recurring.userId], references: [user.id] }),
	versions: many(recurringVersion),
	payments: many(recurringPayment)
}));

export default recurring;
