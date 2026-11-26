import { parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiCreateWindowCleaningCustomerSchema } from '#lib/server/api/schemas/window-cleaning-customers.js';
import { logger } from '#lib/server/logger.js';
import { create, listWithStatus } from '#lib/server/window-cleaning/customers.js';
import { getAppTodayDate } from '#lib/utils/dates.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const auth = await requireApiKey(request, 'windowCleaningCustomers:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	try {
		const { customers } = await listWithStatus(getAppTodayDate());
		// Jobs are served by /api/v1/window-cleaning/jobs; the list carries their totals only
		return apiSuccess(customers.map(({ jobs: _jobs, ...customer }) => customer));
	} catch (error) {
		logger.error('API: failed to list window cleaning customers', error);
		return apiError('internal_error', 'Failed to load window cleaning customers.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'windowCleaningCustomers:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateWindowCleaningCustomerSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'windowCleaningCustomers:write'
		},
		() => create(parsed.data, auth.userId),
		{ successStatus: 201, failureMessage: 'Failed to create window cleaning customer' }
	);
};
