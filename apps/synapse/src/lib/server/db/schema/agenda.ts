import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * Daily Agenda Templates
 * Versioned recurring default agenda items so historical weeks remain accurate when defaults change.
 */
export const dailyAgendaTemplates = sqliteTable(
	'daily_agenda_templates',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		templateGroupId: text('template_group_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		daysOfWeek: text('days_of_week').notNull().default('[0,1,2,3,4,5,6]'),
		startsOn: text('starts_on').notNull(), // YYYY-MM-DD
		endsOn: text('ends_on'), // YYYY-MM-DD
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		index('daily_agenda_templates_user_range_idx').on(table.userId, table.startsOn, table.endsOn),
		index('daily_agenda_templates_group_idx').on(table.templateGroupId)
	]
);

export const dailyAgendaTemplatesRelations = relations(dailyAgendaTemplates, ({ many, one }) => ({
	user: one(user, {
		fields: [dailyAgendaTemplates.userId],
		references: [user.id]
	}),
	entries: many(dailyAgendaEntries)
}));

/**
 * Daily Agenda Entries
 * Per-day agenda items with completion state for default and custom checklist rows.
 */
export const dailyAgendaEntries = sqliteTable(
	'daily_agenda_entries',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		templateId: text('template_id').references(() => dailyAgendaTemplates.id, {
			onDelete: 'set null'
		}),
		templateGroupId: text('template_group_id'),
		date: text('date').notNull(), // YYYY-MM-DD
		title: text('title').notNull(),
		sourceType: text('source_type').notNull().default('default'), // 'default' | 'custom'
		sortOrder: integer('sort_order').notNull().default(0),
		completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
		completedAt: integer('completed_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		index('daily_agenda_entries_user_date_idx').on(table.userId, table.date),
		index('daily_agenda_entries_group_date_idx').on(table.templateGroupId, table.date),
		uniqueIndex('daily_agenda_entries_default_unique_idx').on(
			table.userId,
			table.templateGroupId,
			table.date
		)
	]
);

export const dailyAgendaEntriesRelations = relations(dailyAgendaEntries, ({ one }) => ({
	user: one(user, {
		fields: [dailyAgendaEntries.userId],
		references: [user.id]
	}),
	template: one(dailyAgendaTemplates, {
		fields: [dailyAgendaEntries.templateId],
		references: [dailyAgendaTemplates.id]
	})
}));
