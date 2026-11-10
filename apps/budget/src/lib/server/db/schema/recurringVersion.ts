import { relations } from 'drizzle-orm';
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import recurring from './recurring';

/**
 * The amount and cadence a recurring bill had over a run of months. `effectiveFrom` and
 * `effectiveTo` are inclusive `YYYY-MM` keys; `effectiveTo` is null while the version is open.
 */
const recurringVersion = sqliteTable(
	'recurring_version',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		recurringId: text('recurring_id')
			.notNull()
			.references(() => recurring.id, { onDelete: 'cascade' }),
		amount: real('amount').notNull(),
		cadence: text('cadence').$type<'Monthly' | 'Yearly'>().notNull(),
		effectiveFrom: text('effective_from').notNull(),
		effectiveTo: text('effective_to')
	},
	(table) => [
		index('recurring_version_recurring_from_idx').on(table.recurringId, table.effectiveFrom)
	]
);

export const recurringVersionRelations = relations(recurringVersion, ({ one }) => ({
	recurring: one(recurring, {
		fields: [recurringVersion.recurringId],
		references: [recurring.id]
	})
}));

export default recurringVersion;
