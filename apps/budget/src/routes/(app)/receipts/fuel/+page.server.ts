import { expenseQueries } from '#lib/server/db/queries/index.js';
import { logger } from '#lib/server/logger.js';
import { getReceiptLoadContext } from '#lib/server/receipts/index.js';
import { calculateMonthsSinceJanuary } from '#lib/utils/dates.js';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent }) => {
	const { categories } = await parent();
	const { gasCategory, year, startDate, endDate, yearStartDate, yearEndDate, form } =
		await getReceiptLoadContext(url, categories);

	try {
		const completedMonthsSinceJanuary = calculateMonthsSinceJanuary(year);

		const [monthlyExpenses, yearlyExpenses] = await Promise.all([
			expenseQueries.findByCategory(gasCategory.id, { start: startDate, end: endDate }),
			expenseQueries.findByCategory(gasCategory.id, { start: yearStartDate, end: yearEndDate })
		]);

		return {
			monthlyExpenses,
			yearlyExpenses,
			completedMonthsSinceJanuary,
			form
		};
	} catch (error) {
		logger.error('Failed to load fuel receipts:', error);
		return {
			monthlyExpenses: [],
			yearlyExpenses: [],
			completedMonthsSinceJanuary: 0,
			loadError: 'Failed to load fuel receipts. Please try refreshing the page.',
			form
		};
	}
};

export { receiptActions as actions } from '#lib/server/receipts/index.js';
