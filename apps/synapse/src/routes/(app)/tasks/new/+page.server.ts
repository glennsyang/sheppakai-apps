import { redirect } from '@sveltejs/kit';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { createTaskSchema, type TaskState, TaskStateEnum } from '#lib/schemas/task.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { splitCommaSeparated } from '#lib/server/actions/string-parsers.js';
import { getDb } from '#lib/server/db/index.js';
import { logger } from '#lib/server/logger.js';
import { createTask } from '#lib/server/tasks/task.js';

import type { Actions, PageServerLoad } from './$types';

function getInitialTaskState(rawState: string | null): TaskState {
	const parsedState = TaskStateEnum.safeParse(rawState);
	return parsedState.success ? parsedState.data : 'new';
}

export const load: PageServerLoad = async ({ url }) => {
	const form = await superValidate(
		{
			priority: 2,
			state: getInitialTaskState(url.searchParams.get('state'))
		},
		zod4(createTaskSchema)
	);

	return { form };
};

export const actions = {
	default: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(createTaskSchema));

		if (!form.valid) {
			return invalidForm(form);
		}

		try {
			const result = createTask(getDb(), user.id, {
				title: form.data.title,
				description: form.data.description || null,
				tags: splitCommaSeparated(form.data.tags),
				dueDate: form.data.dueDate || null,
				priority: form.data.priority,
				state: form.data.state
			});

			if (!result.ok) {
				return setError(form, 'title', 'A task with this name already exists.');
			}
			const newTask = result.task;

			logger.info('Task created', {
				taskId: newTask.id,
				taskNumber: newTask.taskNumber,
				userId: user.id
			});
		} catch (error) {
			logger.error('Failed to create task', error, { userId: user.id });
			return message(
				form,
				{
					type: 'error',
					text: 'An error occurred while creating the task. Please try again.'
				},
				{ status: 500 }
			);
		}

		throw redirect(303, '/tasks');
	})
} satisfies Actions;
