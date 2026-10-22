import type { SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core';

import { getDb } from '#lib/server/db/index.js';
import {
	dailyCalorieTargets,
	dashboardGoalSettings,
	goalWeights,
	visitStatusSettings
} from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';

/** Tables holding exactly one settings row per user (`user_id` is unique). */
type UserSettingsTable =
	| typeof dailyCalorieTargets
	| typeof dashboardGoalSettings
	| typeof goalWeights
	| typeof visitStatusSettings;

type UserSettingsValues<T extends UserSettingsTable> = Omit<
	T['$inferInsert'],
	'id' | 'userId' | 'createdAt' | 'updatedAt'
>;

/**
 * Create-or-replace a user's settings row in one atomic statement. Concurrent saves
 * can't race into the unique `user_id` constraint; on conflict the existing row keeps
 * its `id` and `createdAt`.
 */
export async function upsertUserSettings<T extends UserSettingsTable>(
	table: T,
	userId: string,
	values: UserSettingsValues<T>,
	db = getDb()
): Promise<void> {
	await db
		.insert(table)
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Drizzle can't infer insert types for a generic table; callers are typed via UserSettingsValues<T>
		.values({
			id: generateId(),
			userId,
			...values,
			...withTimestampsForCreate()
		} as T['$inferInsert'])
		.onConflictDoUpdate({
			target: table.userId,
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same generic-table limitation as the insert above
			set: { ...values, ...withTimestampsForUpdate() } as SQLiteUpdateSetSource<T>
		});
}
