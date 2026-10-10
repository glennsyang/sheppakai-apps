import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import savingsGoal from './savingsGoal';
import user from './user';

const contribution = sqliteTable('contributions', {
	id: text('id').primaryKey().$defaultFn(generateId),
	goalId: text('goal_id')
		.notNull()
		.references(() => savingsGoal.id),
	amount: real('amount').notNull(),
	date: text('date').notNull(),
	description: text('description'),
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

export const contributionRelations = relations(contribution, ({ one }) => ({
	goal: one(savingsGoal, { fields: [contribution.goalId], references: [savingsGoal.id] }),
	user: one(user, { fields: [contribution.userId], references: [user.id] })
}));

export default contribution;
