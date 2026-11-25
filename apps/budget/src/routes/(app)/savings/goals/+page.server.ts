import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { contributionSchema, savingsGoalSchema } from '#lib/formSchemas/index.js';
import { createWriteActions } from '#lib/server/actions/crud-helpers.js';
import { contributionQueries } from '#lib/server/db/queries/index.js';
import { logger } from '#lib/server/logger.js';
import {
	addContribution,
	createGoal,
	deleteGoal,
	editContribution,
	goalsWithProgress,
	removeContribution,
	updateGoal
} from '#lib/server/savings/goals.js';

import type { Actions, PageServerLoad } from './$types';

const goalActions = createWriteActions({
	schema: savingsGoalSchema,
	entityName: 'Savings goal',
	create: createGoal,
	update: updateGoal,
	delete: deleteGoal
});

const contributionActions = createWriteActions({
	schema: contributionSchema,
	entityName: 'Contribution',
	create: (data, userId) => addContribution(data.goalId, data, userId),
	update: (id, data) => editContribution(id, data.goalId, data),
	delete: removeContribution
});

export const load: PageServerLoad = async () => {
	const savingsGoalForm = await superValidate(zod4(savingsGoalSchema));
	const contributionForm = await superValidate(zod4(contributionSchema));

	try {
		const [goals, contributions] = await Promise.all([
			goalsWithProgress(),
			contributionQueries.findAll()
		]);

		return {
			goals,
			// Contributions to archived goals stay out of everyday views
			contributions: contributions.filter((c) => c.goal.status !== 'archived'),
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
	createGoal: goalActions.create,
	updateGoal: goalActions.update,
	deleteGoal: goalActions.delete,

	createContribution: contributionActions.create,
	updateContribution: contributionActions.update,
	deleteContribution: contributionActions.delete
} satisfies Actions;
