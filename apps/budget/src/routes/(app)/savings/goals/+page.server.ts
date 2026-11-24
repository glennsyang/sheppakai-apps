import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { contributionSchema, savingsGoalSchema } from '#lib/formSchemas/index.js';
import {
	createAction,
	createWriteActions,
	deleteAction,
	updateAction
} from '#lib/server/actions/crud-helpers.js';
import { contributionQueries, savingsGoalQueries } from '#lib/server/db/queries/index.js';
import { savingsGoal } from '#lib/server/db/schema/index.js';
import {
	createContribution,
	deleteContribution,
	updateContribution
} from '#lib/server/db/writes/contributions.js';
import { logger } from '#lib/server/logger.js';
import { formatDateForStorage } from '#lib/utils/dates.js';

import type { Actions, PageServerLoad } from './$types';

const contributionActions = createWriteActions({
	schema: contributionSchema,
	entityName: 'Contribution',
	create: (data, userId) => createContribution(data.goalId, data, userId),
	update: (id, data) => updateContribution(id, data.goalId, data),
	delete: deleteContribution
});

export const load: PageServerLoad = async () => {
	const savingsGoalForm = await superValidate(zod4(savingsGoalSchema));
	const contributionForm = await superValidate(zod4(contributionSchema));

	try {
		const [goals, contributions] = await Promise.all([
			savingsGoalQueries.findAll(),
			contributionQueries.findAll()
		]);

		// Filter out contributions linked to archived goals
		const activeContributions = contributions.filter((c) => c.goal.status !== 'archived');

		// Calculate progress for each goal
		const goalsWithProgress = goals.map((goal) => {
			const goalContributions = contributions.filter((c) => c.goalId === goal.id);
			const currentAmount = goalContributions.reduce((sum, c) => sum + c.amount, 0);
			const percentage = goal.targetAmount > 0 ? (currentAmount / goal.targetAmount) * 100 : 0;

			return {
				...goal,
				currentAmount,
				percentage: Math.min(percentage, 100)
			};
		});

		return {
			goals: goalsWithProgress,
			contributions: activeContributions,
			savingsGoalForm,
			contributionForm
		};
	} catch (error) {
		logger.error('Failed to load savings goals:', error);
		return {
			goals: [],
			contributions: [],
			loadError: 'Failed to load savings goals. Please try refreshing the page.',
			savingsGoalForm,
			contributionForm
		};
	}
};

export const actions = {
	createGoal: createAction({
		schema: savingsGoalSchema,
		table: savingsGoal,
		entityName: 'Savings goal',
		transformCreate: (data, userId) => ({
			name: data.name,
			description: data.description || null,
			targetAmount: data.targetAmount,
			targetDate: data.targetDate ? formatDateForStorage(data.targetDate) : null,
			status: data.status,
			userId
		})
	}),

	updateGoal: updateAction({
		schema: savingsGoalSchema,
		table: savingsGoal,
		entityName: 'Savings goal',
		beforeUpdate: async (id, data) => {
			// Only allow archiving if goal is completed
			if (data.status === 'archived') {
				const currentGoal = await savingsGoalQueries.findById(id, false);

				if (!currentGoal) {
					return { error: 'Goal not found' };
				}

				if (currentGoal.status !== 'completed') {
					return { error: 'Only completed goals can be archived' };
				}
			}
		},
		transformUpdate: (data) => ({
			name: data.name,
			description: data.description || null,
			targetAmount: data.targetAmount,
			targetDate: data.targetDate ? formatDateForStorage(data.targetDate) : null,
			status: data.status || 'active'
		})
	}),

	deleteGoal: deleteAction({
		table: savingsGoal,
		entityName: 'Savings goal',
		beforeDelete: async (id) => {
			// Check if contributions exist for this goal
			const existingContributions = await contributionQueries.findByGoalId(id);

			if (existingContributions.length > 0) {
				return {
					error: `Cannot delete goal. Please delete all ${existingContributions.length} contribution(s) first.`
				};
			}
		}
	}),

	createContribution: contributionActions.create,
	updateContribution: contributionActions.update,
	deleteContribution: contributionActions.delete
} satisfies Actions;
