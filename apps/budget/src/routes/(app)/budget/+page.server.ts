import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { z } from 'zod';

import { budgetSchema } from '#lib/formSchemas/index.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { updateAction } from '#lib/server/actions/crud-helpers.js';
import { handleDomainAction } from '#lib/server/actions/domain-action.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { getCrudMessage } from '#lib/server/actions/messages.js';
import {
	buildCategoryHistory,
	monthWindow,
	PRESET_WINDOW_MONTHS,
	suggestPreset,
	type PresetAmounts,
	type PresetType
} from '#lib/server/budgets/category-history.js';
import {
	budgetQueries,
	recurringBillQueries,
	expenseQueries
} from '#lib/server/db/queries/index.js';
import { budget } from '#lib/server/db/schema/index.js';
import { saveBudget } from '#lib/server/db/writes/budgets.js';
import { logger } from '#lib/server/logger.js';
import { recurringBillsTotalForMonth, toMonthKey } from '#lib/server/recurring-bill-history.js';
import { getMonthYearFromUrl, padMonth } from '#lib/utils/dates.js';

import type { Actions, PageServerLoad } from './$types';

type CategoryPresets = PresetAmounts & { suggested: PresetType | null };

const NO_HISTORY: PresetAmounts = { lastMonthSpent: 0, lastMonthBudget: 0, averageSpent: 0 };

export const load: PageServerLoad = async ({ url }) => {
	// Get month and year from URL params or use current month/year
	const { month, year } = getMonthYearFromUrl(url);

	// The chart shows the 12 months ending at the selected month; Preset amounts look at the
	// full months before it, so the history query reaches one month further back.
	const historyMonths = monthWindow(month, year, PRESET_WINDOW_MONTHS + 1);
	const last12Months = historyMonths.slice(1);
	const earliestMonth = historyMonths[0];
	const latestMonth = historyMonths[historyMonths.length - 1];

	// Calculate start and end dates for expense filtering
	const startDate = `${earliestMonth.year}-${earliestMonth.month}-01`;
	const endDate = new Date(Number(latestMonth.year), Number(latestMonth.month), 0);
	const endDateStr = `${latestMonth.year}-${latestMonth.month}-${padMonth(endDate.getDate().toString())}`;

	try {
		// Chart-window history plus the selected month's budget and bill prices.
		const monthKey = toMonthKey(month, year);
		const [historicalBudgets, historicalExpenses, monthBudget, billPriceHistory] =
			await Promise.all([
				budgetQueries.findHistory(earliestMonth, latestMonth),
				expenseQueries.sumByCategoryMonth(startDate, endDateStr),
				budgetQueries.findByMonthYear(month, year),
				recurringBillQueries.findHistory(monthKey, monthKey)
			]);

		const history = buildCategoryHistory({
			month,
			year,
			expenseTotals: historicalExpenses,
			budgets: historicalBudgets
		});
		const presets: Record<string, CategoryPresets> = {};
		for (const [categoryId, amounts] of history) {
			presets[categoryId] = { ...amounts, suggested: null };
		}
		for (const b of monthBudget) {
			const categoryId = b.category?.id ?? b.categoryId;
			const amounts = presets[categoryId] ?? NO_HISTORY;
			presets[categoryId] = { ...amounts, suggested: suggestPreset(b, amounts) };
		}

		return {
			budget: monthBudget,
			presets,
			historicalBudgets,
			historicalExpenses,
			last12Months,
			recurringBillsTotal: recurringBillsTotalForMonth(billPriceHistory, monthKey)
		};
	} catch (error) {
		logger.error('Failed to load budget:', error);
		return {
			budget: [],
			presets: {} as Record<string, CategoryPresets>,
			historicalBudgets: [],
			historicalExpenses: [],
			last12Months,
			recurringBillsTotal: 0,
			loadError: 'Failed to load budget. Please try refreshing the page.'
		};
	}
};

const budgetActionConfig = {
	schema: budgetSchema,
	table: budget,
	entityName: 'Budget',
	messages: {
		createSuccess: 'Budget saved successfully',
		updateSuccess: 'Budget saved successfully'
	},
	transformUpdate: (data: z.infer<typeof budgetSchema>) => ({
		amount: data.amount,
		year: data.year,
		month: data.month,
		presetType: data.presetType || null,
		categoryId: data.categoryId
	})
};

export const actions = {
	// Saves onto the existing Budget for that category and month if there is one (#380).
	create: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(budgetSchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(form, async () => saveBudget(form.data, user.id), {
			loggerContext: 'Failed to create budget',
			fallbackMessage: getCrudMessage('createError', 'Budget'),
			successMessage: 'Budget saved successfully',
			logFields: { userId: user.id }
		});
	}),
	update: updateAction(budgetActionConfig)
} satisfies Actions;
