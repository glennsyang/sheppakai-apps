import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import user from './user';

const windowCleaningCustomer = sqliteTable('window_cleaning_customers', {
	id: text('id').primaryKey().$defaultFn(generateId),
	name: text('name').notNull(),
	address: text('address').notNull(),
	city: text('city').notNull(),
	unitNumber: text('unit_number'),
	buzzerNumber: text('buzzer_number'),
	phoneNumber: text('phone_number'),
	email: text('email'),
	notes: text('notes'),
	deletedAt: integer('deleted_at', { mode: 'timestamp' }),
	deletedBy: text('deleted_by').references(() => user.id),
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

export const windowCleaningCustomerRelations = relations(windowCleaningCustomer, ({ one }) => ({
	user: one(user, { fields: [windowCleaningCustomer.userId], references: [user.id] })
}));

export default windowCleaningCustomer;
