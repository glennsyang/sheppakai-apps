import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => unknown>() }));

import { dashboardGoalSettings } from '#lib/server/db/schema/index.js';

import { upsertUserSettings } from './user-settings';

type Db = Parameters<typeof upsertUserSettings>[3];

function makeDb() {
	const onConflictDoUpdate = vi.fn<(config: unknown) => Promise<void>>(async () => undefined);
	const values = vi.fn<(row: unknown) => unknown>(() => ({ onConflictDoUpdate }));
	const insert = vi.fn<(table: unknown) => unknown>(() => ({ values }));
	return { db: { insert } as unknown as Db, insert, values, onConflictDoUpdate };
}

const goals = { meditationWeeklyGoal: 3, workoutGreenThreshold: 15, workoutAmberThreshold: 10 };

describe('upsertUserSettings', () => {
	it('inserts a full new row for the user', async () => {
		const { db, insert, values } = makeDb();

		await upsertUserSettings(dashboardGoalSettings, 'u1', goals, db);

		expect(insert).toHaveBeenCalledWith(dashboardGoalSettings);
		expect(values).toHaveBeenCalledWith({
			id: expect.any(String),
			userId: 'u1',
			...goals,
			createdAt: expect.any(Date),
			updatedAt: expect.any(Date)
		});
	});

	it('on a userId conflict, updates only the values and updatedAt', async () => {
		const { db, onConflictDoUpdate } = makeDb();

		await upsertUserSettings(dashboardGoalSettings, 'u1', goals, db);

		expect(onConflictDoUpdate).toHaveBeenCalledWith({
			target: dashboardGoalSettings.userId,
			set: { ...goals, updatedAt: expect.any(Date) }
		});
	});
});
