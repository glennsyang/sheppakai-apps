import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';

// ─── better-auth tables ─────────────────────────────────────────────────────

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	// Columns for the better-auth `admin` plugin (wired up in src/lib/server/auth/index.ts).
	// `role` / `banned` carry NOT NULL defaults so existing rows backfill
	// cleanly; `ban_reason` / `ban_expires` are written by `auth.api.banUser` and left NULL
	// otherwise. The plugin registers the same fields on its own model — keep the names and
	// types here in sync with node_modules/better-auth/dist/plugins/admin/schema.mjs.
	role: text('role').notNull().default('user'),
	banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
	banReason: text('ban_reason'),
	banExpires: integer('ban_expires', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	// Set by better-auth's admin plugin while an admin is impersonating this session.
	impersonatedBy: text('impersonated_by'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		// Scopes account identity by issuer (e.g. "local:credential"), required by
		// better-auth 1.7+. All accounts here are credential accounts, so the
		// default backfills existing rows correctly with no data migration needed.
		issuer: text('issuer').notNull().default('local:credential'),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('account_issuer_account_id_idx').on(table.issuer, table.accountId)]
);

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
});

// Only used when rateLimit.storage is 'database' (production — see auth/index.ts).
// Shape mirrors better-auth's built-in rateLimit model exactly: id + key/count/
// lastRequest and nothing else. Better-auth populates only these fields on insert,
// so this table must not add extra NOT NULL columns (no created_at/updated_at).
export const rateLimit = sqliteTable('rate_limit', {
	id: text('id').primaryKey(),
	key: text('key').notNull().unique(),
	count: integer('count').notNull(),
	lastRequest: integer('last_request').notNull() // ms epoch; better-auth treats it as a plain number
});

// ─── API keys (/api/v1) ──────────────────────────────────────────────────────

// Mirrors the field set required by the `@better-auth/api-key` plugin's `apikey` model
// (see node_modules/@better-auth/api-key/dist/index.d.mts). Table name and every field
// name below must match the plugin's expectations exactly, since it queries this table
// by these names via the drizzle adapter's schema map in auth/index.ts.
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

// Every /api/v1 write, successful or failed.
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
	user: one(user, { fields: [apiAuditLog.userId], references: [user.id] })
}));

// ─── App tables ──────────────────────────────────────────────────────────────
//
// These rows are shared household data (see CLAUDE.md, "Product Data-Sharing Model").
// `user_id` only records who created the row, so it's nullable with ON DELETE SET NULL:
// removing a member must never cascade-delete pantry items, recipes or plans the other
// member still relies on.

export const pantryItems = sqliteTable('pantry_items', {
	id: text('id').primaryKey(),
	userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
	name: text('name').notNull(),
	quantity: real('quantity'),
	unit: text('unit'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const recipes = sqliteTable('recipes', {
	id: text('id').primaryKey(),
	userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
	name: text('name').notNull(),
	description: text('description').notNull(),
	ingredientsJson: text('ingredients_json').notNull(),
	instructionsJson: text('instructions_json').notNull(),
	prepTimeMinutes: integer('prep_time_minutes').notNull(),
	servings: integer('servings').notNull(),
	source: text('source', { enum: ['ai', 'custom', 'imported'] })
		.notNull()
		.default('ai'),
	// 1–5 stars, null until someone rates it.
	rating: integer('rating'),
	// Where an imported recipe came from; null for everything else.
	sourceUrl: text('source_url'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

// The "cooked it" log: one row per time a recipe was made.
export const recipeCooks = sqliteTable(
	'recipe_cooks',
	{
		id: text('id').primaryKey(),
		recipeId: text('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		cookedOn: text('cooked_on').notNull(),
		notes: text('notes').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [index('recipe_cooks_recipe_id_idx').on(table.recipeId)]
);

// One shared plan per week, one entry per day — enforced by unique indexes so
// concurrent writes can't create duplicates (see services/mealPlan.ts).
export const mealPlans = sqliteTable(
	'meal_plans',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		weekStartDate: text('week_start_date').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('meal_plans_week_start_date_idx').on(table.weekStartDate)]
);

export const mealPlanEntries = sqliteTable(
	'meal_plan_entries',
	{
		id: text('id').primaryKey(),
		mealPlanId: text('meal_plan_id')
			.notNull()
			.references(() => mealPlans.id, { onDelete: 'cascade' }),
		dayOfWeek: integer('day_of_week').notNull(),
		recipeId: text('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('meal_plan_entries_plan_day_idx').on(table.mealPlanId, table.dayOfWeek)]
);
