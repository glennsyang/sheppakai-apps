import { ApiWriteError } from '@sheppakai/shared/api-write';
import { and, eq, ne } from 'drizzle-orm';

import { getDb } from '#lib/server/db/index.js';
import {
	familyWorshipSchedule,
	familyWorshipSessions,
	familyWorshipTopics
} from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';
import { addDaysToDateString } from '#lib/utils/date.js';
import { getWednesdayOf } from '#lib/utils/family-worship.js';

/**
 * Family worship writes, shared by the /family-worship form actions and the /api/v1 routes.
 * Every write is scoped to `userId`; expected failures throw `ApiWriteError` so both callers
 * can map them to a 404 / 409 instead of a generic 500.
 */

export interface TopicInput {
	title: string;
	description?: string | null;
	notes?: string | null;
	scriptureRefs?: string | null;
	links?: string[] | null;
}

export interface SessionInput {
	date: string;
	status: 'done' | 'skipped';
	topicId?: string | null;
	notes?: string | null;
	continueNextWeek?: boolean;
}

type SessionUpdate = Partial<Omit<SessionInput, 'continueNextWeek'>>;

const blankToNull = (value: string | null | undefined) =>
	value === undefined ? undefined : value?.trim() ? value.trim() : null;

const linksToJson = (links: string[] | null | undefined) =>
	links === undefined ? undefined : links && links.length > 0 ? JSON.stringify(links) : null;

function topicNotFound(): never {
	throw new ApiWriteError('not_found', 'Topic not found.', 404);
}

async function getOwnedTopic(userId: string, topicId: string) {
	const topic = await getDb().query.familyWorshipTopics.findFirst({
		where: and(eq(familyWorshipTopics.id, topicId), eq(familyWorshipTopics.userId, userId))
	});
	return topic ?? topicNotFound();
}

export async function createTopic(userId: string, input: TopicInput) {
	const id = generateId();
	await getDb()
		.insert(familyWorshipTopics)
		.values({
			id,
			userId,
			title: input.title.trim(),
			description: blankToNull(input.description) ?? null,
			notes: blankToNull(input.notes) ?? null,
			scriptureRefs: blankToNull(input.scriptureRefs) ?? null,
			links: linksToJson(input.links) ?? null,
			...withTimestampsForCreate()
		});
	return getOwnedTopic(userId, id);
}

export async function updateTopic(userId: string, topicId: string, input: Partial<TopicInput>) {
	await getOwnedTopic(userId, topicId);
	await getDb()
		.update(familyWorshipTopics)
		.set({
			title: input.title?.trim(),
			description: blankToNull(input.description),
			notes: blankToNull(input.notes),
			scriptureRefs: blankToNull(input.scriptureRefs),
			links: linksToJson(input.links),
			...withTimestampsForUpdate()
		})
		.where(and(eq(familyWorshipTopics.id, topicId), eq(familyWorshipTopics.userId, userId)));
	return getOwnedTopic(userId, topicId);
}

/** Archive hides a topic from scheduling and suggestions; history stays. */
export async function setTopicArchived(userId: string, topicId: string, archived: boolean) {
	await getOwnedTopic(userId, topicId);
	const now = new Date();
	await getDb()
		.update(familyWorshipTopics)
		.set({
			isArchived: archived,
			archivedAt: archived ? now : null,
			...withTimestampsForUpdate(now)
		})
		.where(and(eq(familyWorshipTopics.id, topicId), eq(familyWorshipTopics.userId, userId)));
}

/** Deleting a topic removes its schedule rows and sessions too (FK cascade). */
export async function deleteTopic(userId: string, topicId: string) {
	const deleted = await getDb()
		.delete(familyWorshipTopics)
		.where(and(eq(familyWorshipTopics.id, topicId), eq(familyWorshipTopics.userId, userId)))
		.returning({ id: familyWorshipTopics.id });
	if (deleted.length === 0) topicNotFound();
}

/** Plan `topicId` for the week of `weekOf`, or clear the week with `null`. */
export async function setWeekTopic(userId: string, weekOf: string, topicId: string | null) {
	const db = getDb();
	const week = getWednesdayOf(weekOf);

	if (!topicId) {
		await db
			.delete(familyWorshipSchedule)
			.where(and(eq(familyWorshipSchedule.userId, userId), eq(familyWorshipSchedule.weekOf, week)));
		return;
	}

	const topic = await getOwnedTopic(userId, topicId);
	if (topic.isArchived) {
		throw new ApiWriteError('validation_failed', 'Restore the topic before scheduling it.', 400);
	}

	const now = new Date();
	await db
		.insert(familyWorshipSchedule)
		.values({ id: generateId(), userId, weekOf: week, topicId, ...withTimestampsForCreate(now) })
		.onConflictDoUpdate({
			target: [familyWorshipSchedule.userId, familyWorshipSchedule.weekOf],
			set: { topicId, ...withTimestampsForUpdate(now) }
		});
}

async function assertSessionTopic(
	userId: string,
	status: SessionInput['status'],
	topicId?: string | null
) {
	if (status === 'done' && !topicId) {
		throw new ApiWriteError('validation_failed', 'A done session needs a topic.', 400);
	}
	if (status === 'done' && topicId) await getOwnedTopic(userId, topicId);
}

/**
 * Record what happened in the week containing `date`. Logging the same week again replaces
 * that week's entry. With `continueNextWeek`, the topic is also planned for next Wednesday.
 */
export async function logSession(userId: string, input: SessionInput) {
	await assertSessionTopic(userId, input.status, input.topicId);

	const db = getDb();
	const weekOf = getWednesdayOf(input.date);
	// A skipped week has no topic.
	const topicId = input.status === 'done' ? (input.topicId ?? null) : null;
	const notes = blankToNull(input.notes) ?? null;
	const now = new Date();

	await db
		.insert(familyWorshipSessions)
		.values({
			id: generateId(),
			userId,
			weekOf,
			date: input.date,
			status: input.status,
			topicId,
			notes,
			...withTimestampsForCreate(now)
		})
		.onConflictDoUpdate({
			target: [familyWorshipSessions.userId, familyWorshipSessions.weekOf],
			set: {
				date: input.date,
				status: input.status,
				topicId,
				notes,
				...withTimestampsForUpdate(now)
			}
		});

	if (input.continueNextWeek && input.status === 'done' && topicId) {
		await setWeekTopic(userId, addDaysToDateString(weekOf, 7), topicId);
	}

	const session = await db.query.familyWorshipSessions.findFirst({
		where: and(eq(familyWorshipSessions.userId, userId), eq(familyWorshipSessions.weekOf, weekOf))
	});
	if (!session) throw new Error('Session missing after upsert');
	return session;
}

async function getOwnedSession(userId: string, sessionId: string) {
	const session = await getDb().query.familyWorshipSessions.findFirst({
		where: and(eq(familyWorshipSessions.id, sessionId), eq(familyWorshipSessions.userId, userId))
	});
	if (!session) throw new ApiWriteError('not_found', 'Session not found.', 404);
	return session;
}

export async function updateSession(userId: string, sessionId: string, input: SessionUpdate) {
	const db = getDb();
	const existing = await getOwnedSession(userId, sessionId);

	const status = input.status ?? existing.status;
	const requestedTopicId = input.topicId === undefined ? existing.topicId : input.topicId;
	const topicId = status === 'done' ? requestedTopicId : null;
	await assertSessionTopic(userId, status, topicId);

	const date = input.date ?? existing.date;
	const weekOf = getWednesdayOf(date);
	if (weekOf !== existing.weekOf) {
		const clash = await db.query.familyWorshipSessions.findFirst({
			where: and(
				eq(familyWorshipSessions.userId, userId),
				eq(familyWorshipSessions.weekOf, weekOf),
				ne(familyWorshipSessions.id, sessionId)
			)
		});
		if (clash) {
			throw new ApiWriteError('validation_failed', 'That week already has an entry.', 409);
		}
	}

	await db
		.update(familyWorshipSessions)
		.set({
			date,
			weekOf,
			status,
			topicId,
			notes: blankToNull(input.notes),
			...withTimestampsForUpdate()
		})
		.where(and(eq(familyWorshipSessions.id, sessionId), eq(familyWorshipSessions.userId, userId)));

	return getOwnedSession(userId, sessionId);
}

export async function deleteSession(userId: string, sessionId: string) {
	const deleted = await getDb()
		.delete(familyWorshipSessions)
		.where(and(eq(familyWorshipSessions.id, sessionId), eq(familyWorshipSessions.userId, userId)))
		.returning({ id: familyWorshipSessions.id });
	if (deleted.length === 0) throw new ApiWriteError('not_found', 'Session not found.', 404);
}
