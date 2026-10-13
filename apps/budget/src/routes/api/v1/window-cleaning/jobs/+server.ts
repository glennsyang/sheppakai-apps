import { parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import {
	apiCreateWindowCleaningJobSchema,
	apiWindowCleaningJobListQuerySchema
} from '#lib/server/api/schemas/window-cleaning-jobs.js';
import { windowCleaningJobQueries } from '#lib/server/db/queries/index.js';
import { createWindowCleaningJob } from '#lib/server/db/writes/window-cleaning-jobs.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'windowCleaningJobs:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = apiWindowCleaningJobListQuerySchema.safeParse(
		Object.fromEntries(url.searchParams)
	);
	if (!parsed.success) {
		return apiError('validation_failed', parsed.error.issues.map((i) => i.message).join('; '), 400);
	}

	const { customerId, month, year } = parsed.data;

	try {
		const jobs = customerId
			? await windowCleaningJobQueries.findByCustomer(customerId)
			: month && year
				? await windowCleaningJobQueries.findByMonth(month, year)
				: year
					? await windowCleaningJobQueries.findByYear(year)
					: await windowCleaningJobQueries.findAll();

		return apiSuccess(jobs);
	} catch (error) {
		logger.error('API: failed to list window cleaning jobs', error);
		return apiError('internal_error', 'Failed to load window cleaning jobs.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'windowCleaningJobs:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateWindowCleaningJobSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'windowCleaningJobs:write'
		},
		() => createWindowCleaningJob(parsed.data, auth.userId),
		{ successStatus: 201, failureMessage: 'Failed to create window cleaning job' }
	);
};
