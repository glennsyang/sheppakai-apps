import { parseJsonBody, parseQuery } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import {
	apiCreateTransactionSchema,
	apiTransactionListQuerySchema
} from '#lib/server/api/schemas/transactions.js';
import { transactionQueries } from '#lib/server/db/queries/index.js';
import { createTransaction } from '#lib/server/db/writes/transactions.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'transactions:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiTransactionListQuerySchema);
	if (!parsed.ok) return parsed.response;

	const { startDate, endDate, categoryId, limit } = parsed.data;

	try {
		const transactions =
			startDate && endDate && categoryId
				? await transactionQueries.findByCategory(categoryId, { start: startDate, end: endDate })
				: startDate && endDate
					? await transactionQueries.findByDateRange(startDate, endDate)
					: categoryId
						? await transactionQueries.findByCategory(categoryId)
						: await transactionQueries.findAll({ limit });

		return apiSuccess(transactions);
	} catch (error) {
		logger.error('API: failed to list transactions', error);
		return apiError('internal_error', 'Failed to load transactions.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'transactions:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateTransactionSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'transactions:write'
		},
		() => createTransaction(parsed.data, auth.userId),
		{ successStatus: 201, failureMessage: 'Failed to create transaction' }
	);
};
