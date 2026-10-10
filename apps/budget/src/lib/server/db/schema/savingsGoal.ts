import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import user from './user';

const savingsGoalStatusEnum = ['active', 'completed', 'paused', 'archived'] as const;

const savingsGoal = sqliteTable('savings_goals', {
	id: text('id').primaryKey().$defaultFn(generateId),
	name: text('name').notNull(),
	description: text('description'),
	targetAmount: real('target_amount').notNull(),
	targetDate: text('target_date'),
	status: text('status', { enum: savingsGoalStatusEnum }).notNull().default('active'),
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

export const savingsGoalRelations = relations(savingsGoal, ({ one }) => ({
	user: one(user, { fields: [savingsGoal.userId], references: [user.id] })
}));

export default savingsGoal;
