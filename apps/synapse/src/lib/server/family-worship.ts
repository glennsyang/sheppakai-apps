import { and, desc, eq, gte } from 'drizzle-orm';

import type { getDb } from '#lib/server/db/index.js';
import {
	familyWorshipSchedule,
	familyWorshipSessions,
	familyWorshipTopics
} from '#lib/server/db/schema/index.js';
import { stringListSchema, safeParse } from '#lib/server/json.js';
import {
	buildTopicStats,
	buildUpcomingSchedule,
	DEFAULT_UPCOMING_WEEKS,
	getUpcomingWeeks,
	type TopicStats,
	type WeekPlan
} from '#lib/utils/family-worship.js';

type Db = ReturnType<typeof getDb>;

export interface FamilyWorshipTopic {
	id: string;
	title: string;
	description: string | null;
	notes: string | null;
	scriptureRefs: string | null;
	links: string[];
	isArchived: boolean;
	archivedAt: Date | null;
	createdAt: Date;
	stats: TopicStats;
}

const EMPTY_STATS: TopicStats = { count: 0, lastCovered: null, dates: [] };

/**
 * Everything the Family Worship page, the dashboard card, the schedule API and the Wednesday
 * reminder need: topics with their history stats, every session (newest first) and the
 * upcoming weeks with schedule rows and rotation suggestions filled in.
 */
export async function loadFamilyWorship(
	db: Db,
	userId: string,
	today: string,
	weekCount = DEFAULT_UPCOMING_WEEKS
): Promise<{
	topics: FamilyWorshipTopic[];
	sessions: (typeof familyWorshipSessions.$inferSelect)[];
	upcoming: WeekPlan[];
}> {
	const weeks = getUpcomingWeeks(today, weekCount);

	const [topicRows, sessions, scheduleRows] = await Promise.all([
		db.query.familyWorshipTopics.findMany({
			where: eq(familyWorshipTopics.userId, userId),
			orderBy: [familyWorshipTopics.title]
		}),
		db.query.familyWorshipSessions.findMany({
			where: eq(familyWorshipSessions.userId, userId),
			orderBy: [desc(familyWorshipSessions.weekOf)]
		}),
		db.query.familyWorshipSchedule.findMany({
			where: and(
				eq(familyWorshipSchedule.userId, userId),
				gte(familyWorshipSchedule.weekOf, weeks[0])
			)
		})
	]);

	const stats = buildTopicStats(sessions);
	const upcoming = buildUpcomingSchedule(weeks, scheduleRows, sessions, topicRows, stats);

	const topics = topicRows.map((topic) => ({
		id: topic.id,
		title: topic.title,
		description: topic.description,
		notes: topic.notes,
		scriptureRefs: topic.scriptureRefs,
		links: safeParse(topic.links, stringListSchema, [], 'familyWorshipTopic.links'),
		isArchived: topic.isArchived,
		archivedAt: topic.archivedAt,
		createdAt: topic.createdAt,
		stats: stats.get(topic.id) ?? EMPTY_STATS
	}));

	return { topics, sessions, upcoming };
}
