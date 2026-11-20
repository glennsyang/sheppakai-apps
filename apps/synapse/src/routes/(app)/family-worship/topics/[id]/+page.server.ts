import { error, isHttpError } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';

import { getUser } from '#lib/server/actions/auth-guard.js';
import { getDb } from '#lib/server/db/index.js';
import { familyWorshipSessions, familyWorshipTopics } from '#lib/server/db/schema/index.js';
import { stringListSchema, safeParse } from '#lib/server/json.js';
import { logger } from '#lib/server/logger.js';
import { buildTopicStats } from '#lib/utils/family-worship.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const userId = getUser(locals).id;

	try {
		const db = getDb();
		const topic = await db.query.familyWorshipTopics.findFirst({
			where: and(eq(familyWorshipTopics.id, params.id), eq(familyWorshipTopics.userId, userId))
		});
		if (!topic) throw error(404, 'Topic not found');

		const sessions = await db.query.familyWorshipSessions.findMany({
			where: and(
				eq(familyWorshipSessions.topicId, params.id),
				eq(familyWorshipSessions.userId, userId)
			),
			orderBy: [desc(familyWorshipSessions.date)]
		});

		return {
			topic: {
				...topic,
				links: safeParse(topic.links, stringListSchema, [], 'familyWorshipTopic.links')
			},
			sessions,
			stats: buildTopicStats(sessions).get(topic.id) ?? { count: 0, lastCovered: null, dates: [] }
		};
	} catch (err) {
		if (isHttpError(err)) throw err;
		logger.error('Failed to load family worship topic', err, { topicId: params.id, userId });
		throw error(500, 'Failed to load topic');
	}
};
