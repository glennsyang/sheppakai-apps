import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { and, desc, eq, or } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { noFieldsSchema } from '#lib/schemas/common.js';
import {
	completeSessionSchema,
	editSessionSchema,
	scheduleSchema,
	updateRoutineSchema
} from '#lib/schemas/meditation.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import {
	handleDeleteSession,
	handleUpdateSession
} from '#lib/server/actions/meditation-session-actions.js';
import { splitCommaSeparated } from '#lib/server/actions/string-parsers.js';
import { getDb } from '#lib/server/db/index.js';
import {
	meditationRoutines,
	meditationSchedules,
	meditationSessions
} from '#lib/server/db/schema/index.js';
import {
	generateId,
	withTimestampsForCreate,
	withTimestampsForUpdate
} from '#lib/server/db/utils.js';
import { numberListSchema, stringListSchema, safeParse } from '#lib/server/json.js';
import { logger } from '#lib/server/logger.js';
import { parseAppDateTime } from '#lib/utils/date.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = getUser(locals).id;

	try {
		const db = getDb();

		// Fetch routine
		const routine = await db.query.meditationRoutines.findFirst({
			where: and(
				eq(meditationRoutines.id, params.id),
				or(eq(meditationRoutines.userId, userId), eq(meditationRoutines.isPredefined, true))
			)
		});

		// The query only matches the user's own or predefined routines, so anything else is a 404.
		if (!routine) {
			throw error(404, 'Routine not found');
		}

		// Fetch schedule for this routine (if exists)
		const schedule = await db.query.meditationSchedules.findFirst({
			where: and(
				eq(meditationSchedules.routineId, params.id),
				eq(meditationSchedules.userId, userId)
			)
		});

		// Fetch sessions for this routine
		const sessions = await db.query.meditationSessions.findMany({
			where: and(
				eq(meditationSessions.routineId, params.id),
				eq(meditationSessions.userId, userId)
			),
			orderBy: [desc(meditationSessions.completedAt)],
			limit: 20
		});

		// Parse JSON fields
		const parsedRoutine = {
			...routine,
			moodTags: safeParse(routine.moodTags, stringListSchema, [], 'meditationRoutine.moodTags')
		};

		const parsedSchedule = schedule
			? {
					...schedule,
					daysOfWeek: safeParse(
						schedule.daysOfWeek,
						numberListSchema,
						null,
						'meditationSchedule.daysOfWeek'
					)
				}
			: null;

		// Initialize forms
		const scheduleForm = schedule
			? await superValidate(
					{
						cadence: schedule.cadence,
						days_of_week: schedule.daysOfWeek || '',
						time: schedule.time
					},
					zod4(scheduleSchema)
				)
			: await superValidate(zod4(scheduleSchema));

		const sessionForm = await superValidate(zod4(completeSessionSchema));

		const editSessionForm = await superValidate(zod4(editSessionSchema));

		const updateForm = await superValidate(
			{
				title: routine.title,
				description: routine.description || '',
				link_url: routine.linkUrl,
				duration_minutes: routine.durationMinutes,
				mood_tags: parsedRoutine.moodTags.join(', ')
			},
			zod4(updateRoutineSchema)
		);

		return {
			routine: parsedRoutine,
			schedule: parsedSchedule,
			sessions,
			scheduleForm,
			sessionForm,
			editSessionForm,
			updateForm
		};
	} catch (err) {
		if (isHttpError(err) || isRedirect(err)) {
			throw err;
		}
		logger.error('Failed to load meditation routine', err);
		throw error(500, 'Failed to load routine');
	}
};

export const actions = {
	createSchedule: requireAuth(async ({ request, locals, params }, user) => {
		const form = await superValidate(request, zod4(scheduleSchema));
		const routineId = params.id;

		if (!form.valid) {
			logger.warn('Invalid schedule form data', { errors: form.errors });
			return invalidForm(form);
		}

		if (!routineId) {
			logger.warn('Missing routine ID in createSchedule action', { userId: user.id });
			return invalidForm(form);
		}

		try {
			const db = getDb();

			// Verify the routine exists and is accessible before writing a schedule for it
			const routine = await db.query.meditationRoutines.findFirst({
				where: and(
					eq(meditationRoutines.id, routineId),
					or(eq(meditationRoutines.userId, user.id), eq(meditationRoutines.isPredefined, true))
				)
			});

			if (!routine) {
				return message(form, { type: 'error', text: 'Routine not found' }, { status: 404 });
			}

			// Parse days_of_week if provided (stored as JSON array string e.g. "[0,1,6]")
			const daysOfWeekJson = form.data.days_of_week
				? JSON.stringify(
						safeParse(form.data.days_of_week, numberListSchema, [], 'form.days_of_week')
							.filter((d) => !Number.isNaN(d) && d >= 0 && d <= 6)
							.sort((a, b) => a - b)
					)
				: null;

			// Check if schedule already exists
			const existingSchedule = await db.query.meditationSchedules.findFirst({
				where: and(
					eq(meditationSchedules.routineId, routineId),
					eq(meditationSchedules.userId, user.id)
				)
			});

			if (existingSchedule) {
				// Update existing schedule
				await db
					.update(meditationSchedules)
					.set({
						cadence: form.data.cadence,
						daysOfWeek: daysOfWeekJson,
						time: form.data.time,
						enabled: true,
						...withTimestampsForUpdate()
					})
					.where(eq(meditationSchedules.id, existingSchedule.id));

				logger.info('Meditation schedule updated', {
					scheduleId: existingSchedule.id,
					userId: getUser(locals).id
				});
			} else {
				// Create new schedule
				const scheduleId = generateId();

				await db.insert(meditationSchedules).values({
					id: scheduleId,
					userId: getUser(locals).id,
					routineId,
					cadence: form.data.cadence,
					daysOfWeek: daysOfWeekJson,
					time: form.data.time,
					enabled: true,
					...withTimestampsForCreate()
				});

				logger.info('Meditation schedule created', {
					scheduleId,
					userId: getUser(locals).id
				});
			}

			return message(form, {
				type: 'success',
				text: 'Schedule saved successfully!'
			});
		} catch (err) {
			logger.error('Failed to create/update schedule', err);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while saving the schedule. Please try again.'
				},
				{ status: 500 }
			);
		}
	}),

	deleteSchedule: requireAuth(async ({ request, params }, user) => {
		const routineId = params.id;
		const form = await superValidate(request, zod4(noFieldsSchema));

		if (!routineId) {
			logger.warn('Missing routine ID in deleteSchedule action', { userId: user.id });
			return message(form, { type: 'error', text: 'Routine ID is required' }, { status: 400 });
		}

		try {
			const db = getDb();

			await db
				.delete(meditationSchedules)
				.where(
					and(eq(meditationSchedules.routineId, routineId), eq(meditationSchedules.userId, user.id))
				);

			logger.info('Meditation schedule deleted', {
				routineId: routineId,
				userId: user.id
			});
			return message(form, { type: 'success', text: 'Schedule deleted.' });
		} catch (err) {
			logger.error('Failed to delete schedule', err);
			return message(form, { type: 'error', text: 'Failed to delete schedule' }, { status: 500 });
		}
	}),

	completeSession: requireAuth(async ({ request, params }, user) => {
		const routineId = params.id;
		const form = await superValidate(request, zod4(completeSessionSchema));

		if (!form.valid) {
			logger.warn('Invalid session form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			const db = getDb();

			// Verify the routine exists and is accessible before logging a session against it
			const routine = await db.query.meditationRoutines.findFirst({
				where: and(
					eq(meditationRoutines.id, routineId),
					or(eq(meditationRoutines.userId, user.id), eq(meditationRoutines.isPredefined, true))
				)
			});

			if (!routine) {
				return message(form, { type: 'error', text: 'Routine not found' }, { status: 404 });
			}

			const sessionId = generateId();

			await db.insert(meditationSessions).values({
				id: sessionId,
				userId: user.id,
				routineId: routineId,
				completedAt: parseAppDateTime(form.data.completed_at),
				preMoodRating: form.data.pre_mood_rating || null,
				moodRating: form.data.mood_rating || null,
				notes: form.data.notes || null,
				...withTimestampsForCreate()
			});

			logger.info('Meditation session completed', {
				sessionId,
				userId: user.id
			});
			return message(form, {
				type: 'success',
				text: 'Session logged successfully!'
			});
		} catch (err) {
			logger.error('Failed to complete session', err);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while logging the session. Please try again.'
				},
				{ status: 500 }
			);
		}
	}),

	updateRoutine: requireAuth(async ({ request, params }, user) => {
		const routineId = params.id;
		const form = await superValidate(request, zod4(updateRoutineSchema));

		if (!form.valid) {
			logger.warn('Invalid update routine form data', { errors: form.errors });
			return invalidForm(form);
		}

		try {
			const db = getDb();

			// Check if routine exists and user owns it
			const routine = await db.query.meditationRoutines.findFirst({
				where: and(eq(meditationRoutines.id, routineId), eq(meditationRoutines.userId, user.id))
			});

			if (!routine) {
				return message(form, { type: 'error', text: 'Routine not found' }, { status: 404 });
			}

			if (routine.isPredefined || routine.userId !== user.id) {
				return message(form, { type: 'error', text: 'Cannot edit this routine' }, { status: 403 });
			}

			// Parse mood tags
			const moodTagsJson = JSON.stringify(splitCommaSeparated(form.data.mood_tags));

			await db
				.update(meditationRoutines)
				.set({
					title: form.data.title,
					description: form.data.description || null,
					linkUrl: form.data.link_url,
					durationMinutes: form.data.duration_minutes,
					moodTags: moodTagsJson,
					...withTimestampsForUpdate()
				})
				.where(and(eq(meditationRoutines.id, routineId), eq(meditationRoutines.userId, user.id)));

			logger.info('Meditation routine updated', {
				routineId: routineId,
				userId: user.id
			});
			return message(form, {
				type: 'success',
				text: 'Routine updated successfully!'
			});
		} catch (err) {
			logger.error('Failed to update routine', err);
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while updating the routine. Please try again.'
				},
				{ status: 500 }
			);
		}
	}),

	updateSession: requireAuth(async ({ request }, user) => handleUpdateSession(request, user.id)),

	deleteSession: requireAuth(async ({ request }, user) => handleDeleteSession(request, user.id)),

	deleteRoutine: requireAuth(async ({ request, params }, user) => {
		const routineId = params.id;
		const form = await superValidate(request, zod4(noFieldsSchema));

		try {
			const db = getDb();

			// Check if routine exists and user owns it
			const routine = await db.query.meditationRoutines.findFirst({
				where: and(eq(meditationRoutines.id, routineId), eq(meditationRoutines.userId, user.id))
			});

			if (!routine) {
				return message(form, { type: 'error', text: 'Routine not found' }, { status: 404 });
			}

			if (routine.isPredefined || routine.userId !== user.id) {
				return message(
					form,
					{ type: 'error', text: 'Cannot delete this routine' },
					{ status: 403 }
				);
			}

			await db
				.delete(meditationRoutines)
				.where(
					and(
						eq(meditationRoutines.id, routineId),
						eq(meditationRoutines.userId, user.id),
						eq(meditationRoutines.isPredefined, false)
					)
				);

			logger.info('Meditation routine deleted', {
				routineId: routineId,
				userId: user.id
			});
		} catch (err) {
			logger.error('Failed to delete routine', err);
			return message(form, { type: 'error', text: 'Failed to delete routine' }, { status: 500 });
		}

		throw redirect(303, '/meditation');
	})
} satisfies Actions;
