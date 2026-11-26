import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getTodayString } from './date';
import { fitnessInsights, type FitnessInsightsInput } from './fitness-insights';

const workout = (date: string, type = 'cardio', durationMinutes: number | null = 30) => ({
	date,
	type,
	durationMinutes
});
const weighIn = (date: string, weightLbs: number, time: string | null = '07:00') => ({
	date,
	time,
	weightLbs
});
const food = (
	date: string,
	caloriesEstimate: number | null,
	description = 'Oatmeal',
	timeOfDay = 'breakfast'
) => ({ date, timeOfDay, description, caloriesEstimate });

const run = (input: Partial<FitnessInsightsInput> & { today: string }) =>
	fitnessInsights({
		workouts: [],
		weighIns: [],
		foodEntries: [],
		calorieTarget: null,
		goalWeight: null,
		...input
	});

// Run the date maths in a zone with DST, the way the browser and server actually do.
let originalTz: string | undefined;
beforeAll(() => {
	originalTz = process.env.TZ;
	process.env.TZ = 'America/Los_Angeles';
});
afterAll(() => {
	process.env.TZ = originalTz;
});

describe('fitnessInsights — workouts', () => {
	it('counts a streak back across a week boundary', () => {
		// 2026-11-23 is a Monday; the streak runs Fri → Mon.
		const result = run({
			today: '2026-11-23',
			workouts: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'].map((d) => workout(d))
		});

		expect(result.workouts.dayStreak).toBe(4);
		// Only Monday belongs to this week.
		expect(result.workouts.weeklyCount).toBe(1);
	});

	it('counts a streak across the fall-back DST change', () => {
		// US DST ends 2026-11-01 (a 25-hour day).
		const result = run({
			today: '2026-11-02',
			workouts: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map((d) => workout(d))
		});

		expect(result.workouts.dayStreak).toBe(4);
	});

	it('counts a streak across the spring-forward DST change', () => {
		// US DST starts 2026-03-08 (a 23-hour day).
		const result = run({
			today: '2026-03-09',
			workouts: ['2026-03-07', '2026-03-08', '2026-03-09'].map((d) => workout(d))
		});

		expect(result.workouts.dayStreak).toBe(3);
	});

	it('anchors today to app time for a late-evening Workout', () => {
		// 11:30pm Vancouver (UTC-7) on Nov 24 is already Nov 25 in UTC.
		const today = getTodayString(new Date('2026-11-25T06:30:00Z'));
		expect(today).toBe('2026-11-24');

		const result = run({
			today,
			workouts: [workout('2026-11-23'), workout('2026-11-24')]
		});

		expect(result.workouts.dayStreak).toBe(2);
		expect(result.workouts.weeklyCount).toBe(2);
	});

	it('has no streak when nothing is logged today', () => {
		const result = run({ today: '2026-11-24', workouts: [workout('2026-11-23')] });
		expect(result.workouts.dayStreak).toBe(0);
	});

	it('builds 8 Monday-aligned weeks and the weekly streak', () => {
		const result = run({
			today: '2026-11-25',
			workouts: [
				workout('2026-11-23', 'strength'),
				workout('2026-11-25', 'cardio'),
				workout('2026-11-16'),
				workout('2026-11-02'),
				workout('2026-11-30') // future, outside every week shown
			]
		});

		const weeks = result.workouts.weeklyFrequency;
		expect(weeks).toHaveLength(8);
		expect(weeks.at(-1)?.weekStart).toBe('2026-11-23');
		expect(weeks[0].weekStart).toBe('2026-10-05');
		expect(weeks.at(-1)?.total).toBe(2);
		expect(weeks.at(-1)?.byType.strength).toBe(1);
		// This week and last week have workouts; the week of Nov 9 doesn't.
		expect(result.workouts.weeklyStreak).toBe(2);
	});

	it('averages duration and finds the most consistent weekday', () => {
		const result = run({
			today: '2026-11-25',
			workouts: [
				workout('2026-11-23', 'cardio', 20),
				workout('2026-11-16', 'cardio', 40),
				workout('2026-11-18', 'cardio', null)
			]
		});

		expect(result.workouts.avgDurationMinutes).toBe(30);
		expect(result.workouts.mostConsistentDay).toBe('Monday');
	});
});

describe('fitnessInsights — Weigh-in trend', () => {
	it('compares the latest two Weigh-ins whatever their input order', () => {
		const result = run({
			today: '2026-11-24',
			goalWeight: 180,
			weighIns: [weighIn('2026-11-10', 200), weighIn('2026-11-24', 196), weighIn('2026-11-17', 198)]
		});

		expect(result.weight.currentWeight).toBe(196);
		expect(result.weight.startWeight).toBe(200);
		expect(result.weight.delta).toBe(-2);
		expect(result.weight.direction).toBe('down');
		expect(result.weight.remainingToGoal).toBe(16);
		expect(result.weight.weeklyRate).toBe(-2);
		expect(result.weight.weeksToGoal).toBe(8);
	});

	it('orders same-day Weigh-ins by time', () => {
		const result = run({
			today: '2026-11-24',
			weighIns: [weighIn('2026-11-24', 197, '20:00'), weighIn('2026-11-24', 196.8, '07:00')]
		});

		expect(result.weight.currentWeight).toBe(197);
		expect(result.weight.direction).toBe('stable');
	});

	it('has no trend or goal estimate when moving away from the goal', () => {
		expect(run({ today: '2026-11-24', weighIns: [weighIn('2026-11-24', 196)] }).weight.delta).toBe(
			null
		);

		const away = run({
			today: '2026-11-24',
			goalWeight: 180,
			weighIns: [weighIn('2026-11-10', 196), weighIn('2026-11-24', 200)]
		});
		expect(away.weight.direction).toBe('up');
		expect(away.weight.weeksToGoal).toBe(null);
	});
});

describe('fitnessInsights — nutrition', () => {
	it('builds 7 days of Calorie Target adherence across the DST change', () => {
		const result = run({
			today: '2026-11-03',
			calorieTarget: 2000,
			foodEntries: [
				food('2026-11-03', 1500),
				food('2026-11-03', 700, 'Pasta', 'dinner'),
				food('2026-11-01', 1800),
				food('2026-10-27', 2400),
				food('2026-10-26', 9999) // outside the 7-day window
			]
		});

		const days = result.nutrition.lastSevenDays;
		expect(days.map((d) => d.date)).toEqual([
			'2026-10-28',
			'2026-10-29',
			'2026-10-30',
			'2026-10-31',
			'2026-11-01',
			'2026-11-02',
			'2026-11-03'
		]);
		expect(days.at(-1)).toMatchObject({ day: 'Tue', calories: 2200 });
		expect(result.nutrition.todayCalories).toBe(2200);
		expect(result.nutrition.todayAdherence).toBe(110);
		expect(result.nutrition.todayOver).toBe(200);
		expect(result.nutrition.todayRemaining).toBe(0);
		expect(result.nutrition.sevenDayAvg).toBe(2000);
		expect(result.nutrition.avgDeltaVsTarget).toBe(0);
	});

	it('leaves target figures empty without a Calorie Target', () => {
		const result = run({ today: '2026-11-24', foodEntries: [food('2026-11-24', 500)] });

		expect(result.nutrition.todayAdherence).toBe(null);
		expect(result.nutrition.todayRemaining).toBe(null);
		expect(result.nutrition.avgDeltaVsTarget).toBe(null);
		expect(result.nutrition.sevenDayAvg).toBe(500);
		expect(result.nutrition.topMealPeriod).toBe('breakfast');
		expect(result.nutrition.frequentMeals.map((m) => m.description)).toEqual(['Oatmeal']);
	});
});

describe('fitnessInsights — momentum', () => {
	it('covers 14 calendar days across the DST change with no gaps or repeats', () => {
		const result = run({
			today: '2026-11-08',
			workouts: [workout('2026-11-01', 'yoga'), workout('2026-11-08')],
			weighIns: [weighIn('2026-11-02', 196)],
			foodEntries: [food('2026-11-08', 800), food('2026-11-07', null)]
		});

		const days = result.momentum.days;
		expect(days).toHaveLength(14);
		expect(days[0].date).toBe('2026-10-26');
		expect(days.at(-1)?.date).toBe('2026-11-08');
		expect(new Set(days.map((d) => d.date)).size).toBe(14);
		expect(days.find((d) => d.date === '2026-11-01')?.workoutTypes).toEqual(['yoga']);
		expect(days.find((d) => d.date === '2026-11-07')?.calories).toBe(null);
		expect(result.momentum.lastWeek).toEqual({ workoutDays: 1, weighInDays: 1, calorieDays: 1 });
	});
});
