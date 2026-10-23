import { describe, expect, it, vi } from 'vitest';

// Visit status rules have their own tests; here each person's status is fixed by id.
vi.mock('#lib/server/visits.js', () => ({
	getPersonVisitStatus: (person: { id: string }) => ({ status: person.id.split('-')[0] })
}));

import type { VisitStatusThresholds } from '#lib/utils/visit-status.js';

import {
	buildAgendaCompletionTrend,
	buildCountByDateMap,
	buildDaysSinceLastWorkout,
	buildTaskStats,
	buildTodayAgendaSummary,
	buildUpcomingVisits,
	buildVisitHealth,
	sumCountsByDate
} from './builders';

const TODAY = '2026-10-22';

/** Noon Pacific on `date`, so the app-time-zone day is unambiguous. */
const noonPacific = (date: string) => new Date(`${date}T19:00:00Z`);

describe('buildCountByDateMap / sumCountsByDate', () => {
	it('sums the counts for the given dates and treats missing dates as zero', () => {
		const counts = buildCountByDateMap([
			{ date: '2026-10-20', count: 2 },
			{ date: '2026-10-21', count: 3 }
		]);

		expect(sumCountsByDate(counts, ['2026-10-20', '2026-10-21', '2026-10-22'])).toBe(5);
	});
});

describe('buildUpcomingVisits', () => {
	it('groups people by day, dedupes them, and labels today and tomorrow', () => {
		const result = buildUpcomingVisits(
			[
				{ personId: 'p1', personName: 'Zoe', date: TODAY },
				{ personId: 'p2', personName: 'Ann', date: TODAY }
			],
			[{ personId: 'p1', personName: 'Zoe', followUpDate: TODAY }],
			[{ personId: 'p3', personName: 'Bo', scheduledVisitDate: '2026-10-23' }],
			TODAY
		);

		expect(result).toEqual([
			{ dayLabel: 'Today', names: ['Ann', 'Zoe'], isToday: true },
			{ dayLabel: 'Tomorrow', names: ['Bo'], isToday: false }
		]);
	});

	it('skips follow-ups without a date', () => {
		expect(
			buildUpcomingVisits(
				[],
				[{ personId: 'p1', personName: 'Zoe', followUpDate: null }],
				[],
				TODAY
			)
		).toEqual([]);
	});
});

describe('buildVisitHealth', () => {
	it('buckets people by visit status, counting scheduled as healthy and skipping exempt', () => {
		const person = (id: string, name: string) => ({
			id,
			name,
			isExempt: false,
			scheduledVisitDate: null
		});

		const result = buildVisitHealth(
			[
				person('red-1', 'Ann'),
				person('yellow-1', 'Bo'),
				person('scheduled-1', 'Cy'),
				person('none-1', 'Di'),
				person('exempt-1', 'Ed')
			],
			new Map(),
			TODAY,
			{} as VisitStatusThresholds
		);

		expect(result.counts).toEqual({ critical: 1, overdue: 1, healthy: 1, noVisits: 1, total: 4 });
		expect(result.names).toEqual({
			critical: ['Ann'],
			overdue: ['Bo'],
			healthy: ['Cy'],
			noVisits: ['Di']
		});
	});
});

describe('buildTaskStats', () => {
	it('splits completions into this week and last week and caps the title list at 5', () => {
		const thisWeek = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'];
		const lastWeek = ['2026-10-12', '2026-10-13'];
		const completions = [
			...Array.from({ length: 6 }, (_, i) => ({
				title: `T${i}`,
				completedAt: noonPacific('2026-10-20')
			})),
			{ title: 'Old', completedAt: noonPacific('2026-10-12') },
			{ title: 'Open', completedAt: null }
		];

		const result = buildTaskStats(
			completions,
			[{ count: 2 }],
			[{ count: 7 }],
			[{ title: 'Urgent' }],
			[{ title: 'Any' }],
			thisWeek,
			lastWeek
		);

		expect(result).toEqual({
			completedThisWeek: 6,
			completedLastWeek: 1,
			completedThisWeekTitles: ['T0', 'T1', 'T2', 'T3', 'T4'],
			openHighPriority: 2,
			openHighPriorityTitles: ['Urgent'],
			openTotal: 7,
			openTotalTitles: ['Any']
		});
	});
});

describe('buildAgendaCompletionTrend', () => {
	it('returns 8 weeks ending with this one, oldest first, as completion percentages', () => {
		const startOfThisWeek = '2026-10-19';
		const trend = buildAgendaCompletionTrend(
			[
				{ date: '2026-10-12', completed: true },
				{ date: '2026-10-13', completed: false },
				{ date: '2026-10-14', completed: true },
				{ date: '2026-10-19', completed: true }
			],
			startOfThisWeek
		);

		expect(trend).toHaveLength(8);
		expect(trend[7].completionPct).toBe(100); // this week: 1 of 1
		expect(trend[6].completionPct).toBe(67); // last week: 2 of 3
		expect(trend.slice(0, 6).every((week) => week.completionPct === 0)).toBe(true);
	});
});

describe('buildTodayAgendaSummary', () => {
	it("summarizes only today's entries in sort order", () => {
		const entry = (id: string, date: string, completed: boolean, sortOrder: number) => ({
			id,
			date,
			completed,
			sortOrder,
			title: id,
			templateGroupId: null
		});

		const summary = buildTodayAgendaSummary(
			[
				entry('b', TODAY, false, 2),
				entry('a', TODAY, true, 1),
				entry('old', '2026-10-21', true, 0)
			],
			TODAY
		);

		expect(summary).toEqual({
			completed: 1,
			total: 2,
			items: [
				{ id: 'a', title: 'a', completed: true },
				{ id: 'b', title: 'b', completed: false }
			]
		});
	});
});

describe('buildDaysSinceLastWorkout', () => {
	it('counts days since the latest workout, or null with none', () => {
		expect(buildDaysSinceLastWorkout([{ date: '2026-10-15' }, { date: '2026-10-20' }], TODAY)).toBe(
			2
		);
		expect(buildDaysSinceLastWorkout([], TODAY)).toBeNull();
	});
});
