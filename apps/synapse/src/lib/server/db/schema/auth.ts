import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { generateId } from '../utils';

// Better-Auth tables (managed by better-auth).
// Reference: https://www.better-auth.com/docs/adapters/drizzle

export const user = sqliteTable('user', {
	id: text('id').primaryKey().$defaultFn(generateId),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	// Fields for the better-auth `admin` plugin (wired up in src/lib/server/auth.ts).
	// `role` / `banned` carry NOT NULL defaults so existing rows backfill cleanly;
	// `banReason` / `banExpires` are written by `auth.api.banUser` and NULL otherwise.
	// Keep names/types in sync with node_modules/better-auth/dist/plugins/admin/schema.mjs.
	role: text('role').notNull().default('user'),
	banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
	banReason: text('banReason'),
	banExpires: integer('banExpires', { mode: 'timestamp' }),
	createdAt: integer('createdAt', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updatedAt', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey().$defaultFn(generateId),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	// Set by better-auth's admin plugin while an admin is impersonating this session.
	impersonatedBy: text('impersonatedBy'),
	createdAt: integer('createdAt', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updatedAt', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}));

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey().$defaultFn(generateId),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accountId: text('accountId').notNull(),
		providerId: text('providerId').notNull(),
		// Scopes account identity by issuer (e.g. "local:credential"), required by
		// better-auth 1.7+. All accounts here are credential accounts, so the
		// default backfills existing rows correctly with no data migration needed.
		issuer: text('issuer').notNull().default('local:credential'),
		accessToken: text('accessToken'),
		refreshToken: text('refreshToken'),
		accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
		refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
		refreshTokenUpdatedAt: integer('refreshTokenUpdatedAt', { mode: 'timestamp' }),
		scope: text('scope'),
		idToken: text('idToken'),
		password: text('password'),
		createdAt: integer('createdAt', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updatedAt', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('account_issuer_accountId_idx').on(table.issuer, table.accountId)]
);

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	})
}));

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey().$defaultFn(generateId),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updatedAt', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
