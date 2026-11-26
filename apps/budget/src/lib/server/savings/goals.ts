import { ApiWriteError } from '@sheppakai/shared/api-write';
import { count, eq, inArray, min, sql, sum } from 'drizzle-orm';

import type { SavingsGoalWithEta } from '#lib';
import { computeGoalEta, getGoalRateWindowStart } from '#lib/server/dashboard/forecast.js';
import { getDb } from '#lib/server/db/index.js';
import { contributionQueries, savingsGoalQueries } from '#lib/server/db/queries/index.js';
import { contribution, savingsGoal } from '#lib/server/db/schema/index.js';
import { withUpdatedAt } from '#lib/server/db/utils.js';
import {
	createContribution,
	deleteContribution,
	updateContribution,
	type ContributionInput
} from '#lib/server/db/writes/contributions.js';
import type { Contribution, SavingsGoalStatus } from '#lib/types.js';
import { formatDateForStorage, getAppTodayDate } from '#lib/utils/dates.js';

/**
 * The Savings Goal module: the one place for Savings Goal progress and the Goal Status rules.
 * The `/savings/goals` page, the dashboard and `/api/v1/savings/goals` all call it (#375).
 *
 * - Completed is automatic: a goal whose Contributions reach its target is Completed, and goes
 *   back to Active when they drop below it. Archived goals are left alone.
 * - Only a Completed goal can be archived.
 * - An Archived goal takes no Contribution writes; a goal with Contributions can't be deleted.
 *
 * Refusals throw `ApiWriteError`, so the API and the form banner answer with the same text.
 */

export type SavingsGoalInput = {
	name: string;
	description?: string;
	targetAmount: number;
	targetDate?: string;
	status?: SavingsGoalStatus;
};

/** The Goal Status a goal should have, given what it asked for and its progress. */
export function statusForProgress(
	status: SavingsGoalStatus,
	currentAmount: number,
	targetAmount: number
): SavingsGoalStatus {
	if (status === 'archived') return 'archived';
	const reached = targetAmount > 0 && currentAmount >= targetAmount;
	if (reached) return 'completed';
	return status === 'paused' ? 'paused' : 'active';
}

/** Every non-archived goal with its progress and projected finish date. */
export async function goalsWithProgress(): Promise<SavingsGoalWithEta[]> {
	const goals = await savingsGoalQueries.findAll();
	const includedGoals = goals.filter((g) => g.status !== 'archived');

	if (includedGoals.length === 0) return [];

	const includedGoalIds = includedGoals.map((g) => g.id);
	const today = getAppTodayDate();
	const rateWindowStart = getGoalRateWindowStart(today);

	const totalsRows = await getDb()
		.select({
			goalId: contribution.goalId,
			total: sum(contribution.amount),
			recentTotal: sql<number>`coalesce(sum(case when date(${contribution.date}) >= date(${rateWindowStart}) then ${contribution.amount} else 0 end), 0)`,
			firstDate: min(contribution.date)
		})
		.from(contribution)
		.where(inArray(contribution.goalId, includedGoalIds))
		.groupBy(contribution.goalId);

	const totalsMap = new Map(totalsRows.map((r) => [r.goalId, r]));

	return includedGoals.map((goal) => {
		const row = totalsMap.get(goal.id);
		const total = Number(row?.total ?? 0);
		const percentage = goal.targetAmount > 0 ? (total / goal.targetAmount) * 100 : 0;
		const eta = computeGoalEta({
			status: goal.status,
			currentAmount: total,
			targetAmount: goal.targetAmount,
			targetDate: goal.targetDate,
			recentContributions: Number(row?.recentTotal ?? 0),
			firstContributionDate: row?.firstDate ?? null,
			today
		});
		return { ...goal, currentAmount: total, percentage: Math.min(percentage, 100), ...eta };
	});
}

async function findGoal(goalId: string) {
	const goal = await getDb().query.savingsGoal.findFirst({
		where: eq(savingsGoal.id, goalId),
		columns: { id: true, status: true, targetAmount: true }
	});
	if (!goal) throw new ApiWriteError('not_found', 'Savings goal not found.', 404);
	return goal;
}

async function contributionTotal(goalId: string): Promise<number> {
	const [row] = await getDb()
		.select({ total: sum(contribution.amount) })
		.from(contribution)
		.where(eq(contribution.goalId, goalId));
	return Number(row?.total ?? 0);
}

async function setStatus(goalId: string, status: SavingsGoalStatus): Promise<void> {
	await getDb()
		.update(savingsGoal)
		.set(withUpdatedAt({ status }))
		.where(eq(savingsGoal.id, goalId));
}

/** Brings a goal's status in line with its progress; returns the status it ends with. */
async function syncGoalStatus(goalId: string): Promise<SavingsGoalStatus> {
	const goal = await findGoal(goalId);
	const next = statusForProgress(goal.status, await contributionTotal(goalId), goal.targetAmount);
	if (next !== goal.status) await setStatus(goalId, next);
	return next;
}

function assertArchivable(current: SavingsGoalStatus): void {
	if (current !== 'completed') {
		throw new ApiWriteError('conflict', 'Only completed goals can be archived.', 409);
	}
}

function toGoalRow(input: SavingsGoalInput) {
	return {
		name: input.name,
		description: input.description || null,
		targetAmount: input.targetAmount,
		targetDate: input.targetDate ? formatDateForStorage(input.targetDate) : null
	};
}

export async function createGoal(input: SavingsGoalInput, userId: string): Promise<void> {
	const requested = input.status ?? 'active';
	// A new goal has no progress yet, so it can't start Completed or Archived
	if (requested === 'archived') assertArchivable('active');
	await getDb()
		.insert(savingsGoal)
		.values({
			...toGoalRow(input),
			status: statusForProgress(requested, 0, input.targetAmount),
			userId
		});
}

export async function updateGoal(id: string, input: SavingsGoalInput): Promise<void> {
	const current = await findGoal(id);
	const requested = input.status ?? 'active';
	if (requested === 'archived' && current.status !== 'archived') assertArchivable(current.status);

	const status = statusForProgress(requested, await contributionTotal(id), input.targetAmount);
	await getDb()
		.update(savingsGoal)
		.set(withUpdatedAt({ ...toGoalRow(input), status }))
		.where(eq(savingsGoal.id, id));
}

export async function deleteGoal(id: string): Promise<void> {
	await findGoal(id);
	const [row] = await getDb()
		.select({ n: count() })
		.from(contribution)
		.where(eq(contribution.goalId, id));
	const contributions = Number(row?.n ?? 0);
	if (contributions > 0) {
		throw new ApiWriteError(
			'conflict',
			`Cannot delete goal. Please delete all ${contributions} contribution(s) first.`,
			409
		);
	}
	await getDb().delete(savingsGoal).where(eq(savingsGoal.id, id));
}

/** Returns an Archived goal to everyday views: Completed if its target is reached, else Active. */
export async function unarchiveGoal(id: string): Promise<void> {
	const goal = await findGoal(id);
	await setStatus(id, statusForProgress('active', await contributionTotal(id), goal.targetAmount));
}

/** Refuses a Contribution write to a missing or Archived goal. */
async function assertOpenGoal(goalId: string): Promise<void> {
	const goal = await findGoal(goalId);
	if (goal.status === 'archived') {
		throw new ApiWriteError('conflict', "Archived goals can't take contributions.", 409);
	}
}

async function findContributionGoalId(id: string): Promise<string> {
	const existing = await contributionQueries.findById(id, false);
	if (!existing) throw new ApiWriteError('not_found', 'Contribution not found.', 404);
	return existing.goalId;
}

export async function addContribution(
	goalId: string,
	input: ContributionInput,
	userId: string
): Promise<Contribution> {
	await assertOpenGoal(goalId);
	const created = await createContribution(goalId, input, userId);
	const status = await syncGoalStatus(goalId);
	return { ...created, goal: { ...created.goal, status } };
}

export async function editContribution(
	id: string,
	goalId: string,
	input: ContributionInput
): Promise<void> {
	const previousGoalId = await findContributionGoalId(id);
	const goalIds = [...new Set([previousGoalId, goalId])];
	for (const affected of goalIds) await assertOpenGoal(affected);

	await updateContribution(id, goalId, input);
	for (const affected of goalIds) await syncGoalStatus(affected);
}

export async function removeContribution(id: string): Promise<void> {
	const goalId = await findContributionGoalId(id);
	await assertOpenGoal(goalId);
	await deleteContribution(id);
	await syncGoalStatus(goalId);
}
