import {
	deleteTaskSchema,
	type TaskState,
	type UpdateTaskInput,
	updateTaskSchema
} from '$lib/schemas/task';
import { getUser, requireAuth } from '$lib/server/actions/auth-guard';
import {
	getOwnedEntityOrNull,
	getOwnedEntityOrThrow
} from '$lib/server/actions/edit-route-helpers';
import { invalidForm } from '$lib/server/actions/form-responses';
import { parseTaskTags, toCommaSeparatedJson } from '$lib/server/actions/string-parsers';
import { getDb } from '$lib/server/db';
import { tasks } from '$lib/server/db/schema';
import { withTimestampsForUpdate } from '$lib/server/db/utils';
import { logger } from '$lib/server/logger';
import { redirect } from '@sveltejs/kit';
import { and, eq, ne, sql } from 'drizzle-orm';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import type { Actions, PageServerLoad } from './$types';

function buildTaskUpdateData(
	formData: UpdateTaskInput,
	existingState: string
): Partial<typeof tasks.$inferInsert> {
	const updateData: Partial<typeof tasks.$inferInsert> = {
		...withTimestampsForUpdate()
	};

	if (formData.title !== undefined) updateData.title = formData.title;
	if (formData.description !== undefined) updateData.description = formData.description;
	if (formData.tags !== undefined) updateData.tags = toCommaSeparatedJson(formData.tags);
	if (formData.dueDate !== undefined) updateData.dueDate = formData.dueDate;
	if (formData.priority !== undefined) updateData.priority = formData.priority;

	if (formData.state !== undefined) {
		updateData.state = formData.state;
		if (formData.state === 'done' && existingState !== 'done') {
			updateData.completedAt = new Date();
		} else if (formData.state !== 'done' && existingState === 'done') {
			updateData.completedAt = null;
		}
	}

	return updateData;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const task = await getOwnedEntityOrThrow(
		() =>
			getDb().query.tasks.findFirst({
				where: and(eq(tasks.id, params.id), eq(tasks.userId, getUser(locals).id))
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
			state: task.state as TaskState,
			tags: tagsString
		},
		zod4(updateTaskSchema)
	);

	return {
		task,
		form
	};
};

export const actions = {
	update: requireAuth(async ({ request, params }, user) => {
		const taskId = params.id;

		const form = await superValidate(request, zod4(updateTaskSchema));

		if (!form.valid) {
			return invalidForm(form);
		}

		if (form.data.title) {
			const duplicate = await getDb().query.tasks.findFirst({
				where: and(
					eq(tasks.userId, user.id),
					eq(tasks.title, form.data.title),
					ne(tasks.id, taskId)
				)
			});
			if (duplicate) {
				return setError(form, 'title', 'A task with this name already exists.');
			}
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

			const nextState = (form.data.state ?? existing.state) as TaskState;

			if (nextState === existing.state) {
				const updateData = buildTaskUpdateData(form.data, existing.state);

				await getDb()
					.update(tasks)
					.set(updateData)
					.where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));
			} else {
				const timestamp = new Date();

				// The better-sqlite3 driver runs transaction callbacks synchronously, so every
				// query inside must use its sync execution method (`.all()`/`.run()`/`.sync()`)
				// instead of `await` — an `async` callback throws "Transaction function cannot
				// return a promise" at runtime.
				getDb().transaction((tx) => {
					const [targetSortOrderRow] = tx
						.select({
							maxSortOrder: sql<number>`coalesce(max(${tasks.sortOrder}), -1)`
						})
						.from(tasks)
						.where(and(eq(tasks.userId, user.id), eq(tasks.state, nextState)))
						.all();

					const sourceRows = tx.query.tasks
						.findMany({
							where: and(eq(tasks.userId, user.id), eq(tasks.state, existing.state as TaskState)),
							columns: { id: true },
							orderBy: [tasks.sortOrder, tasks.taskNumber]
						})
						.sync();

					const sourceTaskIds = sourceRows
						.map((row) => row.id)
						.filter((sourceTaskId) => sourceTaskId !== taskId);

					const updateData = buildTaskUpdateData(
						{
							...form.data,
							state: nextState
						},
						existing.state
					);

					tx.update(tasks)
						.set({
							...updateData,
							sortOrder: (targetSortOrderRow?.maxSortOrder ?? -1) + 1,
							updatedAt: timestamp
						})
						.where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
						.run();

					for (let index = 0; index < sourceTaskIds.length; index += 1) {
						tx.update(tasks)
							.set({
								sortOrder: index,
								updatedAt: timestamp
							})
							.where(and(eq(tasks.id, sourceTaskIds[index]), eq(tasks.userId, user.id)))
							.run();
					}
				});
			}

			logger.info('Task updated', { taskId, userId: user.id });
		} catch (error) {
			logger.error('Failed to update task', error, { taskId });
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
		} catch (error) {
			logger.error('Failed to delete task', error, { taskId });
			return message(form, { type: 'error', text: 'Failed to delete task' }, { status: 500 });
		}

		throw redirect(303, '/tasks');
	})
} satisfies Actions;
