import { toAiImage } from '@sheppakai/shared/ai-vision';
import { redirect } from '@sveltejs/kit';
import { and, desc, eq, gte } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { z } from 'zod';

import {
	deleteEntrySchema,
	logMealSchema,
	logWeightSchema,
	mealEstimateResultSchema,
	logWorkoutSchema,
	MAX_WORKOUT_EXERCISES,
	parseWorkoutExercises,
	setCalorieTargetSchema,
	setGoalWeightSchema,
	updateMealSchema,
	updateWeightSchema,
	updateWorkoutReminderSchema,
	updateWorkoutSchema,
	type WorkoutExerciseInput,
	workoutReminderSchema
} from '#lib/schemas/fitness.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import {
	createAction,
	deleteAction,
	updateAction,
	upsertSettingAction,
	writeAction
} from '#lib/server/actions/crud-helpers.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { getDb } from '#lib/server/db/index.js';
import {
	dailyCalorieTargets,
	goalWeights,
	mealLogs,
	weightEntries,
	workoutLogs,
	workoutReminders
} from '#lib/server/db/schema/index.js';
import {
	createFoodEntry,
	type FoodEntryFields,
	updateFoodEntry
} from '#lib/server/fitness/food-entry.js';
import { createWorkout, updateWorkout, type WorkoutFields } from '#lib/server/fitness/workout.js';
import { logger } from '#lib/server/logger.js';
import {
	estimateMeal,
	isMealEstimateEnabled,
	MAX_MEAL_NOTE_LENGTH,
	UnreadableMealError
} from '#lib/server/meal-estimate/index.js';
import { createUserRateLimiter } from '#lib/server/rate-limiter.js';
import { addDaysToDateString, getTodayString } from '#lib/utils/date.js';

import type { Actions, PageServerLoad } from './$types';

const estimateLimiter = createUserRateLimiter([30, 'h']);

const INVALID_EXERCISES_MESSAGE = `Exercises are invalid. Each needs a name (max 100 characters) and positive whole numbers, up to ${MAX_WORKOUT_EXERCISES} exercises.`;

// Form values → domain fields, shared by the log and update actions for each entry type.
const toFoodEntryFields = (data: z.infer<typeof logMealSchema>): FoodEntryFields => ({
	date: data.date,
	timeOfDay: data.timeOfDay,
	description: data.description,
	caloriesEstimate: data.caloriesEstimate || null
});

const toWorkoutFields = (
	data: z.infer<typeof logWorkoutSchema>,
	exercises: WorkoutExerciseInput[]
): WorkoutFields => ({
	date: data.date,
	time: data.time || null,
	type: data.type,
	durationMinutes: data.durationMinutes || null,
	steps: data.steps || null,
	notes: data.notes || null,
	exercises: exercises.map((exercise) => ({
		exerciseName: exercise.exerciseName,
		sets: exercise.sets || null,
		reps: exercise.reps || null,
		weightLbs: exercise.weightLbs || null
	}))
});

/**
 * How far back Fitness Insights and the frequent-meal re-log look at Food Entries. A separate,
 * date-bounded query on purpose: the 50 most recent entries (the list) can cover under two weeks
 * for someone logging every meal, which would hide most re-log candidates and part of the
 * 14-day momentum strip.
 */
const INSIGHT_FOOD_DAYS = 90;

const toReminderRow = (data: z.infer<typeof workoutReminderSchema>) => ({
	workoutType: data.workoutType,
	cadence: data.cadence,
	daysOfWeek: data.daysOfWeek || null,
	time: data.time,
	enabled: data.enabled
});

export const load: PageServerLoad = async ({ locals, url }) => {
	const tab = (() => {
		const tabParam = url.searchParams.get('tab');
		if (tabParam === 'workouts' || tabParam === 'meals' || tabParam === 'reminders') {
			return tabParam;
		}

		return 'weight';
	})();

	// Load up all the forms
	const calorieForm = await superValidate(zod4(setCalorieTargetSchema));
	const weightForm = await superValidate(zod4(logWeightSchema));
	const goalForm = await superValidate(zod4(setGoalWeightSchema));
	const workoutForm = await superValidate(zod4(logWorkoutSchema));
	const mealForm = await superValidate(zod4(logMealSchema));
	const reminderForm = await superValidate(zod4(workoutReminderSchema));

	const userId = getUser(locals).id;

	try {
		const db = getDb();
		// Load weight entries
		const weights = await db.query.weightEntries.findMany({
			where: eq(weightEntries.userId, userId),
			orderBy: [desc(weightEntries.date), desc(weightEntries.time)]
		});

		// Load goal weight
		const goalWeight = await db.query.goalWeights.findFirst({
			where: eq(goalWeights.userId, userId)
		});

		// Load workouts (limited to recent)
		const workouts = await db.query.workoutLogs.findMany({
			where: eq(workoutLogs.userId, userId),
			orderBy: [desc(workoutLogs.date), desc(workoutLogs.time)],
			limit: 50,
			with: {
				exercises: true
			}
		});

		// Load meals (limited to recent) for the entry lists
		const meals = await db.query.mealLogs.findMany({
			where: eq(mealLogs.userId, userId),
			orderBy: [desc(mealLogs.date)],
			limit: 50
		});

		// Food Entries in the insight window, for Fitness Insights and the frequent-meal re-log
		const insightFoodEntries = await db
			.select({
				date: mealLogs.date,
				timeOfDay: mealLogs.timeOfDay,
				description: mealLogs.description,
				caloriesEstimate: mealLogs.caloriesEstimate
			})
			.from(mealLogs)
			.where(
				and(
					eq(mealLogs.userId, userId),
					gte(mealLogs.date, addDaysToDateString(getTodayString(), -INSIGHT_FOOD_DAYS))
				)
			);

		// Load calorie target
		const calorieTarget = await db.query.dailyCalorieTargets.findFirst({
			where: eq(dailyCalorieTargets.userId, userId)
		});

		// Load workout reminders
		const reminders = await db.query.workoutReminders.findMany({
			where: eq(workoutReminders.userId, userId),
			orderBy: [desc(workoutReminders.createdAt)]
		});

		return {
			tab,
			mealEstimateEnabled: isMealEstimateEnabled(),
			reminders,
			weightEntries: weights,
			goalWeight,
			workouts,
			meals,
			insightFoodEntries,
			calorieTarget,
			calorieForm,
			weightForm,
			goalForm,
			workoutForm,
			mealForm,
			reminderForm
		};
	} catch (error) {
		logger.error('Failed to load fitness data', error);
		return {
			tab,
			loadError: 'Failed to load fitness data. Please try refreshing the page.',
			mealEstimateEnabled: isMealEstimateEnabled(),
			reminders: [],
			weightEntries: [],
			goalWeight: null,
			workouts: [],
			meals: [],
			insightFoodEntries: [],
			calorieTarget: null,
			calorieForm,
			weightForm,
			goalForm,
			workoutForm,
			mealForm,
			reminderForm
		};
	}
};

export const actions = {
	logWeight: createAction({
		schema: logWeightSchema,
		table: weightEntries,
		entityName: 'Weigh-in',
		toRow: (data) => ({ date: data.date, time: data.time || null, weightLbs: data.weightLbs })
	}),

	setGoal: upsertSettingAction({
		schema: setGoalWeightSchema,
		table: goalWeights,
		entityName: 'Goal weight',
		toValues: (data) => ({ targetWeightLbs: data.targetWeightLbs, setDate: getTodayString() })
	}),

	logWorkout: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(logWorkoutSchema));

		if (!form.valid) {
			logger.warn('Invalid workout log form data', { errors: form.errors });
			return invalidForm(form);
		}

		let exercises: WorkoutExerciseInput[] = [];
		if (form.data.type === 'strength' && form.data.exercises) {
			const parsed = parseWorkoutExercises(form.data.exercises);
			if (!parsed.success) {
				logger.warn('Invalid exercises in workout log', { userId: user.id });
				return setError(form, 'exercises', INVALID_EXERCISES_MESSAGE);
			}
			exercises = parsed.data;
		}

		try {
			const { id: workoutId } = createWorkout(
				getDb(),
				user.id,
				toWorkoutFields(form.data, exercises)
			);

			logger.info('Workout logged', { workoutId, userId: user.id });
		} catch (error) {
			logger.error('Failed to log workout', error);
			return message(
				form,
				{
					type: 'error',
					text: 'Failed to log workout. Please try again.'
				},
				{ status: 500 }
			);
		}

		return message(form, { type: 'success', text: 'Workout logged.' });
	}),

	logMeal: writeAction({
		schema: logMealSchema,
		entityName: 'Food entry',
		verb: 'create',
		write: (data, { userId }) => createFoodEntry(getDb(), userId, toFoodEntryFields(data)).id
	}),

	/**
	 * Estimates a meal from a photo and/or note with the configured AI provider and returns it as
	 * the form's data. Nothing is saved: Log Food prefills its fields for review.
	 */
	estimateMeal: requireAuth(async (event, user) => {
		const emptyForm = await superValidate(zod4(mealEstimateResultSchema));
		const fail = (text: string, status: 400 | 413 | 422 | 429 | 502 | 503) =>
			message(emptyForm, { type: 'error', text }, { status });

		if (!isMealEstimateEnabled()) return fail('Food estimates are not set up.', 503);

		const limit = await estimateLimiter.check(event, { userId: user.id });
		if (limit.limited) {
			return fail(`Too many estimates. Try again in ${limit.retryAfter} seconds.`, 429);
		}

		let body: FormData;
		try {
			body = await event.request.formData();
		} catch (err) {
			// Bodies over adapter-node's BODY_SIZE_LIMIT (fly.toml) fail here, not in toAiImage.
			logger.warn('Meal photo upload unreadable', { userId: user.id, reason: String(err) });
			return fail('That photo is too large to upload. Try a smaller one.', 413);
		}

		const photo = body.get('photo');
		const noteValue = body.get('note');
		const note = typeof noteValue === 'string' ? noteValue.trim() : '';
		const hasPhoto = photo instanceof File && photo.size > 0;

		if (!hasPhoto && !note) return fail('Add a photo or describe what you ate first.', 400);
		if (note.length > MAX_MEAL_NOTE_LENGTH) {
			return fail(`Keep the description under ${MAX_MEAL_NOTE_LENGTH} characters.`, 400);
		}

		const image = hasPhoto ? await toAiImage(photo) : null;
		if (hasPhoto && !image) return fail('Upload a JPEG, PNG or WebP photo under 5 MB.', 400);

		try {
			const estimate = await estimateMeal({ image, note });
			const form = await superValidate(estimate, zod4(mealEstimateResultSchema));
			return message(form, {
				type: 'success',
				text: 'Food estimated. Check the details, then save.'
			});
		} catch (err) {
			if (err instanceof UnreadableMealError) {
				logger.warn('Meal estimate unreadable', { userId: user.id, reason: err.message });
				return fail("Couldn't estimate that food. Try a clearer photo or add a description.", 422);
			}
			logger.error('Meal estimate failed', err);
			return fail('Estimating failed. Try again, or enter the calories yourself.', 502);
		}
	}),

	setCalorieTarget: upsertSettingAction({
		schema: setCalorieTargetSchema,
		table: dailyCalorieTargets,
		entityName: 'Calorie target',
		toValues: (data) => ({ targetCalories: data.targetCalories, setDate: getTodayString() })
	}),

	createReminder: createAction({
		schema: workoutReminderSchema,
		table: workoutReminders,
		entityName: 'Workout reminder',
		toRow: toReminderRow
	}),

	updateReminder: updateAction({
		schema: updateWorkoutReminderSchema,
		table: workoutReminders,
		entityName: 'Workout reminder',
		toRow: toReminderRow,
		onSuccess: () => {
			throw redirect(303, '/fitness?tab=reminders&notice=reminder-disabled');
		}
	}),

	deleteReminder: deleteAction({
		schema: deleteEntrySchema,
		table: workoutReminders,
		entityName: 'Workout reminder',
		invalidMessage: 'Invalid workout reminder data',
		onSuccess: () => {
			throw redirect(303, '/fitness?tab=reminders&notice=reminder-deleted');
		}
	}),

	updateWeight: updateAction({
		schema: updateWeightSchema,
		table: weightEntries,
		entityName: 'Weigh-in',
		toRow: (data) => ({ date: data.date, time: data.time || null, weightLbs: data.weightLbs })
	}),

	deleteWeight: deleteAction({
		schema: deleteEntrySchema,
		table: weightEntries,
		entityName: 'Weigh-in',
		invalidMessage: 'Invalid weigh-in id'
	}),

	updateWorkout: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(updateWorkoutSchema));

		if (!form.valid) {
			return invalidForm(form);
		}

		let parsedExercises: WorkoutExerciseInput[] = [];
		if (form.data.type === 'strength' && form.data.exercises) {
			const parsed = parseWorkoutExercises(form.data.exercises);
			if (!parsed.success) {
				logger.warn('Invalid exercises in workout update', { userId: user.id });
				return setError(form, 'exercises', INVALID_EXERCISES_MESSAGE);
			}
			parsedExercises = parsed.data;
		}

		try {
			const updated = updateWorkout(
				getDb(),
				user.id,
				form.data.id,
				toWorkoutFields(form.data, parsedExercises)
			);

			if (!updated) {
				return message(form, { type: 'error', text: 'Workout not found.' }, { status: 404 });
			}

			logger.info('Workout updated', { workoutId: form.data.id, userId: user.id });
		} catch (error) {
			logger.error('Failed to update workout', error);
			return message(
				form,
				{ type: 'error', text: 'Failed to update workout. Please try again.' },
				{ status: 500 }
			);
		}

		return message(form, { type: 'success', text: 'Workout updated.' });
	}),

	deleteWorkout: deleteAction({
		schema: deleteEntrySchema,
		table: workoutLogs,
		entityName: 'Workout',
		invalidMessage: 'Invalid workout id'
	}),

	updateMeal: writeAction({
		schema: updateMealSchema,
		entityName: 'Food entry',
		verb: 'update',
		write: (data, { userId }) =>
			updateFoodEntry(getDb(), userId, data.id, toFoodEntryFields(data))?.id ?? null
	}),

	deleteMeal: deleteAction({
		schema: deleteEntrySchema,
		table: mealLogs,
		entityName: 'Food entry',
		invalidMessage: 'Invalid food entry id'
	})
} satisfies Actions;
