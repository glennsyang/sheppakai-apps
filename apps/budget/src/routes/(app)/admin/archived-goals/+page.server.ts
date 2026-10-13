import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { unArchiveSchema } from '#lib/formSchemas/index.js';
import { adminFormAction } from '#lib/server/actions/admin-guard.js';
import { assertAdmin } from '#lib/server/auth.js';
import { savingsGoalQueries } from '#lib/server/db/queries/index.js';
import { unarchiveSavingsGoal } from '#lib/server/db/writes/savings-goals.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	assertAdmin(locals);

	const form = await superValidate(zod4(unArchiveSchema));

	try {
		const archivedGoals = await savingsGoalQueries.findArchived();

		return {
			archivedGoals,
			form
		};
	} catch (error) {
		logger.error('Failed to load archived goals:', error);
		return {
			archivedGoals: [],
			loadError: 'Failed to load archived goals. Please try refreshing the page.',
			form
		};
	}
};

export const actions = {
	unarchive: adminFormAction(unArchiveSchema, async (_event, form) => {
		try {
			await unarchiveSavingsGoal(form.data.goalId);

			logger.info(`Goal with ID ${form.data.goalId} updated successfully`);
			return message(form, { type: 'success', text: 'Goal unarchived successfully' });
		} catch (error) {
			logger.error('Failed to unarchive goal:', error);
			return message(
				form,
				{
					type: 'error',
					text: 'Failed to unarchive goal'
				},
				{ status: 500 }
			);
		}
	})
} satisfies Actions;
