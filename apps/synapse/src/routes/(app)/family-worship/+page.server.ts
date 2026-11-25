import { type Infer, message, superValidate } from 'sveltekit-superforms';
import { zod4, type ZodValidationSchema } from 'sveltekit-superforms/adapters';
import type { z } from 'zod';

import { idSchema } from '#lib/schemas/common.js';
import {
	planWeekSchema,
	sessionSchema,
	skipWeekSchema,
	topicQueueOrderSchema,
	topicSchema,
	updateSessionSchema,
	updateTopicSchema,
	usualWeekdaySchema,
	weekSchema
} from '#lib/schemas/family-worship.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { writeAction } from '#lib/server/actions/crud-helpers.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { getDb } from '#lib/server/db/index.js';
import {
	archiveTopic,
	clearWeek,
	createTopic,
	deleteSession,
	deleteTopic,
	getArchivedTopics,
	getPlan,
	getTopicQueue,
	getUsualWeekday,
	logSession,
	planWeek,
	reorderTopicQueue,
	restoreTopic,
	setUsualWeekday,
	skipWeek,
	type TopicFields,
	unskipWeek,
	type WeekResult,
	updateSession,
	updateTopic
} from '#lib/server/family-worship/family-worship.js';
import { logger } from '#lib/server/logger.js';
import { getTodayString } from '#lib/utils/date.js';

import type { Actions, PageServerLoad } from './$types';
import { sessionFailure, weekFailure } from './session-responses';

/** A one-tap week action (plan, clear, skip, unskip) answering with a message either way. */
function weekAction<S extends ZodValidationSchema>(
	schema: S,
	failureVerb: string,
	successText: string,
	write: (db: ReturnType<typeof getDb>, userId: string, data: Infer<S, 'zod4'>) => WeekResult
) {
	return requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(schema));
		if (!form.valid) return invalidForm(form);

		try {
			const result = write(getDb(), user.id, form.data);
			if (!result.ok) return weekFailure(form, result.reason);
			return message(form, { type: 'success', text: successText });
		} catch (error) {
			logger.error(`Failed to ${failureVerb}`, error, { userId: user.id });
			return message(
				form,
				{ type: 'error', text: `Failed to ${failureVerb}. Please try again.` },
				{ status: 500 }
			);
		}
	});
}

const toTopicFields = (data: z.infer<typeof topicSchema>): TopicFields => ({
	title: data.title,
	description: data.description,
	notes: data.notes || null,
	scriptureReferences: data.scriptureReferences || null,
	publicationLinks: data.publicationLinks.map(({ label, url }) =>
		label ? { label, url } : { url }
	)
});

export const load: PageServerLoad = async ({ locals }) => {
	const userId = getUser(locals).id;
	const topicForm = await superValidate(zod4(topicSchema));
	const editTopicForm = await superValidate(zod4(updateTopicSchema));
	const sessionForm = await superValidate(zod4(sessionSchema));
	const editSessionForm = await superValidate(zod4(updateSessionSchema));
	const today = getTodayString();

	try {
		const db = getDb();
		const usualWeekday = await getUsualWeekday(db, userId);
		const usualWeekdayForm = await superValidate({ usualWeekday }, zod4(usualWeekdaySchema));

		return {
			today,
			plan: getPlan(db, userId, { today }),
			topicQueue: getTopicQueue(db, userId),
			archivedTopics: getArchivedTopics(db, userId),
			topicForm,
			editTopicForm,
			sessionForm,
			editSessionForm,
			usualWeekdayForm
		};
	} catch (error) {
		logger.error('Failed to load Family Worship', error, { userId });
		return {
			today,
			plan: [],
			topicQueue: [],
			archivedTopics: [],
			topicForm,
			editTopicForm,
			sessionForm,
			editSessionForm,
			usualWeekdayForm: await superValidate(zod4(usualWeekdaySchema)),
			loadError: 'Failed to load Family Worship. Please try refreshing the page.'
		};
	}
};

export const actions = {
	logTopic: writeAction({
		schema: topicSchema,
		entityName: 'Topic',
		verb: 'create',
		write: (data, { userId }) => createTopic(getDb(), userId, toTopicFields(data)).id
	}),

	updateTopic: writeAction({
		schema: updateTopicSchema,
		entityName: 'Topic',
		verb: 'update',
		write: (data, { userId }) => {
			const result = updateTopic(getDb(), userId, data.id, toTopicFields(data));
			return result.ok ? result.topic.id : null;
		}
	}),

	archiveTopic: writeAction({
		schema: idSchema,
		entityName: 'Topic',
		verb: 'update',
		write: (data, { userId }) => (archiveTopic(getDb(), userId, data.id).ok ? data.id : null),
		onSuccess: (form) => message(form, { type: 'success', text: 'Topic archived.' })
	}),

	restoreTopic: writeAction({
		schema: idSchema,
		entityName: 'Topic',
		verb: 'update',
		write: (data, { userId }) => (restoreTopic(getDb(), userId, data.id).ok ? data.id : null),
		onSuccess: (form) =>
			message(form, { type: 'success', text: 'Topic restored to the back of the queue.' })
	}),

	deleteTopic: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(idSchema));
		if (!form.valid) return invalidForm(form);

		try {
			const result = deleteTopic(getDb(), user.id, form.data.id);
			if (!result.ok && result.reason === 'not_found') {
				return message(form, { type: 'error', text: 'Topic not found.' }, { status: 404 });
			}
			if (!result.ok) {
				return message(
					form,
					{
						type: 'error',
						text: 'This topic has sessions, so it can’t be deleted. Archive it instead.'
					},
					{ status: 409 }
				);
			}

			logger.info('Topic deleted', { id: form.data.id, userId: user.id });
			return message(form, { type: 'success', text: 'Topic deleted.' });
		} catch (error) {
			logger.error('Failed to delete topic', error, { userId: user.id });
			return message(
				form,
				{ type: 'error', text: 'Failed to delete topic. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	reorderTopicQueue: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(topicQueueOrderSchema));
		if (!form.valid) return invalidForm(form);

		try {
			const result = reorderTopicQueue(getDb(), user.id, form.data.topicIds);
			if (!result.ok) {
				return message(
					form,
					{ type: 'error', text: 'The Topic Queue changed elsewhere. Reload and try again.' },
					{ status: 409 }
				);
			}

			return message(form, { type: 'success', text: 'Topic Queue saved.' });
		} catch (error) {
			logger.error('Failed to reorder Topic Queue', error, { userId: user.id });
			return message(
				form,
				{ type: 'error', text: 'Failed to save the Topic Queue. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	planWeek: weekAction(planWeekSchema, 'plan the week', 'Week planned.', (db, userId, data) =>
		planWeek(db, userId, data.weekStart, data.topicId)
	),

	clearWeek: weekAction(weekSchema, 'clear the week', 'Week cleared.', (db, userId, data) =>
		clearWeek(db, userId, data.weekStart)
	),

	skipWeek: weekAction(
		skipWeekSchema,
		'skip the week',
		'Week marked as skipped.',
		(db, userId, data) => skipWeek(db, userId, data.weekStart, data.reason || null)
	),

	unskipWeek: weekAction(weekSchema, 'undo the skip', 'Skip undone.', (db, userId, data) =>
		unskipWeek(db, userId, data.weekStart)
	),

	logSession: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(sessionSchema));
		if (!form.valid) return invalidForm(form);

		try {
			const { date, topicId, note, confirmUnskip, continueNextWeek, nextWeekConflict } = form.data;
			const result = logSession(getDb(), user.id, {
				date,
				topicId,
				note: note || null,
				confirmUnskip,
				continueNextWeek,
				nextWeekConflict: nextWeekConflict || undefined
			});
			if (!result.ok) return sessionFailure(form, result);

			logger.info('Family Worship Session logged', { id: result.sessionId, userId: user.id });
			return message(form, { type: 'success', text: 'Session logged.' });
		} catch (error) {
			logger.error('Failed to log Family Worship Session', error, { userId: user.id });
			return message(
				form,
				{ type: 'error', text: 'Failed to log the session. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	updateSession: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(updateSessionSchema));
		if (!form.valid) return invalidForm(form);

		try {
			const { id, date, topicId, note, confirmUnskip } = form.data;
			const result = updateSession(getDb(), user.id, id, {
				date,
				topicId,
				note: note || null,
				confirmUnskip
			});
			if (!result.ok) return sessionFailure(form, result);

			logger.info('Family Worship Session updated', { id, userId: user.id });
			return message(form, { type: 'success', text: 'Session updated.' });
		} catch (error) {
			logger.error('Failed to update Family Worship Session', error, { userId: user.id });
			return message(
				form,
				{ type: 'error', text: 'Failed to update the session. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	deleteSession: writeAction({
		schema: idSchema,
		entityName: 'Session',
		verb: 'update',
		write: (data, { userId }) => (deleteSession(getDb(), userId, data.id).ok ? data.id : null),
		onSuccess: (form) => message(form, { type: 'success', text: 'Session deleted.' })
	}),

	setUsualWeekday: writeAction({
		schema: usualWeekdaySchema,
		entityName: 'Usual Weekday',
		verb: 'set',
		write: async (data, { userId }) => {
			await setUsualWeekday(getDb(), userId, data.usualWeekday);
			return userId;
		}
	})
} satisfies Actions;
