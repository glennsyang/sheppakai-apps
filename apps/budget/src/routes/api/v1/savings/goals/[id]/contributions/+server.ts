import { parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError } from '#lib/server/api/response.js';
import { apiCreateContributionSchema } from '#lib/server/api/schemas/contributions.js';
import { savingsGoalQueries } from '#lib/server/db/queries/index.js';
import { createContribution } from '#lib/server/db/writes/contributions.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, params }) => {
	const auth = await requireApiKey(request, 'contributions:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateContributionSchema);
	if (!parsed.ok) return parsed.response;

	const goal = await savingsGoalQueries.findById(params.id);
	if (!goal) {
		return apiError('not_found', 'Savings goal not found.', 404);
	}

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'contributions:write'
		},
		() => createContribution(params.id, parsed.data, auth.userId),
		{ successStatus: 201, failureMessage: 'Failed to create contribution' }
	);
};
