import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { updateSessionSchema } from '#lib/schemas/family-worship.js';
import { getUser } from '#lib/server/actions/auth-guard.js';
import { getDb } from '#lib/server/db/index.js';
import {
	getArchivedTopics,
	getHistory,
	getTopicQueue
} from '#lib/server/family-worship/family-worship.js';
import { logger } from '#lib/server/logger.js';
import { getTodayString } from '#lib/utils/date.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = getUser(locals).id;
	const topicId = url.searchParams.get('topic') || null;
	const editSessionForm = await superValidate(zod4(updateSessionSchema));
	const today = getTodayString();

	try {
		const db = getDb();
		const activeTopics = getTopicQueue(db, userId).map(({ id, title }) => ({ id, title }));
		const archivedTopics = getArchivedTopics(db, userId).map(({ id, title }) => ({ id, title }));
		return {
			today,
			topicId,
			activeTopics,
			// Every topic can be filtered on, archived ones included: their history is kept.
			filterTopics: [...activeTopics, ...archivedTopics].sort((a, b) =>
				a.title.localeCompare(b.title)
			),
			months: getHistory(db, userId, { topicId: topicId ?? undefined }),
			editSessionForm
		};
	} catch (error) {
		logger.error('Failed to load Family Worship history', error, { userId });
		return {
			today,
			topicId,
			activeTopics: [],
			filterTopics: [],
			months: [],
			editSessionForm,
			loadError: 'Failed to load Family Worship history. Please try refreshing the page.'
		};
	}
};
