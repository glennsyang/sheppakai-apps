import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * People
 * People to track visits for
 */
export const people = sqliteTable(
	'people',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		isExempt: integer('is_exempt', { mode: 'boolean' }).notNull().default(false),
		isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
		archivedAt: integer('archived_at', { mode: 'timestamp' }),
		scheduledVisitDate: text('scheduled_visit_date'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('people_user_idx').on(table.userId)]
);

export const peopleRelations = relations(people, ({ one, many }) => ({
	user: one(user, {
		fields: [people.userId],
		references: [user.id]
	}),
	visits: many(visits)
}));

/**
 * Visits
 * Visit records with companions and follow-up tracking
 */
export const visits = sqliteTable(
	'visits',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		personId: text('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		time: text('time'),
		companions: text('companions'), // JSON array of companion names
		notes: text('notes'),
		followUpDate: text('follow_up_date'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		index('visits_person_date_idx').on(table.personId, table.date),
		index('visits_user_date_idx').on(table.userId, table.date)
	]
);

export const visitsRelations = relations(visits, ({ one }) => ({
	person: one(people, {
		fields: [visits.personId],
		references: [people.id]
	}),
	user: one(user, {
		fields: [visits.userId],
		references: [user.id]
	})
}));

/**
 * Visit Status Settings
 * Per-user thresholds for visit status transitions.
 */
export const visitStatusSettings = sqliteTable('visit_status_settings', {
	id: text('id').primaryKey().$defaultFn(generateId),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	recentToOverdueDays: integer('recent_to_overdue_days').notNull(),
	overdueToCriticalDays: integer('overdue_to_critical_days').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const visitStatusSettingsRelations = relations(visitStatusSettings, ({ one }) => ({
	user: one(user, {
		fields: [visitStatusSettings.userId],
		references: [user.id]
	})
}));
