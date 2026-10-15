import { parseJsonBody, parseQuery } from '@sheppakai/shared/api-write';
import { and, desc, eq } from 'drizzle-orm';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiCreateTaskSchema, apiTaskListQuerySchema } from '#lib/server/api/schemas/tasks.js';
import { getDb } from '#lib/server/db/index.js';
import { tasks } from '#lib/server/db/schema/index.js';
import { createTask } from '#lib/server/db/writes/tasks.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'tasks:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiTaskListQuerySchema);
	if (!parsed.ok) return parsed.response;

	const { state, priority, limit } = parsed.data;

	try {
		const conditions = [eq(tasks.userId, auth.userId)];
		if (state) conditions.push(eq(tasks.state, state));
		if (priority) conditions.push(eq(tasks.priority, priority));

		const results = await getDb().query.tasks.findMany({
			where: and(...conditions),
			orderBy: [desc(tasks.createdAt)],
			limit
		});

		return apiSuccess(results);
	} catch (error) {
		logger.error('API: failed to list tasks', error);
		return apiError('internal_error', 'Failed to load tasks.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'tasks:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateTaskSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'tasks:write'
		},
		() => createTask(auth.userId, parsed.data),
		{ successStatus: 201, failureMessage: 'Failed to create task' }
	);
};
