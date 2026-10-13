import { parseJsonBody } from '@sheppakai/shared/api-write';

import { handleApiWrite } from '#lib/server/api/handle-write.js';
import { requireApiKey } from '#lib/server/api/require-api-key.js';
import { apiError, apiSuccess } from '#lib/server/api/response.js';
import { apiCreateIncomeSchema, apiIncomeListQuerySchema } from '#lib/server/api/schemas/income.js';
import { incomeQueries } from '#lib/server/db/queries/index.js';
import { createIncome } from '#lib/server/db/writes/income.js';
import { logger } from '#lib/server/logger.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'income:read');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = apiIncomeListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return apiError('validation_failed', parsed.error.issues.map((i) => i.message).join('; '), 400);
	}

	const { startDate, endDate, month, year, limit } = parsed.data;

	try {
		const entries =
			startDate && endDate
				? await incomeQueries.findByDateRange(startDate, endDate)
				: month && year
					? await incomeQueries.findByMonth(month, year)
					: await incomeQueries.findAll({ limit });

		return apiSuccess(entries);
	} catch (error) {
		logger.error('API: failed to list income', error);
		return apiError('internal_error', 'Failed to load income.', 500);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = await requireApiKey(request, 'income:write');
	if (!auth.ok) return apiError(auth.code, auth.message, auth.status);

	const parsed = await parseJsonBody(request, apiCreateIncomeSchema);
	if (!parsed.ok) return parsed.response;

	return handleApiWrite(
		{
			apiKeyId: auth.apiKeyId,
			userId: auth.userId,
			method: 'POST',
			path: url.pathname,
			action: 'income:write'
		},
		() => createIncome(parsed.data, auth.userId),
		{ successStatus: 201, failureMessage: 'Failed to create income' }
	);
};
