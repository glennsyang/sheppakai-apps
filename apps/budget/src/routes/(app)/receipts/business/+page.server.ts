import { expenseQueries } from '#lib/server/db/queries/index.js';
import { logger } from '#lib/server/logger.js';
import { getReceiptLoadContext } from '#lib/server/receipts/index.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent }) => {
	const { categories } = await parent();
	const { gasCategory, startDate, endDate, yearStartDate, yearEndDate, form } =
		await getReceiptLoadContext(url, categories);

	try {
		const [monthlyExpenses, yearlyExpenses] = await Promise.all([
			expenseQueries.findByDateRangeExcludingCategory(startDate, endDate, gasCategory.id, true),
			expenseQueries.findByDateRangeExcludingCategory(
				yearStartDate,
				yearEndDate,
				gasCategory.id,
				true
			)
		]);

		return { monthlyExpenses, yearlyExpenses, form };
	} catch (error) {
		logger.error('Failed to load business receipts:', error);
		return {
			monthlyExpenses: [],
			yearlyExpenses: [],
			loadError: 'Failed to load business receipts. Please try refreshing the page.',
			form
		};
	}
};

export { receiptActions as actions } from '#lib/server/receipts/index.js';
