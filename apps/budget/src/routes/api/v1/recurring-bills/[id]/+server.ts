import { ApiWriteError, parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError } from '#lib/server/api/response.js';
import { apiMarkRecurringBillPaidSchema } from '#lib/server/api/schemas/recurring-bills.js';
import { markRecurringBillPaid } from '#lib/server/db/writes/recurring-bills.js';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, url, params }) => {
	const auth = await requireApiKey(request, 'recurring:markPaid');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiMarkRecurringBillPaidSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'PATCH',
			path: url.pathname,
			action: 'recurring:markPaid'
		},
		async () => {
			const updated = await markRecurringBillPaid(params.id, parsed.data.paid);
			if (!updated) throw new ApiWriteError('not_found', 'Recurring bill not found.', 404);
			return updated;
		},
		{ successStatus: 200, failureMessage: 'Failed to update recurring bill' }
	);
};
