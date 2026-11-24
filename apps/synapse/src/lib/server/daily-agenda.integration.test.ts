// Runs the Daily Agenda module against the app's real schema and migrations in in-memory SQLite,
// with a fixed `today` per call.
import { and, asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDateRange } from '#lib/utils/date.js';

import {
	type AgendaContext,
	createDailyAgendaCustomEntry,
	createDailyAgendaTemplate,
	DailyAgendaMutationError,
	deleteDailyAgendaTemplate,
	ensureStandingItemEntries,
	expandStandingItems,
	loadDailyAgendaData,
	loadDailyAgendaEntriesForDate,
	type StandingItemVersion,
	toggleDailyAgendaEntry,
	updateDailyAgendaTemplate
} from './daily-agenda';
import { buildDateRanges, buildAgendaItemStats } from './dashboard/agenda-stats';
import { runDashboardQueries } from './dashboard/queries';
import * as schema from './db/schema';
import type { Db } from './notification-jobs/run-job';
import { buildTestDb, TEST_USER } from './notification-jobs/test-harness';

// 2026-11-01 and 2026-11-22 are Sundays; 2026-11-24 is a Tuesday.
const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

let db: Db;

beforeEach(() => {
	db = buildTestDb();
});

function on(today: string): AgendaContext {
	return { db, userId: TEST_USER.id, today };
}

function versions() {
	return db
		.select()
		.from(schema.dailyAgendaTemplates)
		.orderBy(asc(schema.dailyAgendaTemplates.startsOn))
		.all();
}

function entries() {
	return db
		.select()
		.from(schema.dailyAgendaEntries)
		.orderBy(asc(schema.dailyAgendaEntries.date))
		.all();
}

function entryOn(date: string) {
	const entry = db
		.select()
		.from(schema.dailyAgendaEntries)
		.where(
			and(
				eq(schema.dailyAgendaEntries.userId, TEST_USER.id),
				eq(schema.dailyAgendaEntries.date, date)
			)
		)
		.get();
	if (!entry) throw new Error(`no entry on ${date}`);
	return entry;
}

function version(overrides: Partial<StandingItemVersion> = {}): StandingItemVersion {
	return {
		id: 'v1',
		templateGroupId: 'g1',
		title: 'Stretch',
		sortOrder: 0,
		daysOfWeek: JSON.stringify(EVERY_DAY),
		startsOn: '2026-11-01',
		endsOn: null,
		...overrides
	};
}

describe('expandStandingItems', () => {
	const week = getDateRange('2026-11-22', '2026-11-28');

	it('expands a Standing Item onto its weekdays only', () => {
		const expanded = expandStandingItems(
			[version({ daysOfWeek: JSON.stringify(WEEKDAYS) })],
			week,
			[]
		);
		expect(expanded.map((entry) => entry.date)).toEqual(getDateRange('2026-11-23', '2026-11-27'));
	});

	it('respects the start and end dates of each version', () => {
		const expanded = expandStandingItems(
			[
				version({ id: 'v1', title: 'Old', startsOn: '2026-11-01', endsOn: '2026-11-24' }),
				version({ id: 'v2', title: 'New', startsOn: '2026-11-25' })
			],
			week,
			[]
		);
		expect(expanded.map((entry) => [entry.date, entry.templateId, entry.title])).toEqual([
			['2026-11-22', 'v1', 'Old'],
			['2026-11-23', 'v1', 'Old'],
			['2026-11-24', 'v1', 'Old'],
			['2026-11-25', 'v2', 'New'],
			['2026-11-26', 'v2', 'New'],
			['2026-11-27', 'v2', 'New'],
			['2026-11-28', 'v2', 'New']
		]);
	});

	it('skips days before the Standing Item started', () => {
		const expanded = expandStandingItems([version({ startsOn: '2026-11-26' })], week, []);
		expect(expanded.map((entry) => entry.date)).toEqual(['2026-11-26', '2026-11-27', '2026-11-28']);
	});

	it('skips days that already have an entry for the Standing Item', () => {
		const expanded = expandStandingItems(
			[version()],
			['2026-11-22', '2026-11-23'],
			[
				{ templateGroupId: 'g1', date: '2026-11-22' },
				{ templateGroupId: null, date: '2026-11-23' }
			]
		);
		expect(expanded.map((entry) => entry.date)).toEqual(['2026-11-23']);
	});
});

describe('ensureStandingItemEntries', () => {
	it('writes missing entries once, however often it runs', async () => {
		await createDailyAgendaTemplate(on('2026-11-01'), 'Stretch', WEEKDAYS);
		const days = getDateRange('2026-11-01', '2026-11-14');

		ensureStandingItemEntries(on('2026-11-24'), days);
		ensureStandingItemEntries(on('2026-11-24'), days);

		expect(entries().map((entry) => entry.date)).toEqual([
			...getDateRange('2026-11-02', '2026-11-06'),
			...getDateRange('2026-11-09', '2026-11-13')
		]);
	});

	it('runs on every agenda read', async () => {
		await createDailyAgendaTemplate(on('2026-11-01'), 'Stretch', EVERY_DAY);

		const day = await loadDailyAgendaEntriesForDate(on('2026-11-24'), '2026-11-10');
		expect(day.map((entry) => entry.title)).toEqual(['Stretch']);

		const week = await loadDailyAgendaData(on('2026-11-24'));
		expect(week.days.every((agendaDay) => agendaDay.totalCount === 1)).toBe(true);
		expect(week.templates.map((template) => template.title)).toEqual(['Stretch']);
	});
});

describe('editing a Standing Item', () => {
	it('versions an older Standing Item and leaves past days alone', async () => {
		await createDailyAgendaTemplate(on('2026-11-01'), 'Stretch', EVERY_DAY);
		ensureStandingItemEntries(on('2026-11-20'), getDateRange('2026-11-20', '2026-11-30'));
		const [original] = versions();

		// Drop Sundays (0) from today on.
		await updateDailyAgendaTemplate(on('2026-11-24'), original.id, 'Yoga', [1, 2, 3, 4, 5, 6]);

		const [closed, current] = versions();
		expect(closed).toMatchObject({ id: original.id, title: 'Stretch', endsOn: '2026-11-23' });
		expect(current).toMatchObject({
			templateGroupId: original.templateGroupId,
			title: 'Yoga',
			startsOn: '2026-11-24',
			endsOn: null
		});

		// Past days keep the old version, including the Sunday that is now dropped.
		expect(entryOn('2026-11-22')).toMatchObject({ title: 'Stretch', templateId: original.id });
		expect(entryOn('2026-11-23')).toMatchObject({ title: 'Stretch', templateId: original.id });
		// Today on: the new version, and the dropped Sunday loses its entry.
		expect(entryOn('2026-11-24')).toMatchObject({ title: 'Yoga', templateId: current.id });
		expect(entries().some((entry) => entry.date === '2026-11-29')).toBe(false);

		// Later expansion follows the new version.
		ensureStandingItemEntries(on('2026-11-24'), getDateRange('2026-12-06', '2026-12-07'));
		expect(entries().some((entry) => entry.date === '2026-12-06')).toBe(false);
		expect(entryOn('2026-12-07')).toMatchObject({ title: 'Yoga', templateId: current.id });
	});

	it('edits a Standing Item created today in place', async () => {
		await createDailyAgendaTemplate(on('2026-11-24'), 'Stretch', EVERY_DAY);
		ensureStandingItemEntries(on('2026-11-24'), getDateRange('2026-11-24', '2026-11-29'));
		const [original] = versions();

		await updateDailyAgendaTemplate(on('2026-11-24'), original.id, 'Yoga', WEEKDAYS);

		expect(versions()).toEqual([
			expect.objectContaining({ id: original.id, title: 'Yoga', endsOn: null })
		]);
		expect(entries().map((entry) => [entry.date, entry.title])).toEqual([
			['2026-11-24', 'Yoga'],
			['2026-11-25', 'Yoga'],
			['2026-11-26', 'Yoga'],
			['2026-11-27', 'Yoga']
		]);
	});

	it('deleting a Standing Item keeps its past entries', async () => {
		await createDailyAgendaTemplate(on('2026-11-01'), 'Stretch', EVERY_DAY);
		ensureStandingItemEntries(on('2026-11-24'), getDateRange('2026-11-22', '2026-11-26'));
		const [original] = versions();

		await deleteDailyAgendaTemplate(on('2026-11-24'), original.id);

		expect(entries().map((entry) => entry.date)).toEqual(['2026-11-22', '2026-11-23']);
		expect(versions()).toEqual([expect.objectContaining({ endsOn: '2026-11-23' })]);
	});
});

describe('the past-day read-only rule', () => {
	beforeEach(async () => {
		await createDailyAgendaTemplate(on('2026-11-01'), 'Stretch', EVERY_DAY);
		ensureStandingItemEntries(on('2026-11-24'), ['2026-11-23', '2026-11-24']);
	});

	it('refuses to toggle an entry dated before today', async () => {
		const error = await toggleDailyAgendaEntry(on('2026-11-24'), entryOn('2026-11-23').id, true)
			.then(() => null)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(DailyAgendaMutationError);
		expect((error as DailyAgendaMutationError).code).toBe('read_only');
		expect(entryOn('2026-11-23').completed).toBe(false);
	});

	it("toggles today's entry", async () => {
		await toggleDailyAgendaEntry(on('2026-11-24'), entryOn('2026-11-24').id, true);
		expect(entryOn('2026-11-24').completed).toBe(true);
	});

	it('refuses a custom entry on a past day', async () => {
		await expect(
			createDailyAgendaCustomEntry(on('2026-11-24'), { date: '2026-11-23', title: 'Late' })
		).rejects.toMatchObject({ code: 'read_only' });
	});
});

describe('dashboard agenda stats', () => {
	it('count Standing Item entries for days nobody opened', async () => {
		const today = '2026-11-24';
		const ranges = buildDateRanges(today);
		await createDailyAgendaTemplate(on(ranges.agenda8WeeksStart), 'Stretch', EVERY_DAY);

		const data = await runDashboardQueries(db, TEST_USER.id, ranges);

		expect(data.agendaEntriesForTrend.map((entry) => entry.date)).toEqual(
			getDateRange(ranges.agenda8WeeksStart, today)
		);
		const [stat] = buildAgendaItemStats(data.agendaEntriesForTrend, ranges);
		expect(stat).toMatchObject({ title: 'Stretch', completionPct: 0 });
		expect(stat.last4Days).toBeGreaterThan(0);
	});
});
