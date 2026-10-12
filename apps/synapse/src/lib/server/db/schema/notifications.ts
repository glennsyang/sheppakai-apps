import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Email Notifications
 * Tracks sent email notifications to prevent duplicates and enable audit trail
 */
export const emailNotifications = sqliteTable(
	'email_notifications',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		notificationType: text('notification_type').notNull(), // 'workout_reminder' | 'meditation_reminder' | 'visit_warning' | 'daily_agenda_digest'
		entityId: text('entity_id'), // ID of related entity (workout_reminder, meditation_schedule, or person)
		sentAt: integer('sent_at', { mode: 'timestamp' }).notNull(),
		emailSubject: text('email_subject').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		index('email_notifications_lookup_idx').on(
			table.userId,
			table.notificationType,
			table.entityId,
			table.sentAt
		)
	]
);

export const emailNotificationsRelations = relations(emailNotifications, ({ one }) => ({
	user: one(user, {
		fields: [emailNotifications.userId],
		references: [user.id]
	})
}));
