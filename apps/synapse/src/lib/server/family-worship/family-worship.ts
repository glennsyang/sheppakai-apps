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
import { and, asc, desc, eq, gt, gte, lte, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
	DEFAULT_USUAL_WEEKDAY,
	type PlannedWeekView,
	type PublicationLink,
	type SessionEntry,
	type TopicRef
} from '#lib/schemas/family-worship.js';
import type { getDb } from '#lib/server/db/index.js';
import {
	familyWorshipPlannedWeeks,
	familyWorshipSessions,
	familyWorshipSettings,
	familyWorshipSkippedWeeks,
	familyWorshipTopics
} from '#lib/server/db/schema/index.js';
import { upsertUserSettings } from '#lib/server/db/writes/user-settings.js';
import { safeParse } from '#lib/server/json.js';
import { addDaysToDateString, getStartOfWeek, getTodayString } from '#lib/utils/date.js';

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

/** Hides a topic, takes it out of the Topic Queue and clears its unstudied Planned Weeks. */
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
		// An archived topic leaves the rotation: the weeks it was planned for (and not yet studied)
		// go back to suggestions. A session can't be logged for an archived topic, so keeping those
		// plans would make "We did it" fail. Weeks with a session keep their plan as history.
		tx.delete(familyWorshipPlannedWeeks)
			.where(
				and(
					eq(familyWorshipPlannedWeeks.userId, userId),
					eq(familyWorshipPlannedWeeks.topicId, topicId),
					sql`not exists (select 1 from ${familyWorshipSessions} where ${familyWorshipSessions.userId} = ${userId} and ${familyWorshipSessions.weekStart} = ${familyWorshipPlannedWeeks.weekStart})`
				)
			)
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

/** Whether any Family Worship Session covers the topic. */
function topicHasSessions(db: DbClient, topicId: string): boolean {
	const row = db
		.select({ id: familyWorshipSessions.id })
		.from(familyWorshipSessions)
		.where(eq(familyWorshipSessions.topicId, topicId))
		.limit(1)
		.get();
	return row !== undefined;
}

/**
 * Deletes a topic that has never been studied. A topic with sessions is refused as
 * `has_sessions`: it can only be archived, so its history is kept. Planned Weeks that hold it are
 * removed with it: an unstudied plan is no history.
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

		tx.delete(familyWorshipPlannedWeeks)
			.where(
				and(
					eq(familyWorshipPlannedWeeks.userId, userId),
					eq(familyWorshipPlannedWeeks.topicId, topicId)
				)
			)
			.run();
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

// ---------------------------------------------------------------------------------------------
// Planned Weeks, Family Worship Sessions and Skipped Weeks
//
// A week is identified by its Monday in Pacific time (`weekStart`, YYYY-MM-DD). The date a week
// shows is its Usual Weekday. A session belongs to the week its date falls in.
//
// Queue rules:
// - Planning a topic sends it to the back of the Topic Queue.
// - A planned topic that isn't studied (its week is cleared or skipped, or a different topic is
//   logged) goes back to the front, unless the same topic is planned in a later week.
// - The suggestion for an empty week is computed on read and never stored.
// ---------------------------------------------------------------------------------------------

/** The Monday (Pacific calendar) of the week a YYYY-MM-DD date falls in. */
export function weekStartOf(date: string): string {
	return getStartOfWeek(date);
}

/** The date a week shows: its Usual Weekday (0 = Sunday … 6 = Saturday). */
function weekDateFor(weekStart: string, usualWeekday: number): string {
	return addDaysToDateString(weekStart, (usualWeekday + 6) % 7);
}

function isWeekStart(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && weekStartOf(value) === value;
}

const addWeeks = (weekStart: string, weeks: number) => addDaysToDateString(weekStart, weeks * 7);

function usualWeekdayOf(db: DbClient, userId: string): number {
	const row = db
		.select({ usualWeekday: familyWorshipSettings.usualWeekday })
		.from(familyWorshipSettings)
		.where(eq(familyWorshipSettings.userId, userId))
		.get();
	return row?.usualWeekday ?? DEFAULT_USUAL_WEEKDAY;
}

function activeOwnedTopic(db: DbClient, userId: string, topicId: string): TopicRow | undefined {
	const row = findOwnedTopic(db, userId, topicId);
	return row && !row.isArchived ? row : undefined;
}

function moveInQueue(
	db: DbClient,
	userId: string,
	topicId: string,
	to: 'front' | 'back',
	now: Date
): void {
	const ids = activeTopicIds(db, userId);
	if (!ids.includes(topicId)) return;
	const rest = ids.filter((id) => id !== topicId);
	writeQueueOrder(db, userId, to === 'front' ? [topicId, ...rest] : [...rest, topicId], now);
}

/**
 * A planned topic wasn't studied in `weekStart`: back to the front of the queue, unless a later
 * week still has it planned (so a multi-week series isn't pushed ahead twice).
 */
function returnUnstudied(
	db: DbClient,
	userId: string,
	topicId: string,
	weekStart: string,
	now: Date
): void {
	const laterPlan = db
		.select({ id: familyWorshipPlannedWeeks.id })
		.from(familyWorshipPlannedWeeks)
		.where(
			and(
				eq(familyWorshipPlannedWeeks.userId, userId),
				eq(familyWorshipPlannedWeeks.topicId, topicId),
				gt(familyWorshipPlannedWeeks.weekStart, weekStart)
			)
		)
		.get();
	if (!laterPlan) moveInQueue(db, userId, topicId, 'front', now);
}

const plannedIn = (userId: string, weekStart: string) =>
	and(
		eq(familyWorshipPlannedWeeks.userId, userId),
		eq(familyWorshipPlannedWeeks.weekStart, weekStart)
	);
const sessionIn = (userId: string, weekStart: string) =>
	and(eq(familyWorshipSessions.userId, userId), eq(familyWorshipSessions.weekStart, weekStart));
const skippedIn = (userId: string, weekStart: string) =>
	and(
		eq(familyWorshipSkippedWeeks.userId, userId),
		eq(familyWorshipSkippedWeeks.weekStart, weekStart)
	);

function findPlan(db: DbClient, userId: string, weekStart: string) {
	return db.select().from(familyWorshipPlannedWeeks).where(plannedIn(userId, weekStart)).get();
}
function findSession(db: DbClient, userId: string, weekStart: string) {
	return db.select().from(familyWorshipSessions).where(sessionIn(userId, weekStart)).get();
}
function findSkip(db: DbClient, userId: string, weekStart: string) {
	return db.select().from(familyWorshipSkippedWeeks).where(skippedIn(userId, weekStart)).get();
}

/**
 * Makes `weekStart`'s Planned Week hold `topicId`. A newly planned topic goes to the back of the
 * queue; a topic it replaces goes through `returnUnstudied`.
 */
function setPlan(
	db: DbClient,
	userId: string,
	weekStart: string,
	topicId: string,
	now: Date
): void {
	const existing = findPlan(db, userId, weekStart);
	if (existing?.topicId === topicId) return;

	if (existing) {
		db.update(familyWorshipPlannedWeeks)
			.set({ topicId, updatedAt: now })
			.where(eq(familyWorshipPlannedWeeks.id, existing.id))
			.run();
	} else {
		db.insert(familyWorshipPlannedWeeks)
			.values({ userId, weekStart, topicId, createdAt: now, updatedAt: now })
			.run();
	}
	moveInQueue(db, userId, topicId, 'back', now);
	if (existing) returnUnstudied(db, userId, existing.topicId, weekStart, now);
}

export type PlanOptions = {
	/** Today's date (YYYY-MM-DD, Pacific). */
	today: string;
	/** This week plus this many minus one upcoming weeks. */
	weeks?: number;
	/** How many past weeks to look back over for unlogged weeks. */
	lookbackWeeks?: number;
};

/**
 * This week and the upcoming weeks, plus recent past weeks that are unlogged (no session and not
 * skipped) so they can be logged late. Each empty current or upcoming week gets its own suggestion:
 * the next active topic, in queue order, that isn't already planned in a current or upcoming week.
 */
export function getPlan(
	db: Db,
	userId: string,
	{ today, weeks = 8, lookbackWeeks = 4 }: PlanOptions
): PlannedWeekView[] {
	const thisWeek = weekStartOf(today);
	const from = addWeeks(thisWeek, -lookbackWeeks);
	const to = addWeeks(thisWeek, weeks - 1);
	const usualWeekday = usualWeekdayOf(db, userId);

	const plans = db
		.select({
			weekStart: familyWorshipPlannedWeeks.weekStart,
			topicId: familyWorshipTopics.id,
			title: familyWorshipTopics.title
		})
		.from(familyWorshipPlannedWeeks)
		.innerJoin(familyWorshipTopics, eq(familyWorshipTopics.id, familyWorshipPlannedWeeks.topicId))
		.where(
			and(
				eq(familyWorshipPlannedWeeks.userId, userId),
				gte(familyWorshipPlannedWeeks.weekStart, from)
			)
		)
		.all();
	const sessions = sessionsWithTitles(db, userId, [
		gte(familyWorshipSessions.weekStart, from),
		lte(familyWorshipSessions.weekStart, to)
	]);
	const skips = db
		.select()
		.from(familyWorshipSkippedWeeks)
		.where(
			and(
				eq(familyWorshipSkippedWeeks.userId, userId),
				gte(familyWorshipSkippedWeeks.weekStart, from),
				lte(familyWorshipSkippedWeeks.weekStart, to)
			)
		)
		.all();

	const planByWeek = new Map(plans.map((p) => [p.weekStart, { id: p.topicId, title: p.title }]));
	const sessionByWeek = new Map(sessions.map((s) => [s.weekStart, s]));
	const skipByWeek = new Map(skips.map((s) => [s.weekStart, { reason: s.reason }]));

	const plannedUpcoming = new Set(
		plans.filter((p) => p.weekStart >= thisWeek).map((p) => p.topicId)
	);
	const candidates = getTopicQueue(db, userId).filter((t) => !plannedUpcoming.has(t.id));
	let nextCandidate = 0;

	const rows: PlannedWeekView[] = [];
	for (let weekStart = from; weekStart <= to; weekStart = addWeeks(weekStart, 1)) {
		const isPast = weekStart < thisWeek;
		const plannedTopic = planByWeek.get(weekStart) ?? null;
		const sessionRow = sessionByWeek.get(weekStart);
		const session = sessionRow ? toSessionEntry(sessionRow) : null;
		const skip = skipByWeek.get(weekStart) ?? null;
		if (isPast && (session || skip)) continue;

		let suggestion: TopicRef | null = null;
		if (!isPast && !plannedTopic && !session && !skip) {
			const candidate = candidates[nextCandidate++];
			suggestion = candidate ? { id: candidate.id, title: candidate.title } : null;
		}

		rows.push({
			weekStart,
			date: weekDateFor(weekStart, usualWeekday),
			isCurrent: weekStart === thisWeek,
			isPast,
			plannedTopic,
			session,
			skip,
			suggestion
		});
	}
	return rows;
}

/** This week's row of the plan (for the dashboard card). */
export function getThisWeek(db: Db, userId: string, today: string): PlannedWeekView {
	const [row] = getPlan(db, userId, { today, weeks: 1, lookbackWeeks: 0 });
	if (!row) throw new Error('getPlan returned no row for this week');
	return row;
}

type SessionWithTitle = typeof familyWorshipSessions.$inferSelect & { topicTitle: string };

function sessionsWithTitles(
	db: DbClient,
	userId: string,
	conditions: (SQL | undefined)[]
): SessionWithTitle[] {
	return db
		.select({
			session: familyWorshipSessions,
			topicTitle: familyWorshipTopics.title
		})
		.from(familyWorshipSessions)
		.innerJoin(familyWorshipTopics, eq(familyWorshipTopics.id, familyWorshipSessions.topicId))
		.where(and(eq(familyWorshipSessions.userId, userId), ...conditions))
		.orderBy(desc(familyWorshipSessions.date))
		.all()
		.map((row) => ({ ...row.session, topicTitle: row.topicTitle }));
}

function toSessionEntry(row: SessionWithTitle): SessionEntry {
	return {
		id: row.id,
		date: row.date,
		topicId: row.topicId,
		topicTitle: row.topicTitle,
		note: row.note
	};
}

export type WeekResult =
	| { ok: true }
	| {
			ok: false;
			reason: 'invalid_week' | 'not_found' | 'week_skipped' | 'week_has_session';
	  };

/** Plans `topicId` (an active topic) for a week, replacing any topic already planned there. */
export function planWeek(
	db: Db,
	userId: string,
	weekStart: string,
	topicId: string,
	{ now = new Date() }: WriteOptions = {}
): WeekResult {
	if (!isWeekStart(weekStart)) return { ok: false, reason: 'invalid_week' };
	return db.transaction((tx): WeekResult => {
		if (!activeOwnedTopic(tx, userId, topicId)) return { ok: false, reason: 'not_found' };
		if (findSkip(tx, userId, weekStart)) return { ok: false, reason: 'week_skipped' };
		if (findSession(tx, userId, weekStart)) return { ok: false, reason: 'week_has_session' };

		setPlan(tx, userId, weekStart, topicId, now);
		return { ok: true };
	}, IMMEDIATE);
}

/** Clears a week's plan; its topic goes back to the front of the queue. */
export function clearWeek(
	db: Db,
	userId: string,
	weekStart: string,
	{ now = new Date() }: WriteOptions = {}
): WeekResult {
	if (!isWeekStart(weekStart)) return { ok: false, reason: 'invalid_week' };
	return db.transaction((tx): WeekResult => {
		const plan = findPlan(tx, userId, weekStart);
		if (!plan) return { ok: true };
		if (findSession(tx, userId, weekStart)) return { ok: false, reason: 'week_has_session' };

		tx.delete(familyWorshipPlannedWeeks).where(eq(familyWorshipPlannedWeeks.id, plan.id)).run();
		returnUnstudied(tx, userId, plan.topicId, weekStart, now);
		return { ok: true };
	}, IMMEDIATE);
}

/** Marks a week as having no family worship. Its planned topic goes back to the front. */
export function skipWeek(
	db: Db,
	userId: string,
	weekStart: string,
	reason: string | null,
	{ now = new Date() }: WriteOptions = {}
): WeekResult {
	if (!isWeekStart(weekStart)) return { ok: false, reason: 'invalid_week' };
	return db.transaction((tx): WeekResult => {
		if (findSession(tx, userId, weekStart)) return { ok: false, reason: 'week_has_session' };

		const existing = findSkip(tx, userId, weekStart);
		if (existing) {
			tx.update(familyWorshipSkippedWeeks)
				.set({ reason, updatedAt: now })
				.where(eq(familyWorshipSkippedWeeks.id, existing.id))
				.run();
		} else {
			tx.insert(familyWorshipSkippedWeeks)
				.values({ userId, weekStart, reason, createdAt: now, updatedAt: now })
				.run();
		}

		const plan = findPlan(tx, userId, weekStart);
		if (plan) {
			tx.delete(familyWorshipPlannedWeeks).where(eq(familyWorshipPlannedWeeks.id, plan.id)).run();
			returnUnstudied(tx, userId, plan.topicId, weekStart, now);
		}
		return { ok: true };
	}, IMMEDIATE);
}

/** Undoes a skip. */
export function unskipWeek(db: Db, userId: string, weekStart: string): WeekResult {
	if (!isWeekStart(weekStart)) return { ok: false, reason: 'invalid_week' };
	db.delete(familyWorshipSkippedWeeks).where(skippedIn(userId, weekStart)).run();
	return { ok: true };
}

export type SessionFields = {
	/** YYYY-MM-DD (Pacific). */
	date: string;
	topicId: string;
	note: string | null;
};

export type LogSessionInput = SessionFields & {
	/** Logging into a Skipped Week removes the skip, but only when confirmed. */
	confirmUnskip?: boolean;
	/** Plan the same topic for the following week. */
	continueNextWeek?: boolean;
	/** When next week already holds a different topic: replace it, or push the plan back. */
	nextWeekConflict?: 'replace' | 'shift';
};

type SessionFailure =
	| { ok: false; reason: 'not_found' | 'future_date' | 'week_skipped' }
	| { ok: false; reason: 'week_has_session'; sessionId: string };

export type LogSessionResult =
	| { ok: true; sessionId: string }
	| SessionFailure
	| { ok: false; reason: 'next_week_conflict'; topicTitle: string }
	| { ok: false; reason: 'next_week_skipped' | 'next_week_has_session' };

/**
 * Moves every Planned Week from `fromWeek` on back one week. Weeks with a session keep their plan;
 * Skipped Weeks and weeks with a session are stepped over. Works from the latest week back, so a
 * plan always moves into a week that has just been vacated.
 */
function shiftPlansFrom(db: DbClient, userId: string, fromWeek: string, now: Date): void {
	const blocked = new Set([
		...db
			.select({ weekStart: familyWorshipSkippedWeeks.weekStart })
			.from(familyWorshipSkippedWeeks)
			.where(
				and(
					eq(familyWorshipSkippedWeeks.userId, userId),
					gt(familyWorshipSkippedWeeks.weekStart, fromWeek)
				)
			)
			.all()
			.map((row) => row.weekStart),
		...db
			.select({ weekStart: familyWorshipSessions.weekStart })
			.from(familyWorshipSessions)
			.where(
				and(
					eq(familyWorshipSessions.userId, userId),
					gte(familyWorshipSessions.weekStart, fromWeek)
				)
			)
			.all()
			.map((row) => row.weekStart)
	]);

	const movable = db
		.select()
		.from(familyWorshipPlannedWeeks)
		.where(
			and(
				eq(familyWorshipPlannedWeeks.userId, userId),
				gte(familyWorshipPlannedWeeks.weekStart, fromWeek)
			)
		)
		.orderBy(desc(familyWorshipPlannedWeeks.weekStart))
		.all()
		.filter((plan) => !blocked.has(plan.weekStart));

	for (const plan of movable) {
		let target = addWeeks(plan.weekStart, 1);
		while (blocked.has(target)) target = addWeeks(target, 1);
		db.update(familyWorshipPlannedWeeks)
			.set({ weekStart: target, updatedAt: now })
			.where(eq(familyWorshipPlannedWeeks.id, plan.id))
			.run();
	}
}

/** Checks shared by logging and editing a session; `null` when the write may go ahead. */
function sessionWriteFailure(
	db: DbClient,
	userId: string,
	fields: SessionFields,
	{
		today,
		allowTopicId,
		ignoreSessionId,
		confirmUnskip
	}: {
		today: string;
		allowTopicId?: string;
		ignoreSessionId?: string;
		confirmUnskip: boolean;
	}
): SessionFailure | null {
	if (fields.date > today) return { ok: false, reason: 'future_date' };
	const topicOk =
		fields.topicId === allowTopicId
			? findOwnedTopic(db, userId, fields.topicId)
			: activeOwnedTopic(db, userId, fields.topicId);
	if (!topicOk) return { ok: false, reason: 'not_found' };

	const weekStart = weekStartOf(fields.date);
	const existing = findSession(db, userId, weekStart);
	if (existing && existing.id !== ignoreSessionId) {
		return { ok: false, reason: 'week_has_session', sessionId: existing.id };
	}
	if (!confirmUnskip && findSkip(db, userId, weekStart)) {
		return { ok: false, reason: 'week_skipped' };
	}
	return null;
}

/**
 * Logs a Family Worship Session. The session wins over the plan: its week's Planned Week is set to
 * the session's topic. The topic stays active and in the queue.
 */
export function logSession(
	db: Db,
	userId: string,
	input: LogSessionInput,
	{ now = new Date() }: WriteOptions = {}
): LogSessionResult {
	return db.transaction((tx): LogSessionResult => {
		const failure = sessionWriteFailure(tx, userId, input, {
			today: getTodayString(now),
			confirmUnskip: input.confirmUnskip === true
		});
		if (failure) return failure;

		const weekStart = weekStartOf(input.date);
		const nextWeek = addWeeks(weekStart, 1);
		const nextPlan = input.continueNextWeek ? findPlan(tx, userId, nextWeek) : undefined;
		if (input.continueNextWeek) {
			if (findSession(tx, userId, nextWeek)) return { ok: false, reason: 'next_week_has_session' };
			if (findSkip(tx, userId, nextWeek)) return { ok: false, reason: 'next_week_skipped' };
			if (nextPlan && nextPlan.topicId !== input.topicId && !input.nextWeekConflict) {
				const conflicting = findOwnedTopic(tx, userId, nextPlan.topicId);
				return { ok: false, reason: 'next_week_conflict', topicTitle: conflicting?.title ?? '' };
			}
		}

		// Every check has passed; from here on the transaction only writes.
		tx.delete(familyWorshipSkippedWeeks).where(skippedIn(userId, weekStart)).run();
		const session = tx
			.insert(familyWorshipSessions)
			.values({
				userId,
				date: input.date,
				weekStart,
				topicId: input.topicId,
				note: input.note,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: familyWorshipSessions.id })
			.get();
		setPlan(tx, userId, weekStart, input.topicId, now);

		if (input.continueNextWeek) {
			if (nextPlan && nextPlan.topicId !== input.topicId && input.nextWeekConflict === 'shift') {
				shiftPlansFrom(tx, userId, nextWeek, now);
			}
			setPlan(tx, userId, nextWeek, input.topicId, now);
		}
		return { ok: true, sessionId: session.id };
	}, IMMEDIATE);
}

export type UpdateSessionResult = { ok: true } | SessionFailure;

/**
 * Edits a session's date, topic or note. Its (possibly new) week's plan is set to its topic; the
 * week it moved out of keeps its plan.
 */
export function updateSession(
	db: Db,
	userId: string,
	sessionId: string,
	fields: SessionFields & { confirmUnskip?: boolean },
	{ now = new Date() }: WriteOptions = {}
): UpdateSessionResult {
	return db.transaction((tx): UpdateSessionResult => {
		const existing = tx
			.select()
			.from(familyWorshipSessions)
			.where(and(eq(familyWorshipSessions.id, sessionId), eq(familyWorshipSessions.userId, userId)))
			.get();
		if (!existing) return { ok: false, reason: 'not_found' };

		const failure = sessionWriteFailure(tx, userId, fields, {
			today: getTodayString(now),
			allowTopicId: existing.topicId,
			ignoreSessionId: existing.id,
			confirmUnskip: fields.confirmUnskip === true
		});
		if (failure) return failure;

		const weekStart = weekStartOf(fields.date);
		tx.delete(familyWorshipSkippedWeeks).where(skippedIn(userId, weekStart)).run();
		tx.update(familyWorshipSessions)
			.set({
				date: fields.date,
				weekStart,
				topicId: fields.topicId,
				note: fields.note,
				updatedAt: now
			})
			.where(eq(familyWorshipSessions.id, existing.id))
			.run();
		setPlan(tx, userId, weekStart, fields.topicId, now);
		return { ok: true };
	}, IMMEDIATE);
}

/** Deletes a session logged by mistake. The week's plan is left as it is. */
export function deleteSession(db: Db, userId: string, sessionId: string): TopicResult {
	const deleted = db
		.delete(familyWorshipSessions)
		.where(and(eq(familyWorshipSessions.id, sessionId), eq(familyWorshipSessions.userId, userId)))
		.returning({ id: familyWorshipSessions.id })
		.get();
	return deleted ? { ok: true } : { ok: false, reason: 'not_found' };
}

export type TopicHistory = {
	topic: Topic;
	sessions: SessionEntry[];
	count: number;
	lastDate: string | null;
};

/** Every session that covered a topic, newest first. `null` when the topic isn't the user's. */
export function getTopicHistory(db: Db, userId: string, topicId: string): TopicHistory | null {
	const topic = findOwnedTopic(db, userId, topicId);
	if (!topic) return null;
	const sessions = sessionsWithTitles(db, userId, [eq(familyWorshipSessions.topicId, topicId)]).map(
		toSessionEntry
	);
	return {
		topic: toTopic(topic),
		sessions,
		count: sessions.length,
		lastDate: sessions[0]?.date ?? null
	};
}

export type HistoryEntry =
	| ({ kind: 'session' } & SessionEntry)
	| { kind: 'skip'; weekStart: string; date: string; reason: string | null };

export type HistoryMonth = { month: string; entries: HistoryEntry[] };

/**
 * Sessions and Skipped Weeks, newest first, grouped by month (`YYYY-MM`). Filtering by topic shows
 * only that topic's sessions.
 */
export function getHistory(
	db: Db,
	userId: string,
	{ topicId }: { topicId?: string } = {}
): HistoryMonth[] {
	const sessions: HistoryEntry[] = sessionsWithTitles(
		db,
		userId,
		topicId ? [eq(familyWorshipSessions.topicId, topicId)] : []
	).map((row) => ({ kind: 'session', ...toSessionEntry(row) }));

	const usualWeekday = usualWeekdayOf(db, userId);
	const skips: HistoryEntry[] = topicId
		? []
		: db
				.select()
				.from(familyWorshipSkippedWeeks)
				.where(eq(familyWorshipSkippedWeeks.userId, userId))
				.all()
				.map((row) => ({
					kind: 'skip',
					weekStart: row.weekStart,
					date: weekDateFor(row.weekStart, usualWeekday),
					reason: row.reason
				}));

	const entries = [...sessions, ...skips].sort((a, b) => b.date.localeCompare(a.date));
	const months: HistoryMonth[] = [];
	for (const entry of entries) {
		const month = entry.date.slice(0, 7);
		const last = months.at(-1);
		if (last?.month === month) last.entries.push(entry);
		else months.push({ month, entries: [entry] });
	}
	return months;
}
