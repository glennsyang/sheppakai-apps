import { error, isHttpError } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { updateSessionSchema } from '#lib/schemas/family-worship.js';
import { getUser } from '#lib/server/actions/auth-guard.js';
import { getDb } from '#lib/server/db/index.js';
import { getTopicHistory, getTopicQueue } from '#lib/server/family-worship/family-worship.js';
import { logger } from '#lib/server/logger.js';
import { getTodayString } from '#lib/utils/date.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const userId = getUser(locals).id;
	const editSessionForm = await superValidate(zod4(updateSessionSchema));
	const today = getTodayString();

	try {
		const db = getDb();
		const history = getTopicHistory(db, userId, params.id);
		if (!history) throw error(404, 'Topic not found');

		return {
			today,
			history,
			activeTopics: getTopicQueue(db, userId).map(({ id, title }) => ({ id, title })),
			editSessionForm
		};
	} catch (err) {
		if (isHttpError(err)) throw err;
		logger.error('Failed to load Family Worship topic', err, { userId });
		return {
			today,
			history: null,
			activeTopics: [],
			editSessionForm,
			loadError: 'Failed to load this topic. Please try refreshing the page.'
		};
	}
};
