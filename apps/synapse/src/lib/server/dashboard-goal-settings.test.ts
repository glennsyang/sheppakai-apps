import { DEFAULT_DASHBOARD_GOALS } from '$lib/utils/dashboard-goals';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({ getDb: vi.fn<() => unknown>() }));

import { getDashboardGoalsForUser } from './dashboard-goal-settings';

type Db = Parameters<typeof getDashboardGoalsForUser>[1];

function makeDb(row?: Record<string, number>): Db {
	return {
		query: {
			dashboardGoalSettings: {
				findFirst: vi.fn<() => Promise<typeof row>>().mockResolvedValue(row)
			}
		}
	} as unknown as Db;
}

describe('getDashboardGoalsForUser', () => {
	it('returns defaults when the user has no settings row', async () => {
		expect(await getDashboardGoalsForUser('u1', makeDb())).toEqual(DEFAULT_DASHBOARD_GOALS);
	});

	it('returns the stored goals when a row exists', async () => {
		const goals = {
			meditationWeeklyGoal: 3,
			workoutGreenThreshold: 15,
			workoutAmberThreshold: 10
		};
		expect(await getDashboardGoalsForUser('u1', makeDb(goals))).toEqual(goals);
	});
});
