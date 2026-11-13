import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import user from './user';

// Mirrors the `@better-auth/passkey` plugin's `passkey` model (see
// node_modules/@better-auth/passkey/dist/index.mjs, `const schema`). The plugin queries
// it by these TypeScript field names through the drizzle adapter's schema map in
// auth.ts, so keep them exact. Registering it there is what turns passkeys on.
const passkey = sqliteTable(
	'passkey',
	{
		id: text('id').primaryKey(),
		// Label shown on Profile; the user can rename it.
		name: text('name'),
		publicKey: text('public_key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		credentialID: text('credential_id').notNull().unique(),
		counter: integer('counter').notNull(),
		deviceType: text('device_type').notNull(),
		backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
		transports: text('transports'),
		// Identifies the provider (iCloud Keychain, Google Password Manager, …).
		aaguid: text('aaguid'),
		createdAt: integer('created_at', { mode: 'timestamp' })
	},
	(table) => [index('passkey_user_id_idx').on(table.userId)]
);

export const passkeyRelations = relations(passkey, ({ one }) => ({
	user: one(user, {
		fields: [passkey.userId],
		references: [user.id]
	})
}));

export default passkey;
