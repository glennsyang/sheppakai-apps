// The Daily Agenda module: Standing Items (versioned templates), the Agenda Items expanded from
// them for each day, and custom Agenda Items. The /tasks page, `/api/v1/agenda`, the Morning
// Digest and the dashboard stats all read through it.
//
// Standing Item expansion is an explicit step: `expandStandingItems` decides (purely) which
// Agenda Items a set of days is missing, and `ensureStandingItemEntries` writes them. Every
// reader calls `ensureStandingItemEntries` for the days it reads before it reads entries, so a
// day nobody opened still has its Standing Item entries.
//
// Every function takes an `AgendaContext` (`db`, `userId`, `today`) so tests can run it against an
// in-memory SQLite with a fixed date. The better-sqlite3 driver runs transaction callbacks
// synchronously, so queries inside a transaction use `.all()` / `.get()` / `.run()`.
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import type { getDb } from '#lib/server/db/index.js';
import { dailyAgendaEntries, dailyAgendaTemplates } from '#lib/server/db/schema/index.js';
import { generateId, withTimestampsForUpdate } from '#lib/server/db/utils.js';
import type {
	DailyAgendaChartPoint,
	DailyAgendaData,
	DailyAgendaDay,
	DailyAgendaEntry,
	DailyAgendaTemplate
} from '#lib/types.js';
import {
	addDaysToDateString,
	getRollingDateRange,
	getStartOfWeek,
	getWeekDates,
	parseLocalDateString
} from '#lib/utils/date.js';

const DEFAULT_SOURCE = 'default' as const;
const CUSTOM_SOURCE = 'custom' as const;
const EVERY_DAY_TEMPLATE_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** Rows per insert, to stay well under SQLite's bound-variable limit. */
const INSERT_CHUNK_SIZE = 500;

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbClient = Db | Tx;

type DailyAgendaTemplateRecord = typeof dailyAgendaTemplates.$inferSelect;
type DailyAgendaEntryRecord = typeof dailyAgendaEntries.$inferSelect;
type DailyAgendaEntryInsert = typeof dailyAgendaEntries.$inferInsert;

/** Who is reading or writing, and which day counts as today (YYYY-MM-DD). */
export type AgendaContext = { db: Db; userId: string; today: string };

/** The Standing Item version fields expansion needs. */
export type StandingItemVersion = Pick<
	DailyAgendaTemplateRecord,
	'id' | 'templateGroupId' | 'title' | 'sortOrder' | 'daysOfWeek' | 'startsOn' | 'endsOn'
>;

/** A Standing Item entry a day is missing, before it gets an id, user and timestamps. */
export type ExpandedStandingItemEntry = {
	templateId: string;
	templateGroupId: string;
	date: string;
	title: string;
	sortOrder: number;
};

export class DailyAgendaMutationError extends Error {
	constructor(
		message: string,
		public readonly code: 'invalid_source' | 'not_found' | 'read_only'
	) {
		super(message);
	}
}

/** The past-day rule: Agenda Items dated before today are read only. */
export function assertDateIsEditable(date: string, today: string): void {
	if (date < today) {
		throw new DailyAgendaMutationError('Historical items are read only', 'read_only');
	}
}

export function calculateCompletionPercentage(entries: Array<{ completed: boolean }>): number {
	if (entries.length === 0) {
		return 0;
	}

	const completedCount = entries.filter((entry) => entry.completed).length;
	return Math.round((completedCount / entries.length) * 100);
}

export function buildDateRangeLabel(startDate: string, endDate: string): string {
	const start = parseLocalDateString(startDate);
	const end = parseLocalDateString(endDate);

	const startLabel = start.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric'
	});
	const endLabel = end.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	return `${startLabel} - ${endLabel}`;
}

export function normalizeTemplateDays(daysOfWeek: number[]): number[] {
	const normalizedDays = Array.from(new Set(daysOfWeek))
		.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
		.sort((left, right) => left - right);

	return normalizedDays.length > 0 ? normalizedDays : [...EVERY_DAY_TEMPLATE_DAYS];
}

export function parseTemplateDays(daysOfWeek: string): number[] {
	try {
		const parsed = JSON.parse(daysOfWeek);
		if (!Array.isArray(parsed)) {
			return [...EVERY_DAY_TEMPLATE_DAYS];
		}

		const numericDays = parsed.filter((day): day is number => typeof day === 'number');
		return normalizeTemplateDays(numericDays);
	} catch {
		return [...EVERY_DAY_TEMPLATE_DAYS];
	}
}

export function serializeTemplateDays(daysOfWeek: number[]): string {
	return JSON.stringify(normalizeTemplateDays(daysOfWeek));
}

export function getEntriesToDeleteForDays(
	entries: Array<{ id: string; date: string }>,
	allowedDays: number[]
): string[] {
	const allowedDaySet = new Set(allowedDays);

	return entries
		.filter((entry) => !allowedDaySet.has(parseLocalDateString(entry.date).getDay()))
		.map((entry) => entry.id);
}

function mapTemplateRecord(template: DailyAgendaTemplateRecord): DailyAgendaTemplate {
	return {
		id: template.id,
		templateGroupId: template.templateGroupId,
		title: template.title,
		sortOrder: template.sortOrder,
		daysOfWeek: parseTemplateDays(template.daysOfWeek),
		startsOn: template.startsOn,
		endsOn: template.endsOn ?? null
	};
}

function mapEntryRecord(entry: DailyAgendaEntryRecord): DailyAgendaEntry {
	return {
		id: entry.id,
		templateId: entry.templateId ?? null,
		templateGroupId: entry.templateGroupId ?? null,
		date: entry.date,
		title: entry.title,
		sourceType: entry.sourceType,
		sortOrder: entry.sortOrder,
		completed: entry.completed,
		completedAt: entry.completedAt ?? null
	};
}

function isStandingItemActiveOnDate(template: StandingItemVersion, date: string): boolean {
	if (template.startsOn > date || (template.endsOn && template.endsOn < date)) {
		return false;
	}

	const dayOfWeek = parseLocalDateString(date).getDay();
	const allowedDays = parseTemplateDays(template.daysOfWeek);
	return allowedDays.includes(dayOfWeek);
}

function sortAgendaEntriesForDisplay(entries: DailyAgendaEntry[]): DailyAgendaEntry[] {
	return entries
		.map((entry, index) => ({ entry, index }))
		.sort((left, right) => {
			if (left.entry.sourceType !== right.entry.sourceType) {
				return left.entry.sourceType === DEFAULT_SOURCE ? -1 : 1;
			}

			if (left.entry.sortOrder !== right.entry.sortOrder) {
				return left.entry.sortOrder - right.entry.sortOrder;
			}

			return left.index - right.index;
		})
		.map(({ entry }) => entry);
}

/** Standing Item versions in effect on any day between `rangeStart` and `rangeEnd`. */
function selectStandingItemVersions(
	db: DbClient,
	userId: string,
	rangeStart: string,
	rangeEnd: string
): DailyAgendaTemplateRecord[] {
	return db
		.select()
		.from(dailyAgendaTemplates)
		.where(
			and(
				eq(dailyAgendaTemplates.userId, userId),
				lte(dailyAgendaTemplates.startsOn, rangeEnd),
				or(isNull(dailyAgendaTemplates.endsOn), gte(dailyAgendaTemplates.endsOn, rangeStart))
			)
		)
		.orderBy(asc(dailyAgendaTemplates.sortOrder), asc(dailyAgendaTemplates.createdAt))
		.all();
}

/**
 * Which Standing Item entries `dates` are missing. A version contributes an entry on each date
 * inside its `startsOn`..`endsOn` range that falls on one of its weekdays, unless that Standing
 * Item (its `templateGroupId`) already has an entry on that date.
 */
export function expandStandingItems(
	standingItems: StandingItemVersion[],
	dates: string[],
	existing: Array<{ templateGroupId: string | null; date: string }>
): ExpandedStandingItemEntry[] {
	const uniqueDates = Array.from(new Set(dates)).sort((left, right) => left.localeCompare(right));
	const existingKeys = new Set(
		existing
			.filter((entry) => entry.templateGroupId)
			.map((entry) => `${entry.templateGroupId}:${entry.date}`)
	);
	const expanded: ExpandedStandingItemEntry[] = [];

	for (const standingItem of standingItems) {
		for (const date of uniqueDates) {
			if (!isStandingItemActiveOnDate(standingItem, date)) {
				continue;
			}

			const key = `${standingItem.templateGroupId}:${date}`;
			if (existingKeys.has(key)) {
				continue;
			}

			expanded.push({
				templateId: standingItem.id,
				templateGroupId: standingItem.templateGroupId,
				date,
				title: standingItem.title,
				sortOrder: standingItem.sortOrder
			});
			existingKeys.add(key);
		}
	}

	return expanded;
}

/**
 * Writes the Standing Item entries `dates` are missing. Every agenda reader calls this for the
 * days it reads, before reading their entries.
 */
export function ensureStandingItemEntries(
	{ db, userId }: Pick<AgendaContext, 'db' | 'userId'>,
	dates: string[]
): void {
	const uniqueDates = Array.from(new Set(dates)).sort((left, right) => left.localeCompare(right));
	const rangeStart = uniqueDates.at(0);
	const rangeEnd = uniqueDates.at(-1);
	if (!rangeStart || !rangeEnd) {
		return;
	}

	db.transaction((tx) => {
		const standingItems = selectStandingItemVersions(tx, userId, rangeStart, rangeEnd);
		if (standingItems.length === 0) {
			return;
		}

		const existing = tx
			.select({
				date: dailyAgendaEntries.date,
				templateGroupId: dailyAgendaEntries.templateGroupId
			})
			.from(dailyAgendaEntries)
			.where(
				and(
					eq(dailyAgendaEntries.userId, userId),
					gte(dailyAgendaEntries.date, rangeStart),
					lte(dailyAgendaEntries.date, rangeEnd),
					eq(dailyAgendaEntries.sourceType, DEFAULT_SOURCE)
				)
			)
			.all();

		const timestamp = new Date();
		const inserts: DailyAgendaEntryInsert[] = expandStandingItems(
			standingItems,
			uniqueDates,
			existing
		).map((entry) => ({
			...entry,
			id: generateId(),
			userId,
			sourceType: DEFAULT_SOURCE,
			completed: false,
			createdAt: timestamp,
			updatedAt: timestamp
		}));

		for (let index = 0; index < inserts.length; index += INSERT_CHUNK_SIZE) {
			tx.insert(dailyAgendaEntries)
				.values(inserts.slice(index, index + INSERT_CHUNK_SIZE))
				.onConflictDoNothing({
					target: [
						dailyAgendaEntries.userId,
						dailyAgendaEntries.templateGroupId,
						dailyAgendaEntries.date
					]
				})
				.run();
		}
	});
}

/** The current version of a Standing Item, or `not_found`. */
function selectCurrentStandingItem(
	tx: DbClient,
	{ userId, today }: Pick<AgendaContext, 'userId' | 'today'>,
	templateId: string
): DailyAgendaTemplateRecord {
	const existing = tx
		.select()
		.from(dailyAgendaTemplates)
		.where(
			and(
				eq(dailyAgendaTemplates.id, templateId),
				eq(dailyAgendaTemplates.userId, userId),
				lte(dailyAgendaTemplates.startsOn, today),
				or(isNull(dailyAgendaTemplates.endsOn), gte(dailyAgendaTemplates.endsOn, today))
			)
		)
		.get();

	if (!existing) {
		throw new DailyAgendaMutationError('Standing item not found', 'not_found');
	}
	return existing;
}

/** A Standing Item's entries dated today or later. Past days are never rewritten. */
function futureStandingItemEntries(
	{ userId, today }: Pick<AgendaContext, 'userId' | 'today'>,
	templateGroupId: string
) {
	return and(
		eq(dailyAgendaEntries.userId, userId),
		eq(dailyAgendaEntries.templateGroupId, templateGroupId),
		eq(dailyAgendaEntries.sourceType, DEFAULT_SOURCE),
		gte(dailyAgendaEntries.date, today)
	);
}

function mapEntriesByDate(rows: DailyAgendaEntryRecord[]): Map<string, DailyAgendaEntry[]> {
	const entriesByDate = new Map<string, DailyAgendaEntry[]>();
	for (const row of rows) {
		const mappedEntry = mapEntryRecord(row);
		const dayEntries = entriesByDate.get(mappedEntry.date) ?? [];
		dayEntries.push(mappedEntry);
		entriesByDate.set(mappedEntry.date, dayEntries);
	}

	for (const [date, entries] of entriesByDate) {
		entriesByDate.set(date, sortAgendaEntriesForDisplay(entries));
	}
	return entriesByDate;
}

function buildAgendaDay(date: string, today: string, entries: DailyAgendaEntry[]): DailyAgendaDay {
	const parsedDate = parseLocalDateString(date);
	return {
		date,
		dayName: parsedDate.toLocaleDateString('en-US', { weekday: 'long' }),
		shortDayName: parsedDate.toLocaleDateString('en-US', { weekday: 'short' }),
		dayOfWeek: parsedDate.getDay(),
		dayNumber: parsedDate.getDate(),
		monthLabel: parsedDate.toLocaleDateString('en-US', { month: 'long' }),
		isToday: date === today,
		isWeekend: parsedDate.getDay() === 0 || parsedDate.getDay() === 6,
		isEditable: date >= today,
		completionPercentage: calculateCompletionPercentage(entries),
		completedCount: entries.filter((entry) => entry.completed).length,
		totalCount: entries.length,
		entries
	};
}

export async function loadDailyAgendaData(
	ctx: AgendaContext,
	requestedWeekStart?: string
): Promise<DailyAgendaData> {
	const { db, userId, today } = ctx;
	const weekStart = getStartOfWeek(requestedWeekStart ?? today);
	const weekDates = getWeekDates(weekStart);
	const weekEnd = weekDates.at(-1) ?? weekStart;
	const chartDates = getRollingDateRange(weekEnd, 14);
	const datesToRead = Array.from(new Set([...weekDates, ...chartDates]));

	ensureStandingItemEntries(ctx, datesToRead);

	const entryRows = await db.query.dailyAgendaEntries.findMany({
		where: and(
			eq(dailyAgendaEntries.userId, userId),
			inArray(dailyAgendaEntries.date, datesToRead)
		),
		orderBy: [
			asc(dailyAgendaEntries.date),
			asc(dailyAgendaEntries.sortOrder),
			asc(dailyAgendaEntries.createdAt)
		]
	});
	const entriesByDate = mapEntriesByDate(entryRows);

	const days = weekDates.map((date) => buildAgendaDay(date, today, entriesByDate.get(date) ?? []));

	const chartPoints: DailyAgendaChartPoint[] = chartDates.map((date) => {
		const entries = entriesByDate.get(date) ?? [];
		return {
			date,
			completionPercentage: calculateCompletionPercentage(entries),
			completedCount: entries.filter((entry) => entry.completed).length,
			totalCount: entries.length
		};
	});

	const overallTotalCount = days.reduce((total, day) => total + day.totalCount, 0);
	const overallCompletedCount = days.reduce((total, day) => total + day.completedCount, 0);

	return {
		weekStart,
		weekEnd,
		weekLabel: buildDateRangeLabel(weekStart, weekEnd),
		previousWeekStart: addDaysToDateString(weekStart, -7),
		nextWeekStart: addDaysToDateString(weekStart, 7),
		chartRangeLabel: buildDateRangeLabel(
			chartDates.at(0) ?? weekStart,
			chartDates.at(-1) ?? chartDates.at(0) ?? weekStart
		),
		isCurrentWeek: weekStart === getStartOfWeek(today),
		overallCompletionPercentage:
			overallTotalCount === 0 ? 0 : Math.round((overallCompletedCount / overallTotalCount) * 100),
		overallCompletedCount,
		overallTotalCount,
		days,
		templates: selectStandingItemVersions(db, userId, today, today).map(mapTemplateRecord),
		chartPoints
	};
}

export async function loadDailyAgendaEntriesForDate(
	ctx: AgendaContext,
	date: string
): Promise<DailyAgendaEntry[]> {
	const { db, userId } = ctx;
	ensureStandingItemEntries(ctx, [date]);

	const rows = await db.query.dailyAgendaEntries.findMany({
		where: and(eq(dailyAgendaEntries.userId, userId), eq(dailyAgendaEntries.date, date)),
		orderBy: [asc(dailyAgendaEntries.sortOrder), asc(dailyAgendaEntries.createdAt)]
	});

	return sortAgendaEntriesForDisplay(rows.map(mapEntryRecord));
}

export async function createDailyAgendaTemplate(
	{ db, userId, today }: AgendaContext,
	title: string,
	daysOfWeek: number[]
): Promise<void> {
	const timestamp = new Date();
	const serializedDays = serializeTemplateDays(daysOfWeek);

	db.transaction((tx) => {
		const sortOrderRow = tx
			.select({
				maxSortOrder: sql<number>`coalesce(max(${dailyAgendaTemplates.sortOrder}), -1)`
			})
			.from(dailyAgendaTemplates)
			.where(
				and(
					eq(dailyAgendaTemplates.userId, userId),
					lte(dailyAgendaTemplates.startsOn, today),
					or(isNull(dailyAgendaTemplates.endsOn), gte(dailyAgendaTemplates.endsOn, today))
				)
			)
			.get();

		tx.insert(dailyAgendaTemplates)
			.values({
				id: generateId(),
				templateGroupId: generateId(),
				userId,
				title,
				sortOrder: (sortOrderRow?.maxSortOrder ?? -1) + 1,
				daysOfWeek: serializedDays,
				startsOn: today,
				createdAt: timestamp,
				updatedAt: timestamp
			})
			.run();
	});
}

/**
 * Edits a Standing Item from today on. A version that started today is edited in place; an older
 * version is closed off yesterday and a new version starts today, so past days keep the old title
 * and weekdays. Either way, entries from today on move to the current version: dropped weekdays
 * lose their entry, the rest take the new title.
 */
export async function updateDailyAgendaTemplate(
	ctx: AgendaContext,
	templateId: string,
	title: string,
	daysOfWeek: number[]
): Promise<void> {
	const { db, userId, today } = ctx;
	const timestamp = new Date();
	const normalizedDays = normalizeTemplateDays(daysOfWeek);
	const serializedDays = JSON.stringify(normalizedDays);

	db.transaction((tx) => {
		const existing = selectCurrentStandingItem(tx, ctx, templateId);
		let currentVersionId = existing.id;

		if (existing.startsOn === today) {
			tx.update(dailyAgendaTemplates)
				.set({ title, daysOfWeek: serializedDays, updatedAt: timestamp })
				.where(eq(dailyAgendaTemplates.id, existing.id))
				.run();
		} else {
			currentVersionId = generateId();
			tx.update(dailyAgendaTemplates)
				.set({ endsOn: addDaysToDateString(today, -1), updatedAt: timestamp })
				.where(eq(dailyAgendaTemplates.id, existing.id))
				.run();
			tx.insert(dailyAgendaTemplates)
				.values({
					id: currentVersionId,
					templateGroupId: existing.templateGroupId,
					userId,
					title,
					sortOrder: existing.sortOrder,
					daysOfWeek: serializedDays,
					startsOn: today,
					createdAt: timestamp,
					updatedAt: timestamp
				})
				.run();
		}

		const futureEntries = futureStandingItemEntries({ userId, today }, existing.templateGroupId);
		const entriesToDelete = getEntriesToDeleteForDays(
			tx
				.select({ id: dailyAgendaEntries.id, date: dailyAgendaEntries.date })
				.from(dailyAgendaEntries)
				.where(futureEntries)
				.all(),
			normalizedDays
		);
		if (entriesToDelete.length > 0) {
			tx.delete(dailyAgendaEntries).where(inArray(dailyAgendaEntries.id, entriesToDelete)).run();
		}

		tx.update(dailyAgendaEntries)
			.set({
				templateId: currentVersionId,
				title,
				sortOrder: existing.sortOrder,
				updatedAt: timestamp
			})
			.where(futureEntries)
			.run();
	});
}

/**
 * Removes a Standing Item from today on. Its entries from today on are deleted; past entries stay.
 * A version that started today is deleted outright, an older one is closed off yesterday.
 */
export async function deleteDailyAgendaTemplate(
	ctx: AgendaContext,
	templateId: string
): Promise<void> {
	const { db, userId, today } = ctx;
	const timestamp = new Date();

	db.transaction((tx) => {
		const existing = selectCurrentStandingItem(tx, ctx, templateId);

		tx.delete(dailyAgendaEntries)
			.where(futureStandingItemEntries({ userId, today }, existing.templateGroupId))
			.run();

		if (existing.startsOn === today) {
			tx.delete(dailyAgendaTemplates).where(eq(dailyAgendaTemplates.id, existing.id)).run();
			return;
		}

		tx.update(dailyAgendaTemplates)
			.set({ endsOn: addDaysToDateString(today, -1), updatedAt: timestamp })
			.where(eq(dailyAgendaTemplates.id, existing.id))
			.run();
	});
}

export async function createDailyAgendaCustomEntry(
	{ db, userId, today }: AgendaContext,
	input: { date: string; title: string }
): Promise<void> {
	assertDateIsEditable(input.date, today);

	const timestamp = new Date();

	db.transaction((tx) => {
		const sortOrderRow = tx
			.select({
				maxSortOrder: sql<number>`coalesce(max(${dailyAgendaEntries.sortOrder}), -1)`
			})
			.from(dailyAgendaEntries)
			.where(and(eq(dailyAgendaEntries.userId, userId), eq(dailyAgendaEntries.date, input.date)))
			.get();

		tx.insert(dailyAgendaEntries)
			.values({
				id: generateId(),
				userId,
				date: input.date,
				title: input.title,
				sourceType: CUSTOM_SOURCE,
				sortOrder: (sortOrderRow?.maxSortOrder ?? -1) + 1,
				completed: false,
				createdAt: timestamp,
				updatedAt: timestamp
			})
			.run();
	});
}

/** An entry the user may change: it exists, belongs to them and is not on a past day. */
async function findEditableEntry(
	{ db, userId, today }: AgendaContext,
	entryId: string
): Promise<DailyAgendaEntryRecord> {
	const existing = await db.query.dailyAgendaEntries.findFirst({
		where: and(eq(dailyAgendaEntries.id, entryId), eq(dailyAgendaEntries.userId, userId))
	});

	if (!existing) {
		throw new DailyAgendaMutationError('Agenda item not found', 'not_found');
	}

	assertDateIsEditable(existing.date, today);
	return existing;
}

export async function updateDailyAgendaCustomEntry(
	ctx: AgendaContext,
	entryId: string,
	title: string
): Promise<void> {
	const existing = await findEditableEntry(ctx, entryId);

	if (existing.sourceType !== CUSTOM_SOURCE) {
		throw new DailyAgendaMutationError('Only custom items can be edited here', 'invalid_source');
	}

	await ctx.db
		.update(dailyAgendaEntries)
		.set({ title, ...withTimestampsForUpdate() })
		.where(eq(dailyAgendaEntries.id, entryId));
}

export async function deleteDailyAgendaCustomEntry(
	ctx: AgendaContext,
	entryId: string
): Promise<void> {
	const existing = await findEditableEntry(ctx, entryId);

	if (existing.sourceType !== CUSTOM_SOURCE) {
		throw new DailyAgendaMutationError('Only custom items can be deleted here', 'invalid_source');
	}

	await ctx.db.delete(dailyAgendaEntries).where(eq(dailyAgendaEntries.id, entryId));
}

export async function toggleDailyAgendaEntry(
	ctx: AgendaContext,
	entryId: string,
	completed: boolean
): Promise<void> {
	await findEditableEntry(ctx, entryId);

	const now = new Date();
	await ctx.db
		.update(dailyAgendaEntries)
		.set({
			completed,
			completedAt: completed ? now : null,
			updatedAt: now
		})
		.where(eq(dailyAgendaEntries.id, entryId));
}
