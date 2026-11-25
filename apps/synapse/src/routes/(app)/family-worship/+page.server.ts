import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { z } from 'zod';

import { idSchema } from '#lib/schemas/common.js';
import {
	topicQueueOrderSchema,
	topicSchema,
	updateTopicSchema,
	usualWeekdaySchema
} from '#lib/schemas/family-worship.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { writeAction } from '#lib/server/actions/crud-helpers.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { getDb } from '#lib/server/db/index.js';
import {
	archiveTopic,
	createTopic,
	deleteTopic,
	getArchivedTopics,
	getTopicQueue,
	getUsualWeekday,
	reorderTopicQueue,
	restoreTopic,
	setUsualWeekday,
	type TopicFields,
	updateTopic
} from '#lib/server/family-worship/family-worship.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

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

	try {
		const db = getDb();
		const usualWeekday = await getUsualWeekday(db, userId);
		const usualWeekdayForm = await superValidate({ usualWeekday }, zod4(usualWeekdaySchema));

		return {
			topicQueue: getTopicQueue(db, userId),
			archivedTopics: getArchivedTopics(db, userId),
			topicForm,
			editTopicForm,
			usualWeekdayForm
		};
	} catch (error) {
		logger.error('Failed to load Family Worship', error, { userId });
		return {
			topicQueue: [],
			archivedTopics: [],
			topicForm,
			editTopicForm,
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
