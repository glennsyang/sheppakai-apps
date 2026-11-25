// The Family Worship module: the one place that owns Topics, the Topic Queue order and the Usual
// Weekday. The Family Worship route actions are thin adapters over it.
//
// The Topic Queue is a per-user integer order (`queuePosition`, 0-based) over active topics.
// Creating and restoring append to the back; archiving takes a topic out of the order and closes
// the gap; reordering rewrites every position in one transaction.
//
// The better-sqlite3 driver runs transaction callbacks synchronously, so every query inside a
// transaction uses its sync execution method (`.all()` / `.get()` / `.run()`) rather than `await`.
// Writes that read the queue first run as IMMEDIATE transactions so two connections can't read
// the same back-of-queue position.
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { DEFAULT_USUAL_WEEKDAY, type PublicationLink } from '#lib/schemas/family-worship.js';
import type { getDb } from '#lib/server/db/index.js';
import { familyWorshipSettings, familyWorshipTopics } from '#lib/server/db/schema/index.js';
import { upsertUserSettings } from '#lib/server/db/writes/user-settings.js';
import { safeParse } from '#lib/server/json.js';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbClient = Db | Tx;

type TopicRow = typeof familyWorshipTopics.$inferSelect;

export type TopicFields = {
	title: string;
	description: string;
	notes: string | null;
	scriptureReferences: string | null;
	publicationLinks: PublicationLink[];
};

export type Topic = Omit<TopicRow, 'publicationLinks'> & { publicationLinks: PublicationLink[] };

type WriteOptions = { now?: Date };

const IMMEDIATE = { behavior: 'immediate' } as const;

const publicationLinksSchema = z.array(z.object({ label: z.string().optional(), url: z.string() }));

function linksToJson(links: PublicationLink[]): string | null {
	return links.length > 0 ? JSON.stringify(links) : null;
}

function toTopic(row: TopicRow): Topic {
	return {
		...row,
		publicationLinks: safeParse(
			row.publicationLinks,
			publicationLinksSchema,
			[],
			'familyWorshipTopic.publicationLinks'
		)
	};
}

/** The user's active topics: the ones in the Topic Queue. */
function activeOf(userId: string) {
	return and(eq(familyWorshipTopics.userId, userId), eq(familyWorshipTopics.isArchived, false));
}

const QUEUE_ORDER = [asc(familyWorshipTopics.queuePosition), asc(familyWorshipTopics.createdAt)];

function nextQueuePosition(db: DbClient, userId: string): number {
	const row = db
		.select({ max: sql<number>`coalesce(max(${familyWorshipTopics.queuePosition}), -1)` })
		.from(familyWorshipTopics)
		.where(activeOf(userId))
		.get();
	return (row?.max ?? -1) + 1;
}

/** Adds a topic to the back of the user's Topic Queue. */
export function createTopic(
	db: Db,
	userId: string,
	fields: TopicFields,
	{ now = new Date() }: WriteOptions = {}
): Topic {
	return db.transaction((tx) => {
		const row = tx
			.insert(familyWorshipTopics)
			.values({
				userId,
				title: fields.title,
				description: fields.description,
				notes: fields.notes,
				scriptureReferences: fields.scriptureReferences,
				publicationLinks: linksToJson(fields.publicationLinks),
				queuePosition: nextQueuePosition(tx, userId),
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		return toTopic(row);
	}, IMMEDIATE);
}

/** The user's active topics in Topic Queue order. */
export function getTopicQueue(db: Db, userId: string): Topic[] {
	return db
		.select()
		.from(familyWorshipTopics)
		.where(activeOf(userId))
		.orderBy(...QUEUE_ORDER)
		.all()
		.map(toTopic);
}

export type TopicQueueReorderResult = { ok: true } | { ok: false; reason: 'stale_queue' };

function activeTopicIds(db: DbClient, userId: string): string[] {
	return db
		.select({ id: familyWorshipTopics.id })
		.from(familyWorshipTopics)
		.where(activeOf(userId))
		.orderBy(...QUEUE_ORDER)
		.all()
		.map((row) => row.id);
}

function writeQueueOrder(db: DbClient, userId: string, topicIds: string[], now: Date): void {
	topicIds.forEach((id, index) => {
		db.update(familyWorshipTopics)
			.set({ queuePosition: index, updatedAt: now })
			.where(and(eq(familyWorshipTopics.id, id), eq(familyWorshipTopics.userId, userId)))
			.run();
	});
}

/**
 * Rewrites the Topic Queue to `orderedTopicIds`. The list must name exactly the user's active
 * topics; anything else (a topic added, archived or restored in another tab) is refused as
 * `stale_queue` and the queue is left unchanged.
 */
export function reorderTopicQueue(
	db: Db,
	userId: string,
	orderedTopicIds: string[],
	{ now = new Date() }: WriteOptions = {}
): TopicQueueReorderResult {
	return db.transaction((tx): TopicQueueReorderResult => {
		const current = activeTopicIds(tx, userId);
		const requested = new Set(orderedTopicIds);
		const sameSet =
			requested.size === orderedTopicIds.length &&
			requested.size === current.length &&
			current.every((id) => requested.has(id));
		if (!sameSet) return { ok: false, reason: 'stale_queue' };

		writeQueueOrder(tx, userId, orderedTopicIds, now);
		return { ok: true };
	}, IMMEDIATE);
}

export type TopicResult = { ok: true } | { ok: false; reason: 'not_found' };

function ownedTopic(userId: string, topicId: string) {
	return and(eq(familyWorshipTopics.id, topicId), eq(familyWorshipTopics.userId, userId));
}

function findOwnedTopic(db: DbClient, userId: string, topicId: string): TopicRow | undefined {
	return db.select().from(familyWorshipTopics).where(ownedTopic(userId, topicId)).get();
}

/** Hides a topic from the catalog and takes it out of the Topic Queue, keeping its history. */
export function archiveTopic(
	db: Db,
	userId: string,
	topicId: string,
	{ now = new Date() }: WriteOptions = {}
): TopicResult {
	return db.transaction((tx): TopicResult => {
		const existing = findOwnedTopic(tx, userId, topicId);
		if (!existing) return { ok: false, reason: 'not_found' };
		if (existing.isArchived) return { ok: true };

		tx.update(familyWorshipTopics)
			.set({ isArchived: true, archivedAt: now, queuePosition: null, updatedAt: now })
			.where(ownedTopic(userId, topicId))
			.run();
		writeQueueOrder(tx, userId, activeTopicIds(tx, userId), now);
		return { ok: true };
	}, IMMEDIATE);
}

/** Brings an Archived Topic back, at the back of the Topic Queue. */
export function restoreTopic(
	db: Db,
	userId: string,
	topicId: string,
	{ now = new Date() }: WriteOptions = {}
): TopicResult {
	return db.transaction((tx): TopicResult => {
		const existing = findOwnedTopic(tx, userId, topicId);
		if (!existing) return { ok: false, reason: 'not_found' };
		if (!existing.isArchived) return { ok: true };

		tx.update(familyWorshipTopics)
			.set({
				isArchived: false,
				archivedAt: null,
				queuePosition: nextQueuePosition(tx, userId),
				updatedAt: now
			})
			.where(ownedTopic(userId, topicId))
			.run();
		return { ok: true };
	}, IMMEDIATE);
}

/** The user's Archived Topics, most recently archived first. */
export function getArchivedTopics(db: Db, userId: string): Topic[] {
	return db
		.select()
		.from(familyWorshipTopics)
		.where(and(eq(familyWorshipTopics.userId, userId), eq(familyWorshipTopics.isArchived, true)))
		.orderBy(desc(familyWorshipTopics.archivedAt), asc(familyWorshipTopics.title))
		.all()
		.map(toTopic);
}

/** Fields left `undefined` keep their stored value; `null` clears a nullable one. */
export type TopicPatch = Partial<TopicFields>;

export type TopicUpdateResult = { ok: true; topic: Topic } | { ok: false; reason: 'not_found' };

/** Edits a topic's fields. Its place in the Topic Queue (or its archived state) is unchanged. */
export function updateTopic(
	db: Db,
	userId: string,
	topicId: string,
	patch: TopicPatch,
	{ now = new Date() }: WriteOptions = {}
): TopicUpdateResult {
	const row = db
		.update(familyWorshipTopics)
		.set({
			updatedAt: now,
			...(patch.title !== undefined && { title: patch.title }),
			...(patch.description !== undefined && { description: patch.description }),
			...(patch.notes !== undefined && { notes: patch.notes }),
			...(patch.scriptureReferences !== undefined && {
				scriptureReferences: patch.scriptureReferences
			}),
			...(patch.publicationLinks !== undefined && {
				publicationLinks: linksToJson(patch.publicationLinks)
			})
		})
		.where(ownedTopic(userId, topicId))
		.returning()
		.get();

	return row ? { ok: true, topic: toTopic(row) } : { ok: false, reason: 'not_found' };
}

export type TopicDeleteResult = { ok: true } | { ok: false; reason: 'not_found' | 'has_sessions' };

/**
 * Whether any Family Worship Session covers the topic. Sessions arrive with part 2 of Family
 * Worship; until then no topic has any, and the guard in `deleteTopic` is already in place.
 */
function topicHasSessions(_db: DbClient, _topicId: string): boolean {
	return false;
}

/**
 * Deletes a topic that has never been studied. A topic with sessions is refused as
 * `has_sessions`: it can only be archived, so its history is kept.
 */
export function deleteTopic(
	db: Db,
	userId: string,
	topicId: string,
	{ now = new Date() }: WriteOptions = {}
): TopicDeleteResult {
	return db.transaction((tx): TopicDeleteResult => {
		const existing = findOwnedTopic(tx, userId, topicId);
		if (!existing) return { ok: false, reason: 'not_found' };
		if (topicHasSessions(tx, topicId)) return { ok: false, reason: 'has_sessions' };

		tx.delete(familyWorshipTopics).where(ownedTopic(userId, topicId)).run();
		if (!existing.isArchived) writeQueueOrder(tx, userId, activeTopicIds(tx, userId), now);
		return { ok: true };
	}, IMMEDIATE);
}

/** The day of the week the user normally holds Family Worship; Wednesday without a saved row. */
export async function getUsualWeekday(db: Db, userId: string): Promise<number> {
	const row = await db.query.familyWorshipSettings.findFirst({
		where: eq(familyWorshipSettings.userId, userId),
		columns: { usualWeekday: true }
	});
	return row?.usualWeekday ?? DEFAULT_USUAL_WEEKDAY;
}

export async function setUsualWeekday(db: Db, userId: string, usualWeekday: number): Promise<void> {
	await upsertUserSettings(familyWorshipSettings, userId, { usualWeekday }, db);
}
