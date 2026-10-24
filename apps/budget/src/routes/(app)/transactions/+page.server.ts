import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { receiptScanResultSchema, transactionSchema } from '#lib/formSchemas/index.js';
import { requireAuth } from '#lib/server/actions/auth-guard.js';
import { createCrudActions } from '#lib/server/actions/crud-helpers.js';
import {
	budgetQueries,
	categoryQueries,
	transactionQueries
} from '#lib/server/db/queries/index.js';
import { transaction } from '#lib/server/db/schema/index.js';
import { toTransactionRow } from '#lib/server/db/writes/transactions.js';
import { logger } from '#lib/server/logger.js';
import { transactionBudgetAlertHooks } from '#lib/server/notifications/budget-threshold-alerts.js';
import { createUserRateLimiter } from '#lib/server/rate-limiter.js';
import {
	isReceiptScanEnabled,
	scanReceipt,
	toReceiptImage,
	UnreadableReceiptError
} from '#lib/server/receipt-scan/index.js';
import {
	calculateMonthsSinceJanuary,
	filterByDateRange,
	getMonthRangeFromUrl,
	getYearDateRange
} from '#lib/utils/dates.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	// Get month, year, and date range from URL params or use current month/year
	const { month, year, startDate, endDate } = getMonthRangeFromUrl(url);

	// Get yearly date range
	const { startDate: yearStartDate, endDate: yearEndDate } = getYearDateRange(year);

	const completedMonthsSinceJanuary = calculateMonthsSinceJanuary(year);

	// Normalize on the server regardless of what the client sends: trim whitespace and cap at
	// the notes column max length (800 chars) so a crafted URL can't trigger an oversized query.
	const searchQuery = (url.searchParams.get('search') ?? '').trim().slice(0, 800);
	const form = await superValidate(zod4(transactionSchema));

	try {
		// In search mode: query across all months, skip budget data (sidebar is hidden)
		if (searchQuery) {
			const { transactions, limitReached } = await transactionQueries.search(searchQuery);
			return {
				transactions,
				budgets: [],
				// oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- widens the inferred load type the page indexes with a string
				categorySpending: {} as Record<string, number>,
				excludedFromBudgetTotal: 0,
				yearlyTransactions: [],
				completedMonthsSinceJanuary: 0,
				form,
				searchQuery,
				searchLimitReached: limitReached,
				receiptScanEnabled: isReceiptScanEnabled()
			};
		}

		// The month is a subset of the year, so load the year once and derive the month from it.
		const [yearlyTransactions, budgets] = await Promise.all([
			transactionQueries.findByDateRange(yearStartDate, yearEndDate),
			budgetQueries.findByMonthYear(month, year)
		]);
		const transactions = filterByDateRange(yearlyTransactions, startDate, endDate);
		const budgetTransactions = transactions.filter((txn) => !txn.excludedFromBudget);
		const excludedFromBudgetTotal = transactions.reduce(
			(sum, txn) => sum + (txn.excludedFromBudget ? txn.amount : 0),
			0
		);

		// Calculate spending per category
		const categorySpending = budgetTransactions.reduce<Record<string, number>>((acc, txn) => {
			if (txn.category) {
				const categoryId = txn.category.id;
				acc[categoryId] = (acc[categoryId] || 0) + txn.amount;
			}
			return acc;
		}, {});

		return {
			transactions,
			budgets,
			categorySpending,
			excludedFromBudgetTotal,
			yearlyTransactions,
			completedMonthsSinceJanuary,
			form,
			searchQuery,
			receiptScanEnabled: isReceiptScanEnabled()
		};
	} catch (error) {
		logger.error('Failed to load transaction data:', error);
		return {
			transactions: [],
			budgets: [],
			// oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- widens the inferred load type the page indexes with a string
			categorySpending: {} as Record<string, number>,
			excludedFromBudgetTotal: 0,
			yearlyTransactions: [],
			completedMonthsSinceJanuary,
			loadError: 'Failed to load transaction data. Please try refreshing the page.',
			form,
			searchQuery
		};
	}
};

// Each scan is a paid-or-quota'd AI call; 20 an hour is plenty for photographing receipts.
const scanLimiter = createUserRateLimiter([20, 'h']);

export const actions = {
	...createCrudActions({
		schema: transactionSchema,
		table: transaction,
		entityName: 'Transaction',
		...transactionBudgetAlertHooks,
		transformCreate: (data, userId) => ({ ...toTransactionRow(data), userId }),
		transformUpdate: (data) => toTransactionRow(data)
	}),

	/**
	 * Reads a receipt photo with the configured AI provider and returns the extracted fields as
	 * the form's data. Nothing is saved: the page prefills the transaction modal for review.
	 */
	scanReceipt: requireAuth(async (event, user) => {
		const emptyForm = await superValidate(zod4(receiptScanResultSchema));
		const fail = (text: string, status: 400 | 413 | 422 | 429 | 502 | 503) =>
			message(emptyForm, { type: 'error', text }, { status });

		if (!isReceiptScanEnabled()) return fail('Receipt scanning is not set up.', 503);

		const limit = await scanLimiter.check(event, { userId: user.id });
		if (limit.limited) {
			return fail(`Too many scans. Try again in ${limit.retryAfter} seconds.`, 429);
		}

		let receipt: FormDataEntryValue | null;
		try {
			receipt = (await event.request.formData()).get('receipt');
		} catch (err) {
			// Bodies over adapter-node's BODY_SIZE_LIMIT (fly.toml) fail here, not in toReceiptImage.
			logger.warn('Receipt upload unreadable', { userId: user.id, reason: String(err) });
			return fail('That photo is too large to upload. Try a smaller one.', 413);
		}

		const image = await toReceiptImage(receipt);
		if (!image) return fail('Upload a JPEG, PNG or WebP photo under 5 MB.', 400);

		try {
			const categories = await categoryQueries.findAll();
			const scan = await scanReceipt(image, categories);
			const form = await superValidate(scan, zod4(receiptScanResultSchema));
			return message(form, {
				type: 'success',
				text: 'Receipt scanned. Check the details, then save.'
			});
		} catch (err) {
			if (err instanceof UnreadableReceiptError) {
				logger.warn('Receipt scan unreadable', { userId: user.id, reason: err.message });
				return fail("Couldn't read that receipt. Try a clearer, flatter photo.", 422);
			}
			logger.error('Receipt scan failed', err);
			return fail('Receipt scanning failed. Try again, or add the transaction manually.', 502);
		}
	})
} satisfies Actions;
