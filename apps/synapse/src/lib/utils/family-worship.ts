import { addDaysToDateString, getStartOfWeek } from './date';

/**
 * Family worship happens every Wednesday. A "week" is the Monday–Sunday week (Pacific time,
 * via the date helpers) and is keyed by its Wednesday's YYYY-MM-DD date.
 */
const WEDNESDAY_OFFSET_FROM_MONDAY = 2;

export const DEFAULT_UPCOMING_WEEKS = 8;

export function getWednesdayOf(dateString: string): string {
	return addDaysToDateString(getStartOfWeek(dateString), WEDNESDAY_OFFSET_FROM_MONDAY);
}

/** This week's Wednesday followed by the next `count - 1` Wednesdays. */
export function getUpcomingWeeks(today: string, count = DEFAULT_UPCOMING_WEEKS): string[] {
	const first = getWednesdayOf(today);
	return Array.from({ length: count }, (_, index) => addDaysToDateString(first, index * 7));
}

export interface WorshipTopicSummary {
	id: string;
	title: string;
	isArchived: boolean;
	createdAt: Date;
}

export interface WorshipSessionSummary {
	id: string;
	weekOf: string;
	date: string;
	status: 'done' | 'skipped';
	topicId: string | null;
	notes: string | null;
}

export interface WorshipScheduleSummary {
	weekOf: string;
	topicId: string;
}

export interface TopicStats {
	count: number;
	lastCovered: string | null;
	/** Dates covered, newest first. */
	dates: string[];
}

/** Per-topic count and dates covered, from the 'done' sessions. */
export function buildTopicStats(sessions: WorshipSessionSummary[]): Map<string, TopicStats> {
	const stats = new Map<string, TopicStats>();
	for (const session of sessions) {
		if (session.status !== 'done' || !session.topicId) continue;
		const entry = stats.get(session.topicId) ?? { count: 0, lastCovered: null, dates: [] };
		entry.count += 1;
		entry.dates.push(session.date);
		stats.set(session.topicId, entry);
	}
	for (const entry of stats.values()) {
		entry.dates.sort((a, b) => b.localeCompare(a));
		entry.lastCovered = entry.dates[0] ?? null;
	}
	return stats;
}

/**
 * Rotation order for suggestions: never-covered topics first (oldest first), then the topic
 * covered longest ago.
 */
export function rankTopicsForRotation<T extends WorshipTopicSummary>(
	topics: T[],
	stats: Map<string, TopicStats>
): T[] {
	return topics
		.filter((topic) => !topic.isArchived)
		.sort((a, b) => {
			const lastA = stats.get(a.id)?.lastCovered ?? null;
			const lastB = stats.get(b.id)?.lastCovered ?? null;
			if (lastA !== lastB) {
				if (lastA === null) return -1;
				if (lastB === null) return 1;
				return lastA.localeCompare(lastB);
			}
			return a.createdAt.getTime() - b.createdAt.getTime();
		});
}

export interface TopicRef {
	id: string;
	title: string;
}

export interface WeekPlan {
	weekOf: string;
	/** Topic explicitly scheduled for the week. */
	scheduledTopic: TopicRef | null;
	/** Rotation suggestion, only when nothing is scheduled or logged. */
	suggestedTopic: TopicRef | null;
	session: WorshipSessionSummary | null;
}

/**
 * One row per week. Weeks with neither a schedule row nor a logged session get a suggestion
 * from the rotation, skipping topics already scheduled in the window and cycling when there
 * are more open weeks than topics.
 */
export function buildUpcomingSchedule(
	weeks: string[],
	schedule: WorshipScheduleSummary[],
	sessions: WorshipSessionSummary[],
	topics: WorshipTopicSummary[],
	stats: Map<string, TopicStats>
): WeekPlan[] {
	const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
	const scheduleByWeek = new Map(schedule.map((row) => [row.weekOf, row.topicId]));
	const sessionByWeek = new Map(sessions.map((session) => [session.weekOf, session]));

	const scheduledInWindow = new Set(
		weeks.flatMap((week) => {
			const topicId = scheduleByWeek.get(week);
			return topicId ? [topicId] : [];
		})
	);
	const candidates = rankTopicsForRotation(topics, stats).filter(
		(topic) => !scheduledInWindow.has(topic.id)
	);
	let nextCandidate = 0;

	const toRef = (topicId: string | null | undefined): TopicRef | null => {
		const topic = topicId ? topicsById.get(topicId) : undefined;
		return topic ? { id: topic.id, title: topic.title } : null;
	};

	return weeks.map((weekOf) => {
		const session = sessionByWeek.get(weekOf) ?? null;
		const scheduledTopic = toRef(scheduleByWeek.get(weekOf));
		let suggestedTopic: TopicRef | null = null;

		if (!scheduledTopic && !session && candidates.length > 0) {
			const candidate = candidates[nextCandidate % candidates.length];
			nextCandidate += 1;
			suggestedTopic = { id: candidate.id, title: candidate.title };
		}

		return { weekOf, scheduledTopic, suggestedTopic, session };
	});
}

/** The topic a week will study: the scheduled one, else the suggestion. */
export function plannedTopicOf(week: WeekPlan): TopicRef | null {
	return week.scheduledTopic ?? week.suggestedTopic;
}

export type WeekStatus = 'logged' | 'upcoming' | 'tonight' | 'missed';

/** Where this week stands relative to `today`. */
export function getWeekStatus(week: WeekPlan, today: string): WeekStatus {
	if (week.session) return 'logged';
	if (today < week.weekOf) return 'upcoming';
	if (today === week.weekOf) return 'tonight';
	return 'missed';
}

/** One URL per line; blank lines dropped. */
export function parseLinkLines(value: string | null | undefined): string[] {
	if (!value) return [];
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

/** A topic as the edit dialog needs it. */
export interface TopicEntry {
	id: string;
	title: string;
	description: string | null;
	notes: string | null;
	scriptureRefs: string | null;
	links: string[];
}
