// `/api/v1` adapter over the Task module: maps its results onto `ApiWriteError`s.
import { ApiWriteError } from '@sheppakai/shared/api-write';

import type { ApiCreateTaskInput, ApiUpdateTaskInput } from '#lib/server/api/schemas/tasks.js';
import { getDb } from '#lib/server/db/index.js';
import * as taskModule from '#lib/server/tasks/task.js';

function unwrap(result: taskModule.TaskWriteResult): taskModule.Task {
	if (result.ok) return result.task;
	if (result.reason === 'duplicate_title') {
		throw new ApiWriteError('validation_failed', 'A task with this name already exists.', 400);
	}
	throw new ApiWriteError('not_found', 'Task not found.', 404);
}

export async function createTaskFromApi(userId: string, input: ApiCreateTaskInput) {
	return unwrap(
		taskModule.createTask(getDb(), userId, {
			title: input.title,
			description: input.description ?? null,
			tags: input.tags ?? null,
			dueDate: input.dueDate ?? null,
			priority: input.priority,
			state: input.state
		})
	);
}

export async function updateTaskFromApi(userId: string, taskId: string, input: ApiUpdateTaskInput) {
	return unwrap(taskModule.updateTask(getDb(), userId, taskId, input));
}
