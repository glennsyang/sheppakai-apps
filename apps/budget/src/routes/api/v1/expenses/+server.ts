import { parseJsonBody, parseQuery } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import {
	apiCreateExpenseSchema,
	apiExpenseListQuerySchema
} from '#lib/server/api/schemas/expenses.js';
import { expenseQueries } from '#lib/server/db/queries/index.js';
import { createExpense } from '#lib/server/db/writes/expenses.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'transactions:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = parseQuery(url, apiExpenseListQuerySchema);
	if (!parsed.ok) return parsed.response;

	const { startDate, endDate, categoryId, limit } = parsed.data;

	try {
		const expenses =
			startDate && endDate && categoryId
				? await expenseQueries.findByCategory(categoryId, { start: startDate, end: endDate })
				: startDate && endDate
					? await expenseQueries.findByDateRange(startDate, endDate)
					: categoryId
						? await expenseQueries.findByCategory(categoryId)
						: await expenseQueries.findAll({ limit });

		return apiSuccess(expenses);
	} catch (error) {
		logger.error('API: failed to list expenses', error);
		return apiError('internal_error', 'Failed to load expenses.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'transactions:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateExpenseSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'transactions:write'
		},
		() => createExpense(parsed.data, auth.userId),
		{ successStatus: 201, failureMessage: 'Failed to create expense' }
	);
};
