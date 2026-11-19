import { toAiImage } from '@sheppakai/shared/ai-vision';
import { redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
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
import { createAction, deleteAction, updateAction } from '#lib/server/actions/crud-helpers.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { getDb } from '#lib/server/db/index.js';
import {
	dailyCalorieTargets,
	goalWeights,
	mealLogs,
	weightEntries,
	workoutExercises,
	workoutLogs,
	workoutReminders
} from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';
import { upsertUserSettings } from '#lib/server/db/writes/user-settings.js';
import { logger } from '#lib/server/logger.js';
import {
	estimateMeal,
	isMealEstimateEnabled,
	MAX_MEAL_NOTE_LENGTH,
	UnreadableMealError
} from '#lib/server/meal-estimate/index.js';
import { createUserRateLimiter } from '#lib/server/rate-limiter.js';
import { getTodayString } from '#lib/utils/date.js';

import type { Actions, PageServerLoad } from './$types';

const estimateLimiter = createUserRateLimiter([30, 'h']);

const INVALID_EXERCISES_MESSAGE = `Exercises are invalid. Each needs a name (max 100 characters) and positive whole numbers, up to ${MAX_WORKOUT_EXERCISES} exercises.`;

// Columns shared by the log and update actions for each entry type.
const toMealRow = (data: z.infer<typeof logMealSchema>) => ({
	date: data.date,
	timeOfDay: data.timeOfDay,
	description: data.description,
	caloriesEstimate: data.caloriesEstimate || null
});

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

		// Load meals (limited to recent)
		const meals = await db.query.mealLogs.findMany({
			where: eq(mealLogs.userId, userId),
			orderBy: [desc(mealLogs.date)],
			limit: 50
		});

		// Load calorie target
		const calorieTarget = await db.query.dailyCalorieTargets.findFirst({
			where: eq(dailyCalorieTargets.userId, userId)
		});

		// Load workout reminders
		const reminders = await db.query.workoutReminders.findMany({
			where: eq(workoutReminders.userId, userId),
			orderBy: [desc(workoutReminders.createdAt)]
		});

		// Calculate weight stats
		const currentWeight = weights.length > 0 ? weights[0].weightLbs : null;
		const startWeight = weights.length > 0 ? weights[weights.length - 1].weightLbs : null;
		const remainingToGoal =
			currentWeight && goalWeight ? currentWeight - goalWeight.targetWeightLbs : null;

		// Calculate trend (simple comparison of last 2 entries)
		let trend: 'up' | 'down' | 'stable' = 'stable';
		if (weights.length >= 2) {
			const diff = weights[0].weightLbs - weights[1].weightLbs;
			if (diff < -0.5) trend = 'down';
			else if (diff > 0.5) trend = 'up';
		}

		return {
			tab,
			mealEstimateEnabled: isMealEstimateEnabled(),
			reminders,
			weightEntries: weights,
			goalWeight,
			workouts,
			meals,
			calorieTarget,
			weightStats: {
				currentWeight,
				startWeight,
				remainingToGoal,
				trend
			},
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
			calorieTarget: null,
			weightStats: {
				currentWeight: null,
				startWeight: null,
				remainingToGoal: null,
				trend: 'stable'
			},
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
		entityName: 'Weight entry',
		toRow: (data) => ({ date: data.date, time: data.time || null, weightLbs: data.weightLbs })
	}),

	setGoal: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(setGoalWeightSchema));

		if (!form.valid) {
			logger.warn('Invalid goal weight form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			await upsertUserSettings(goalWeights, user.id, {
				targetWeightLbs: form.data.targetWeightLbs,
				setDate: getTodayString()
			});

			logger.info('Goal weight set', { userId: user.id });
		} catch (error) {
			logger.error('Failed to set goal weight', error);
			return message(
				form,
				{
					type: 'error',
					text: 'Failed to set goal weight. Please try again.'
				},
				{ status: 500 }
			);
		}

		return message(form, { type: 'success', text: 'Goal weight set.' });
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
			const db = getDb();
			const workoutId = generateId();
			// One timestamp for the workout log and its exercises
			const now = new Date();

			// The better-sqlite3 driver runs transaction callbacks synchronously, so every
			// query inside must use `.run()` instead of `await`.
			db.transaction((tx) => {
				tx.insert(workoutLogs)
					.values({
						id: workoutId,
						userId: user.id,
						date: form.data.date,
						time: form.data.time || null,
						type: form.data.type,
						durationMinutes: form.data.durationMinutes || null,
						steps: form.data.steps || null,
						notes: form.data.notes || null,
						...withTimestampsForCreate(now)
					})
					.run();

				if (exercises.length > 0) {
					tx.insert(workoutExercises)
						.values(
							exercises.map((exercise) => ({
								id: generateId(),
								workoutLogId: workoutId,
								exerciseName: exercise.exerciseName,
								sets: exercise.sets || null,
								reps: exercise.reps || null,
								weightLbs: exercise.weightLbs || null,
								...withTimestampsForCreate(now)
							}))
						)
						.run();
				}
			});

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

	logMeal: createAction({
		schema: logMealSchema,
		table: mealLogs,
		entityName: 'Meal',
		toRow: toMealRow
	}),

	/**
	 * Estimates a meal from a photo and/or note with the configured AI provider and returns it as
	 * the form's data. Nothing is saved: Log Meal prefills its fields for review.
	 */
	estimateMeal: requireAuth(async (event, user) => {
		const emptyForm = await superValidate(zod4(mealEstimateResultSchema));
		const fail = (text: string, status: 400 | 413 | 422 | 429 | 502 | 503) =>
			message(emptyForm, { type: 'error', text }, { status });

		if (!isMealEstimateEnabled()) return fail('Meal estimates are not set up.', 503);

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

		if (!hasPhoto && !note) return fail('Add a photo or describe the meal first.', 400);
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
				text: 'Meal estimated. Check the details, then save.'
			});
		} catch (err) {
			if (err instanceof UnreadableMealError) {
				logger.warn('Meal estimate unreadable', { userId: user.id, reason: err.message });
				return fail("Couldn't estimate that meal. Try a clearer photo or add a description.", 422);
			}
			logger.error('Meal estimate failed', err);
			return fail('Estimating failed. Try again, or enter the calories yourself.', 502);
		}
	}),

	setCalorieTarget: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(setCalorieTargetSchema));

		if (!form.valid) {
			logger.warn('Invalid calorie target form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			await upsertUserSettings(dailyCalorieTargets, user.id, {
				targetCalories: form.data.targetCalories,
				setDate: getTodayString()
			});

			logger.info('Calorie target set', { userId: user.id });
		} catch (error) {
			logger.error('Failed to set calorie target', error);
			return message(
				form,
				{
					type: 'error',
					text: 'Failed to set calorie target. Please try again.'
				},
				{ status: 500 }
			);
		}

		return message(form, { type: 'success', text: 'Calorie target set.' });
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
		entityName: 'Weight entry',
		toRow: (data) => ({ date: data.date, time: data.time || null, weightLbs: data.weightLbs })
	}),

	deleteWeight: deleteAction({
		schema: deleteEntrySchema,
		table: weightEntries,
		entityName: 'Weight entry',
		invalidMessage: 'Invalid weight entry id'
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
			const db = getDb();
			const existing = await db.query.workoutLogs.findFirst({
				where: and(eq(workoutLogs.id, form.data.id), eq(workoutLogs.userId, user.id))
			});

			if (!existing) {
				return message(form, { type: 'error', text: 'Workout not found.' }, { status: 404 });
			}

			// One timestamp for the workout log and its exercises
			const now = new Date();

			// The better-sqlite3 driver runs transaction callbacks synchronously, so every
			// query inside must use its sync execution method (`.run()`) instead of `await`
			// — an `async` callback throws "Transaction function cannot return a promise"
			// at runtime.
			db.transaction((tx) => {
				tx.update(workoutLogs)
					.set({
						date: form.data.date,
						time: form.data.time || null,
						type: form.data.type,
						durationMinutes: form.data.durationMinutes || null,
						steps: form.data.steps || null,
						notes: form.data.notes || null,
						...withTimestampsForUpdate(now)
					})
					.where(and(eq(workoutLogs.id, form.data.id), eq(workoutLogs.userId, user.id)))
					.run();

				tx.delete(workoutExercises).where(eq(workoutExercises.workoutLogId, form.data.id)).run();

				if (form.data.type === 'strength' && parsedExercises.length > 0) {
					tx.insert(workoutExercises)
						.values(
							parsedExercises.map((exercise) => ({
								id: generateId(),
								workoutLogId: form.data.id,
								exerciseName: exercise.exerciseName,
								sets: exercise.sets || null,
								reps: exercise.reps || null,
								weightLbs: exercise.weightLbs || null,
								...withTimestampsForCreate(now)
							}))
						)
						.run();
				}
			});

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

	updateMeal: updateAction({
		schema: updateMealSchema,
		table: mealLogs,
		entityName: 'Meal',
		toRow: toMealRow
	}),

	deleteMeal: deleteAction({
		schema: deleteEntrySchema,
		table: mealLogs,
		entityName: 'Meal',
		invalidMessage: 'Invalid meal id'
	})
} satisfies Actions;
