import { handleApiWrite } from '$lib/server/api/handle-write';
import { requireApiKey } from '$lib/server/api/require-api-key';
import { apiError } from '$lib/server/api/response';
import { apiUpdateWindowCleaningCustomerSchema } from '$lib/server/api/schemas/window-cleaning-customers';
import { updateWindowCleaningCustomer } from '$lib/server/db/writes/window-cleaning-customers';
import { ApiWriteError, parseJsonBody } from '@sheppakai/shared/api-write';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, url, params }) => {
	const auth = await requireApiKey(request, 'windowCleaningCustomers:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiUpdateWindowCleaningCustomerSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'windowCleaningCustomers:write'
		},
		async () => {
			const updated = await updateWindowCleaningCustomer(params.id, parsed.data);
			if (!updated)
				throw new ApiWriteError('not_found', 'Window cleaning customer not found.', 404);
			return updated;
		},
		{ successStatus: 200, failureMessage: 'Failed to update window cleaning customer' }
	);
};
