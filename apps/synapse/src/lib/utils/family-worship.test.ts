import { describe, expect, it } from 'vitest';

import {
	buildTopicStats,
	buildUpcomingSchedule,
	getUpcomingWeeks,
	getWednesdayOf,
	getWeekStatus,
	isHttpUrl,
	parseLinkLines,
	plannedTopicOf,
	rankTopicsForRotation,
	type WorshipSessionSummary,
	type WorshipTopicSummary
} from './family-worship';

const topic = (id: string, createdDay: number, isArchived = false): WorshipTopicSummary => ({
	id,
	title: `Topic ${id}`,
	isArchived,
	createdAt: new Date(2026, 0, createdDay)
});

const done = (weekOf: string, topicId: string, date = weekOf): WorshipSessionSummary => ({
	id: `s-${weekOf}`,
	weekOf,
	date,
	status: 'done',
	topicId,
	notes: null
});

describe('getWednesdayOf', () => {
	it('maps every day of a Mon–Sun week to its Wednesday', () => {
		// 2026-11-16 is a Monday; 2026-11-22 is the Sunday.
		for (const day of ['16', '17', '18', '19', '20', '21', '22']) {
			expect(getWednesdayOf(`2026-11-${day}`)).toBe('2026-11-18');
		}
	});

	it('crosses month boundaries', () => {
		expect(getWednesdayOf('2026-12-01')).toBe('2026-12-02');
		expect(getWednesdayOf('2026-11-30')).toBe('2026-12-02');
	});
});

describe('getUpcomingWeeks', () => {
	it('starts at this week and steps by 7 days', () => {
		expect(getUpcomingWeeks('2026-11-19', 3)).toEqual(['2026-11-18', '2026-11-25', '2026-12-02']);
	});
});

describe('buildTopicStats', () => {
	it('counts done sessions and ignores skipped ones', () => {
		const stats = buildTopicStats([
			done('2026-11-04', 'a'),
			done('2026-11-11', 'a', '2026-11-12'),
			{ ...done('2026-11-18', 'a'), status: 'skipped' }
		]);
		expect(stats.get('a')).toEqual({
			count: 2,
			lastCovered: '2026-11-12',
			dates: ['2026-11-12', '2026-11-04']
		});
	});
});

describe('rankTopicsForRotation', () => {
	it('puts never-covered first, then least recently covered, and drops archived', () => {
		const topics = [topic('a', 1), topic('b', 2), topic('c', 3), topic('d', 4, true)];
		const stats = buildTopicStats([done('2026-11-11', 'a'), done('2026-10-28', 'b')]);
		expect(rankTopicsForRotation(topics, stats).map((t) => t.id)).toEqual(['c', 'b', 'a']);
	});
});

describe('buildUpcomingSchedule', () => {
	const weeks = ['2026-11-18', '2026-11-25', '2026-12-02'];

	it('suggests topics for open weeks, skipping ones scheduled in the window', () => {
		const topics = [topic('a', 1), topic('b', 2), topic('c', 3)];
		const plan = buildUpcomingSchedule(
			weeks,
			[{ weekOf: '2026-11-25', topicId: 'a' }],
			[],
			topics,
			new Map()
		);
		expect(plan.map((w) => w.scheduledTopic?.id ?? null)).toEqual([null, 'a', null]);
		expect(plan.map((w) => w.suggestedTopic?.id ?? null)).toEqual(['b', null, 'c']);
		expect(plan.map((w) => plannedTopicOf(w)?.id)).toEqual(['b', 'a', 'c']);
	});

	it('cycles suggestions when there are more weeks than topics', () => {
		const plan = buildUpcomingSchedule(weeks, [], [], [topic('a', 1)], new Map());
		expect(plan.map((w) => w.suggestedTopic?.id)).toEqual(['a', 'a', 'a']);
	});

	it('does not suggest for a week that already has a session', () => {
		const session = done('2026-11-18', 'a');
		const plan = buildUpcomingSchedule(weeks, [], [session], [topic('a', 1)], new Map());
		expect(plan[0].session).toBe(session);
		expect(plan[0].suggestedTopic).toBeNull();
	});

	it('suggests nothing when there are no active topics', () => {
		const plan = buildUpcomingSchedule(weeks, [], [], [topic('a', 1, true)], new Map());
		expect(plan.every((w) => w.suggestedTopic === null)).toBe(true);
	});
});

describe('getWeekStatus', () => {
	const week = {
		weekOf: '2026-11-18',
		scheduledTopic: null,
		suggestedTopic: null,
		session: null
	};

	it('reports upcoming, tonight and missed by date', () => {
		expect(getWeekStatus(week, '2026-11-17')).toBe('upcoming');
		expect(getWeekStatus(week, '2026-11-18')).toBe('tonight');
		expect(getWeekStatus(week, '2026-11-19')).toBe('missed');
	});

	it('reports logged once a session exists', () => {
		expect(getWeekStatus({ ...week, session: done('2026-11-18', 'a') }, '2026-11-19')).toBe(
			'logged'
		);
	});
});

describe('link helpers', () => {
	it('splits lines and drops blanks', () => {
		expect(parseLinkLines(' https://a.example \n\n https://b.example ')).toEqual([
			'https://a.example',
			'https://b.example'
		]);
		expect(parseLinkLines(null)).toEqual([]);
	});

	it('accepts only http(s) URLs', () => {
		expect(isHttpUrl('https://wol.jw.org/en')).toBe(true);
		expect(isHttpUrl('javascript:alert(1)')).toBe(false);
		expect(isHttpUrl('not a url')).toBe(false);
	});
});
