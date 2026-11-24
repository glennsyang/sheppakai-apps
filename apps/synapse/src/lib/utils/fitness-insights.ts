/**
 * Fitness Insights: every number the fitness dashboard shows, computed from the raw Workouts,
 * Weigh-ins and Food Entries. Pure, so it can be tested; components only render the result.
 *
 * All day maths runs on YYYY-MM-DD strings through `date.ts` (calendar-day steps, never
 * `n * 24h`, never `toISOString`), with `today` given in app (Pacific) time.
 */
import {
	addDaysToDateString,
	calendarDaysBetween,
	formatMonthDay,
	getRollingDateRange,
	getStartOfWeek,
	parseLocalDateString
} from '#lib/utils/date.js';
import { type FrequentMeal, getFrequentMeals, sumCalories } from '#lib/utils/meal.js';
import { workoutTypeOptions } from '#lib/utils/workout.js';

interface InsightWorkout {
	date: string;
	type: string;
	durationMinutes: number | null;
}

interface InsightWeighIn {
	date: string;
	time: string | null;
	weightLbs: number;
}

interface InsightFoodEntry {
	date: string;
	timeOfDay: string;
	description: string;
	caloriesEstimate: number | null;
}

export interface FitnessInsightsInput {
	workouts: InsightWorkout[];
	weighIns: InsightWeighIn[];
	foodEntries: InsightFoodEntry[];
	calorieTarget: number | null;
	goalWeight: number | null;
	/** Today in app (Pacific) time, YYYY-MM-DD — from `getTodayString()`. */
	today: string;
}

export type WeighInDirection = 'up' | 'down' | 'stable';

export interface WeeklyFrequency {
	weekStart: string;
	label: string;
	total: number;
	/** Workouts that week per workout type value. */
	byType: Record<string, number>;
}

export interface MomentumDay {
	date: string;
	label: string;
	initial: string;
	workoutTypes: string[];
	hasWeighIn: boolean;
	/** Summed calories, or null when nothing with calories was logged that day. */
	calories: number | null;
}

export interface CalorieDay {
	date: string;
	day: string;
	calories: number;
}

export interface FitnessInsights {
	workouts: {
		/** Workouts since Monday of this week. */
		weeklyCount: number;
		/** Consecutive days with a Workout, counting back from today (0 if none today). */
		dayStreak: number;
		avgDurationMinutes: number;
		mostConsistentDay: string | null;
		/** The last 8 Monday-aligned weeks, oldest first. */
		weeklyFrequency: WeeklyFrequency[];
		/** Consecutive weeks, ending this week, with at least one Workout. */
		weeklyStreak: number;
	};
	weight: {
		currentWeight: number | null;
		startWeight: number | null;
		remainingToGoal: number | null;
		/** Latest Weigh-in minus the one before, or null with fewer than two. */
		delta: number | null;
		direction: WeighInDirection;
		/** lbs per week from the first Weigh-in to the latest. */
		weeklyRate: number | null;
		weeksToGoal: number | null;
	};
	nutrition: {
		target: number | null;
		todayCalories: number;
		/** Today's calories as a % of the Calorie Target. */
		todayAdherence: number | null;
		todayRemaining: number | null;
		todayOver: number | null;
		/** The last 7 days, oldest first. */
		lastSevenDays: CalorieDay[];
		/** Average over the last 7 days that have any calories. */
		sevenDayAvg: number | null;
		avgDeltaVsTarget: number | null;
		topMealPeriod: string | null;
		frequentMeals: FrequentMeal[];
	};
	/** The last 14 days, oldest first. */
	momentum: {
		days: MomentumDay[];
		lastWeek: { workoutDays: number; weighInDays: number; calorieDays: number };
	};
}

/** A Weigh-in move smaller than this (lbs) reads as stable. */
const STABLE_WEIGHT_LBS = 0.5;
const FREQUENCY_WEEKS = 8;
const MOMENTUM_DAYS = 14;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function groupByDate<T extends { date: string }>(items: T[]): Map<string, T[]> {
	const byDate = new Map<string, T[]>();
	for (const item of items) {
		const list = byDate.get(item.date);
		if (list) list.push(item);
		else byDate.set(item.date, [item]);
	}
	return byDate;
}

/** The key with the highest count; ties go to whichever was counted first. */
function topKey<K>(counts: Map<K, number>): K | null {
	let best: K | null = null;
	let bestCount = 0;
	for (const [key, count] of counts) {
		if (count > bestCount) {
			best = key;
			bestCount = count;
		}
	}
	return best;
}

function countBy<T, K>(items: T[], key: (item: T) => K): Map<K, number> {
	const counts = new Map<K, number>();
	for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
	return counts;
}

function weekdayLabel(date: string, weekday: 'short' | 'narrow'): string {
	return parseLocalDateString(date).toLocaleDateString('en-US', { weekday });
}

function dayStreak(workoutDates: Set<string>, today: string): number {
	let streak = 0;
	let day = today;
	while (workoutDates.has(day)) {
		streak++;
		day = addDaysToDateString(day, -1);
	}
	return streak;
}

function workoutInsights(workouts: InsightWorkout[], today: string): FitnessInsights['workouts'] {
	const thisWeekStart = getStartOfWeek(today);
	const pastAndToday = workouts.filter((w) => w.date <= today);

	const withDuration = workouts.filter((w) => w.durationMinutes != null);
	const avgDurationMinutes =
		withDuration.length > 0
			? Math.round(
					withDuration.reduce((sum, w) => sum + (w.durationMinutes ?? 0), 0) / withDuration.length
				)
			: 0;

	const topWeekday = topKey(countBy(workouts, (w) => parseLocalDateString(w.date).getDay()));

	const weeklyFrequency = Array.from({ length: FREQUENCY_WEEKS }, (_, i) => {
		const weekStart = addDaysToDateString(thisWeekStart, (i - FREQUENCY_WEEKS + 1) * 7);
		const weekEnd = addDaysToDateString(weekStart, 7);
		const weekWorkouts = workouts.filter((w) => w.date >= weekStart && w.date < weekEnd);
		return {
			weekStart,
			label: formatMonthDay(weekStart),
			total: weekWorkouts.length,
			byType: Object.fromEntries(
				workoutTypeOptions.map((option) => [
					option.value,
					weekWorkouts.filter((w) => w.type === option.value).length
				])
			)
		};
	});

	let weeklyStreak = 0;
	for (let i = weeklyFrequency.length - 1; i >= 0 && weeklyFrequency[i].total > 0; i--) {
		weeklyStreak++;
	}

	return {
		weeklyCount: pastAndToday.filter((w) => w.date >= thisWeekStart).length,
		dayStreak: dayStreak(new Set(workouts.map((w) => w.date)), today),
		avgDurationMinutes,
		mostConsistentDay: topWeekday === null ? null : DAY_NAMES[topWeekday],
		weeklyFrequency,
		weeklyStreak
	};
}

function weightInsights(
	weighIns: InsightWeighIn[],
	goalWeight: number | null
): FitnessInsights['weight'] {
	// Newest first, by date then time.
	const sorted = [...weighIns].sort(
		(a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '')
	);
	const latest = sorted[0];
	const earliest = sorted[sorted.length - 1];

	const currentWeight = latest?.weightLbs ?? null;
	const remainingToGoal =
		currentWeight != null && goalWeight != null ? currentWeight - goalWeight : null;

	const delta = sorted.length >= 2 ? sorted[0].weightLbs - sorted[1].weightLbs : null;
	const direction: WeighInDirection =
		delta == null || Math.abs(delta) <= STABLE_WEIGHT_LBS ? 'stable' : delta < 0 ? 'down' : 'up';

	let weeklyRate: number | null = null;
	if (sorted.length >= 2) {
		const days = Math.max(1, calendarDaysBetween(earliest.date, latest.date));
		weeklyRate = ((latest.weightLbs - earliest.weightLbs) / days) * 7;
	}

	let weeksToGoal: number | null = null;
	if (weeklyRate && remainingToGoal) {
		// Rate and remaining point opposite ways when heading toward the goal.
		const weeks = -remainingToGoal / weeklyRate;
		if (weeks >= 0 && weeks <= 200) weeksToGoal = Math.round(weeks);
	}

	return {
		currentWeight,
		startWeight: earliest?.weightLbs ?? null,
		remainingToGoal,
		delta,
		direction,
		weeklyRate,
		weeksToGoal
	};
}

function nutritionInsights(
	foodEntries: InsightFoodEntry[],
	target: number | null,
	today: string
): FitnessInsights['nutrition'] {
	const byDate = groupByDate(foodEntries);
	const caloriesOn = (date: string) => sumCalories(byDate.get(date) ?? []);

	const todayCalories = caloriesOn(today);
	const lastSevenDays = getRollingDateRange(today, 7).map((date) => ({
		date,
		day: weekdayLabel(date, 'short'),
		calories: caloriesOn(date)
	}));

	const loggedDays = lastSevenDays.filter((d) => d.calories > 0);
	const rawAvg =
		loggedDays.length > 0
			? loggedDays.reduce((sum, d) => sum + d.calories, 0) / loggedDays.length
			: null;

	return {
		target,
		todayCalories,
		todayAdherence: target ? Math.round((todayCalories / target) * 100) : null,
		todayRemaining: target ? Math.max(target - todayCalories, 0) : null,
		todayOver: target && todayCalories > target ? todayCalories - target : null,
		lastSevenDays,
		sevenDayAvg: rawAvg == null ? null : Math.round(rawAvg),
		avgDeltaVsTarget: rawAvg == null || !target ? null : Math.round(rawAvg - target),
		topMealPeriod: topKey(countBy(foodEntries, (m) => m.timeOfDay)),
		frequentMeals: getFrequentMeals(foodEntries)
	};
}

function momentumInsights(
	workouts: InsightWorkout[],
	weighIns: InsightWeighIn[],
	foodEntries: InsightFoodEntry[],
	today: string
): FitnessInsights['momentum'] {
	const workoutsByDate = groupByDate(workouts);
	const weighInDates = new Set(weighIns.map((w) => w.date));
	const foodByDate = groupByDate(foodEntries);

	const days = getRollingDateRange(today, MOMENTUM_DAYS).map((date) => {
		const calories = sumCalories(foodByDate.get(date) ?? []);
		return {
			date,
			label: parseLocalDateString(date).toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			}),
			initial: weekdayLabel(date, 'narrow'),
			workoutTypes: (workoutsByDate.get(date) ?? []).map((w) => w.type),
			hasWeighIn: weighInDates.has(date),
			calories: calories > 0 ? calories : null
		};
	});

	const lastWeek = days.slice(-7);
	return {
		days,
		lastWeek: {
			workoutDays: lastWeek.filter((d) => d.workoutTypes.length > 0).length,
			weighInDays: lastWeek.filter((d) => d.hasWeighIn).length,
			calorieDays: lastWeek.filter((d) => d.calories !== null).length
		}
	};
}

export function fitnessInsights(input: FitnessInsightsInput): FitnessInsights {
	const { workouts, weighIns, foodEntries, calorieTarget, goalWeight, today } = input;
	return {
		workouts: workoutInsights(workouts, today),
		weight: weightInsights(weighIns, goalWeight),
		nutrition: nutritionInsights(foodEntries, calorieTarget, today),
		momentum: momentumInsights(workouts, weighIns, foodEntries, today)
	};
}
