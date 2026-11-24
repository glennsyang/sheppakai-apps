import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { deleteTaskSchema, updateTaskSchema } from '#lib/schemas/task.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import {
	getOwnedEntityOrNull,
	getOwnedEntityOrThrow
} from '#lib/server/actions/edit-route-helpers.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { parseTaskTags, splitCommaSeparated } from '#lib/server/actions/string-parsers.js';
import { getDb } from '#lib/server/db/index.js';
import { tasks } from '#lib/server/db/schema/index.js';
import { logger } from '#lib/server/logger.js';
import { updateTask } from '#lib/server/tasks/task.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const userId = getUser(locals).id;

	try {
		const task = await getOwnedEntityOrThrow(
			() =>
				getDb().query.tasks.findFirst({
					where: and(eq(tasks.id, params.id), eq(tasks.userId, userId))
				}),
			{ type: 'redirect', to: '/tasks' }
		);

		// Parse JSON fields for form
		const tagsString = (parseTaskTags(task.tags) ?? []).join(', ');

		// Prepare form data
		const form = await superValidate(
			{
				title: task.title,
				description: task.description ?? undefined,
				priority: task.priority,
				dueDate: task.dueDate ?? undefined,
				state: task.state,
				tags: tagsString
			},
			zod4(updateTaskSchema)
		);

		return {
			task,
			form
		};
	} catch (err) {
		if (isHttpError(err) || isRedirect(err)) throw err;
		logger.error('Failed to load task for editing', err, { taskId: params.id, userId });
		throw error(500, 'Failed to load task');
	}
};

export const actions = {
	update: requireAuth(async ({ request, params }, user) => {
		const taskId = params.id;

		const form = await superValidate(request, zod4(updateTaskSchema));

		if (!form.valid) {
			return invalidForm(form);
		}

		try {
			const { tags, ...fields } = form.data;
			const result = updateTask(getDb(), user.id, taskId, {
				...fields,
				...(tags !== undefined && { tags: splitCommaSeparated(tags) })
			});

			if (!result.ok && result.reason === 'duplicate_title') {
				return setError(form, 'title', 'A task with this name already exists.');
			}
			if (!result.ok) {
				return message(form, { type: 'error', text: 'Task not found' }, { status: 404 });
			}

			logger.info('Task updated', { taskId, userId: user.id });
		} catch (err) {
			logger.error('Failed to update task', err, { taskId });
			return message(form, { type: 'error', text: 'Failed to update task' }, { status: 500 });
		}

		throw redirect(303, '/tasks');
	}),

	delete: requireAuth(async ({ request, params }, user) => {
		const taskId = params.id;
		const form = await superValidate(request, zod4(deleteTaskSchema));

		if (!form.valid || form.data.id !== taskId) {
			return message(form, { type: 'error', text: 'Invalid task id' }, { status: 400 });
		}

		try {
			const existing = await getOwnedEntityOrNull(() =>
				getDb().query.tasks.findFirst({
					where: and(eq(tasks.id, taskId), eq(tasks.userId, user.id))
				})
			);

			if (!existing) {
				return message(form, { type: 'error', text: 'Task not found' }, { status: 404 });
			}

			await getDb()
				.delete(tasks)
				.where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));

			logger.info('Task deleted', { taskId, taskNumber: existing.taskNumber, userId: user.id });
		} catch (err) {
			logger.error('Failed to delete task', err, { taskId });
			return message(form, { type: 'error', text: 'Failed to delete task' }, { status: 500 });
		}

		throw redirect(303, '/tasks');
	})
} satisfies Actions;
