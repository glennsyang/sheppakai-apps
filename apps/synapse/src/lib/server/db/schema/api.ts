import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';
import { user } from './auth';

/**
 * API Keys
 * Mirrors the field set required by the `@better-auth/api-key` plugin's `apikey` model.
 * Table name and every field name below must match the plugin's expectations exactly,
 * since it queries this table by these names via the drizzle adapter's schema map in auth.ts.
 */
export const apiKey = sqliteTable('apikey', {
	id: text('id').primaryKey().$defaultFn(generateId),
	configId: text('config_id').notNull().default('default'),
	name: text('name'),
	start: text('start'),
	prefix: text('prefix'),
	key: text('key').notNull().unique(),
	referenceId: text('reference_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	refillInterval: integer('refill_interval'),
	refillAmount: integer('refill_amount'),
	lastRefillAt: integer('last_refill_at', { mode: 'timestamp' }),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' }).notNull().default(true),
	rateLimitTimeWindow: integer('rate_limit_time_window'),
	rateLimitMax: integer('rate_limit_max'),
	requestCount: integer('request_count').notNull().default(0),
	remaining: integer('remaining'),
	lastRequest: integer('last_request', { mode: 'timestamp' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }),
	permissions: text('permissions'),
	metadata: text('metadata'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
	user: one(user, {
		fields: [apiKey.referenceId],
		references: [user.id]
	})
}));

/**
 * Rate limit
 * Only used when rateLimit.storage is 'database' (production — see auth.ts).
 * Shape mirrors better-auth's built-in rateLimit model exactly: id + key/count/
 * lastRequest and nothing else. Better-auth populates only these fields on
 * insert, so this table must not add extra NOT NULL columns (no createdAt/
 * updatedAt, no generated id).
 */
export const rateLimit = sqliteTable('rate_limit', {
	id: text('id').primaryKey(),
	key: text('key').notNull().unique(),
	count: integer('count').notNull(),
	lastRequest: integer('last_request').notNull() // ms epoch; better-auth treats it as a plain number
});

/**
 * API Audit Log
 * Records which API key performed a write and what happened, for traceability of
 * external/programmatic activity against the app's data.
 */
export const apiAuditLog = sqliteTable(
	'api_audit_log',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		// Deliberately no FK to apiKey.id: the audit trail must survive a key being revoked
		// (deleted), which is exactly the moment someone is most likely to want to review it.
		apiKeyId: text('api_key_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		method: text('method').notNull(),
		path: text('path').notNull(),
		action: text('action').notNull(),
		statusCode: integer('status_code').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('api_audit_log_user_created_idx').on(table.userId, table.createdAt)]
);

export const apiAuditLogRelations = relations(apiAuditLog, ({ one }) => ({
	user: one(user, {
		fields: [apiAuditLog.userId],
		references: [user.id]
	})
}));
