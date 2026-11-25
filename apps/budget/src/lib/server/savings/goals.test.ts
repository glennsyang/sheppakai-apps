import { ApiWriteError } from '@sheppakai/shared/api-write';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Status = 'active' | 'completed' | 'paused' | 'archived';
type GoalRow = { id: string; status: Status; targetAmount: number };

const mocks = vi.hoisted(() => {
	const state = {
		goals: new Map<string, GoalRow>(),
		totals: new Map<string, number>(),
		counts: new Map<string, number>(),
		groupRows: [] as Record<string, unknown>[]
	};
	const goalIdOf = (where: unknown) => (where as { value: string }).value;
	const updateWhere = vi.fn<(where: unknown) => Promise<void>>(async () => undefined);
	const updateSet = vi.fn<(values: Record<string, unknown>) => { where: typeof updateWhere }>(
		() => ({ where: updateWhere })
	);
	const insertValues = vi.fn<(values: Record<string, unknown>) => Promise<void>>(
		async () => undefined
	);
	const deleteWhere = vi.fn<(where: unknown) => Promise<void>>(async () => undefined);
	return {
		state,
		goalIdOf,
		updateWhere,
		updateSet,
		insertValues,
		deleteWhere,
		findAllGoals: vi.fn<() => Promise<unknown[]>>(async () => []),
		findContribution: vi.fn<(id: string) => Promise<{ goalId: string } | undefined>>(async () => ({
			goalId: 'goal-1'
		})),
		createContribution: vi.fn<() => Promise<{ id: string; goal: { status: Status } }>>(
			async () => ({ id: 'c-1', goal: { status: 'active' } })
		),
		updateContribution: vi.fn<() => Promise<void>>(async () => undefined),
		deleteContribution: vi.fn<() => Promise<void>>(async () => undefined)
	};
});

vi.mock('drizzle-orm', () => ({
	eq: (field: unknown, value: unknown) => ({ field, value }),
	inArray: (field: unknown, values: unknown) => ({ field, values }),
	count: () => 'count',
	sum: () => 'sum',
	min: () => 'min',
	sql: () => 'sql'
}));
vi.mock('#lib/server/db/schema/index.js', () => ({
	contribution: { goalId: 'contribution.goalId', amount: 'amount', date: 'date' },
	savingsGoal: { id: 'savingsGoal.id' }
}));
vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => ({
		query: {
			savingsGoal: {
				findFirst: async ({ where }: { where: unknown }) =>
					mocks.state.goals.get(mocks.goalIdOf(where))
			}
		},
		select: (fields: Record<string, unknown>) => ({
			from: () => ({
				where: (where: unknown) => {
					const goalId = mocks.goalIdOf(where);
					const rows =
						'n' in fields
							? [{ n: mocks.state.counts.get(goalId) ?? 0 }]
							: [{ total: mocks.state.totals.get(goalId) ?? null }];
					return Object.assign(Promise.resolve(rows), {
						groupBy: async () => mocks.state.groupRows
					});
				}
			})
		}),
		update: () => ({ set: mocks.updateSet }),
		insert: () => ({ values: mocks.insertValues }),
		delete: () => ({ where: mocks.deleteWhere })
	})
}));
vi.mock('#lib/server/db/queries/index.js', () => ({
	savingsGoalQueries: { findAll: mocks.findAllGoals },
	contributionQueries: { findById: mocks.findContribution }
}));
vi.mock('#lib/server/db/writes/contributions.js', () => ({
	createContribution: mocks.createContribution,
	updateContribution: mocks.updateContribution,
	deleteContribution: mocks.deleteContribution
}));

import {
	addContribution,
	createGoal,
	deleteGoal,
	editContribution,
	goalsWithProgress,
	removeContribution,
	statusForProgress,
	unarchiveGoal,
	updateGoal
} from './goals';

const contributionInput = { amount: 100, date: '2026-11-01' };
const goalInput = { name: 'Trip', targetAmount: 1000, targetDate: '2027-06-01' };

function goal(id: string, status: Status, targetAmount = 1000, total = 0) {
	mocks.state.goals.set(id, { id, status, targetAmount });
	mocks.state.totals.set(id, total);
}

/** The statuses written, in order, as `[goalId, status]`. */
function statusWrites(): [string, unknown][] {
	return mocks.updateSet.mock.calls.map((call, i) => [
		mocks.goalIdOf(mocks.updateWhere.mock.calls[i]?.[0]),
		call[0].status
	]);
}

async function refusal(promise: Promise<unknown>): Promise<ApiWriteError> {
	const error = await promise.then(
		() => undefined,
		(e: unknown) => e
	);
	expect(error).toBeInstanceOf(ApiWriteError);
	return error as ApiWriteError;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findAllGoals.mockResolvedValue([]);
	mocks.createContribution.mockResolvedValue({ id: 'c-1', goal: { status: 'active' } });
	mocks.state.goals.clear();
	mocks.state.totals.clear();
	mocks.state.counts.clear();
	mocks.state.groupRows = [];
});

describe('statusForProgress', () => {
	it.each([
		['active', 500, 'active'],
		['active', 1000, 'completed'],
		['active', 1500, 'completed'],
		['paused', 500, 'paused'],
		['paused', 1000, 'completed'],
		['completed', 500, 'active'],
		['completed', 1000, 'completed'],
		['archived', 500, 'archived'],
		['archived', 1000, 'archived']
	] as const)('%s with %d of 1000 → %s', (status, current, expected) => {
		expect(statusForProgress(status, current, 1000)).toBe(expected);
	});
});

describe('goalsWithProgress', () => {
	it('adds progress and an ETA from the contribution totals', async () => {
		mocks.findAllGoals.mockResolvedValue([
			{ id: 'goal-1', status: 'active', targetAmount: 1000, targetDate: null }
		]);
		mocks.state.groupRows = [
			{ goalId: 'goal-1', total: '400', recentTotal: 400, firstDate: '2026-07-01' }
		];

		const [result] = await goalsWithProgress();

		expect(result.currentAmount).toBe(400);
		expect(result.percentage).toBe(40);
		expect(result.monthlyRate).toBeGreaterThan(0);
		expect(result.etaDate).not.toBeNull();
	});

	it('is empty when there are no goals', async () => {
		expect(await goalsWithProgress()).toEqual([]);
	});
});

describe('addContribution', () => {
	it('refuses an Archived goal with 409', async () => {
		goal('goal-1', 'archived');
		const error = await refusal(addContribution('goal-1', contributionInput, 'user-1'));
		expect(error.status).toBe(409);
		expect(error.code).toBe('conflict');
		expect(mocks.createContribution).not.toHaveBeenCalled();
	});

	it('refuses a missing goal with 404', async () => {
		const error = await refusal(addContribution('nope', contributionInput, 'user-1'));
		expect(error.status).toBe(404);
	});

	it('marks the goal Completed when it reaches the target', async () => {
		goal('goal-1', 'active', 1000, 900);
		mocks.createContribution.mockImplementation(async () => {
			mocks.state.totals.set('goal-1', 1000);
			return { id: 'c-1', goal: { status: 'active' } };
		});

		const created = await addContribution('goal-1', contributionInput, 'user-1');

		expect(statusWrites()).toEqual([['goal-1', 'completed']]);
		expect(created.goal.status).toBe('completed');
	});

	it('accepts a Paused goal and leaves it Paused below target', async () => {
		goal('goal-1', 'paused', 1000, 100);
		await addContribution('goal-1', contributionInput, 'user-1');
		expect(mocks.createContribution).toHaveBeenCalled();
		expect(statusWrites()).toEqual([]);
	});
});

describe('editContribution', () => {
	it('moves a goal back to Active when it drops below target', async () => {
		goal('goal-1', 'completed', 1000, 800);
		await editContribution('c-1', 'goal-1', contributionInput);
		expect(statusWrites()).toEqual([['goal-1', 'active']]);
	});

	it('syncs both goals when the contribution moves', async () => {
		goal('goal-1', 'completed', 1000, 500);
		goal('goal-2', 'active', 1000, 1000);
		await editContribution('c-1', 'goal-2', contributionInput);
		expect(statusWrites()).toEqual([
			['goal-1', 'active'],
			['goal-2', 'completed']
		]);
	});

	it('refuses when either goal is Archived', async () => {
		goal('goal-1', 'active');
		goal('goal-2', 'archived');
		await refusal(editContribution('c-1', 'goal-2', contributionInput));
		expect(mocks.updateContribution).not.toHaveBeenCalled();
	});

	it('refuses a missing contribution with 404', async () => {
		mocks.findContribution.mockResolvedValueOnce(undefined);
		const error = await refusal(editContribution('nope', 'goal-1', contributionInput));
		expect(error.status).toBe(404);
	});
});

describe('removeContribution', () => {
	it('moves a Completed goal back to Active', async () => {
		goal('goal-1', 'completed', 1000, 0);
		await removeContribution('c-1');
		expect(mocks.deleteContribution).toHaveBeenCalledWith('c-1');
		expect(statusWrites()).toEqual([['goal-1', 'active']]);
	});

	it('refuses on an Archived goal', async () => {
		goal('goal-1', 'archived', 1000, 1000);
		await refusal(removeContribution('c-1'));
		expect(mocks.deleteContribution).not.toHaveBeenCalled();
	});
});

describe('createGoal', () => {
	it('starts Active even when Completed is asked for', async () => {
		await createGoal({ ...goalInput, status: 'completed' }, 'user-1');
		expect(mocks.insertValues.mock.calls[0][0]).toMatchObject({
			status: 'active',
			userId: 'user-1'
		});
	});

	it('refuses to create an Archived goal', async () => {
		await refusal(createGoal({ ...goalInput, status: 'archived' }, 'user-1'));
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});
});

describe('updateGoal', () => {
	it('refuses to archive a goal that is not Completed', async () => {
		goal('goal-1', 'active');
		const error = await refusal(updateGoal('goal-1', { ...goalInput, status: 'archived' }));
		expect(error.message).toBe('Only completed goals can be archived.');
		expect(mocks.updateSet).not.toHaveBeenCalled();
	});

	it('archives a Completed goal', async () => {
		goal('goal-1', 'completed', 1000, 1000);
		await updateGoal('goal-1', { ...goalInput, status: 'archived' });
		expect(statusWrites()).toEqual([['goal-1', 'archived']]);
	});

	it('completes a goal whose target is lowered to its progress', async () => {
		goal('goal-1', 'active', 1000, 600);
		await updateGoal('goal-1', { ...goalInput, targetAmount: 500, status: 'active' });
		expect(statusWrites()).toEqual([['goal-1', 'completed']]);
	});
});

describe('deleteGoal', () => {
	it('refuses a goal with contributions', async () => {
		goal('goal-1', 'active');
		mocks.state.counts.set('goal-1', 2);
		const error = await refusal(deleteGoal('goal-1'));
		expect(error.message).toBe('Cannot delete goal. Please delete all 2 contribution(s) first.');
		expect(mocks.deleteWhere).not.toHaveBeenCalled();
	});

	it('deletes a goal with no contributions', async () => {
		goal('goal-1', 'active');
		await deleteGoal('goal-1');
		expect(mocks.deleteWhere).toHaveBeenCalledWith({ field: 'savingsGoal.id', value: 'goal-1' });
	});
});

describe('unarchiveGoal', () => {
	it('restores to Completed when the target is reached', async () => {
		goal('goal-1', 'archived', 1000, 1000);
		await unarchiveGoal('goal-1');
		expect(statusWrites()).toEqual([['goal-1', 'completed']]);
	});

	it('restores to Active below target', async () => {
		goal('goal-1', 'archived', 1000, 200);
		await unarchiveGoal('goal-1');
		expect(statusWrites()).toEqual([['goal-1', 'active']]);
	});
});
