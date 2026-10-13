import { parseJsonBody } from '@sheppakai/shared/api-write';
import { and, eq } from 'drizzle-orm';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiUpdateTaskSchema } from '#lib/server/api/schemas/tasks.js';
import { getDb } from '#lib/server/db/index.js';
import { tasks } from '#lib/server/db/schema/index.js';
import { updateTask } from '#lib/server/db/writes/tasks.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const auth = await requireApiKey(request, 'tasks:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		const task = await getDb().query.tasks.findFirst({
			where: and(eq(tasks.id, params.id), eq(tasks.userId, auth.userId))
		});

		if (!task) {
			return apiError('not_found', 'Task not found.', 404);
		}

		return apiSuccess(task);
	} catch (error) {
		logger.error('API: failed to load task', error);
		return apiError('internal_error', 'Failed to load task.', 500);
	}
};

export const PATCH: RequestHandler = async ({ request, params, url }) => {
	const auth = await requireApiKey(request, 'tasks:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpdateTaskSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'tasks:write'
		},
		() => updateTask(auth.userId, params.id, parsed.data),
		{ successStatus: 200, failureMessage: 'Failed to update task' }
	);
};
