import { eq } from 'drizzle-orm';

import { classifyCategoryStatus, getCategoryStatus } from '#lib/server/budgets/category-status.js';
import { formatCurrency } from '#lib/utils.js';

import { getDb } from '../db';
import { expense } from '../db/schema';
import { logger } from '../logger';
import { sendBudgetAlerts } from './index';

const NEAR_BUDGET_ALERT_PRIORITY = 3;
const OVER_BUDGET_ALERT_PRIORITY = 4;

type BudgetThresholdState = 'below' | 'near' | 'over';
type BudgetThresholdAlertType = 'near' | 'over';

type ExpenseBudgetAlertRecord = {
	id: string;
	userId: string;
	categoryId: string;
	amount: number;
	date: string;
	excludedFromBudget: boolean;
};

type ExpenseBudgetAlertUpdateContext = {
	previousExpense: ExpenseBudgetAlertRecord | null;
};

type BudgetThresholdNotification = {
	title: string;
	message: string;
	priority: number;
};

/** Alert view of the Category Status rule: only `over` and `near` are alert-worthy. */
export function getBudgetThresholdState(
	spentAmount: number,
	budgetAmount: number
): BudgetThresholdState {
	const state = classifyCategoryStatus(budgetAmount, spentAmount);
	return state === 'over' || state === 'near' ? state : 'below';
}

export function getBudgetThresholdAlertType(
	previousState: BudgetThresholdState,
	nextState: BudgetThresholdState
): BudgetThresholdAlertType | null {
	if (nextState === previousState) {
		return null;
	}

	if (nextState === 'over' && previousState !== 'over') {
		return 'over';
	}

	if (nextState === 'near' && previousState === 'below') {
		return 'near';
	}

	return null;
}

function getMonthYearFromStoredExpenseDate(date: string): { month: number; year: number } {
	const datePart = date.split(' ')[0] ?? date;
	const [yearText, monthText] = datePart.split('-');

	return {
		year: Number.parseInt(yearText ?? '0', 10),
		month: Number.parseInt(monthText ?? '0', 10)
	};
}

function formatMonthLabel(month: number, year: number): string {
	const labelDate = new Date(Date.UTC(year, month - 1, 1));

	return new Intl.DateTimeFormat('en-US', {
		timeZone: 'UTC',
		month: 'long',
		year: 'numeric'
	}).format(labelDate);
}

function formatPercentage(spentAmount: number, budgetAmount: number): number {
	if (budgetAmount <= 0) {
		return 0;
	}

	return Math.round((spentAmount / budgetAmount) * 100);
}

function buildBudgetThresholdNotification(params: {
	alertType: BudgetThresholdAlertType;
	categoryName: string;
	spentAmount: number;
	budgetAmount: number;
	month: number;
	year: number;
}): BudgetThresholdNotification {
	const monthLabel = formatMonthLabel(params.month, params.year);
	const percentage = formatPercentage(params.spentAmount, params.budgetAmount);
	const spent = formatCurrency(params.spentAmount);
	const budgetAmount = formatCurrency(params.budgetAmount);

	if (params.alertType === 'over') {
		return {
			title: 'Category over budget',
			message: `${params.categoryName} is over the ${monthLabel} budget at ${percentage}%: ${spent} of ${budgetAmount} spent.`,
			priority: OVER_BUDGET_ALERT_PRIORITY
		};
	}

	return {
		title: 'Category at 90% of budget',
		message: `${params.categoryName} reached ${percentage}% of the ${monthLabel} budget: ${spent} of ${budgetAmount} spent.`,
		priority: NEAR_BUDGET_ALERT_PRIORITY
	};
}

/**
 * `previousSpentFrom` turns the month's current spend into what it was before this write, so the
 * alert fires only on the transition into near/over.
 */
async function maybeSendBudgetThresholdAlert(params: {
	categoryId: string;
	month: number;
	year: number;
	previousSpentFrom: (currentSpentAmount: number) => number;
}): Promise<void> {
	// Budgets belong to the Household, so the status matches them whoever created them.
	const status = await getCategoryStatus(params.categoryId, params.month, params.year);

	if (!status || status.budgeted <= 0) {
		logger.info('No budget found for category threshold evaluation', {
			categoryId: params.categoryId,
			month: params.month,
			year: params.year
		});
		return;
	}

	const budgetSnapshot = { amount: status.budgeted, categoryName: status.categoryName };
	const currentSpentAmount = status.spent;
	const previousSpentAmount = Math.max(params.previousSpentFrom(currentSpentAmount), 0);

	const previousState = getBudgetThresholdState(previousSpentAmount, budgetSnapshot.amount);
	const nextState = getBudgetThresholdState(currentSpentAmount, budgetSnapshot.amount);
	const alertType = getBudgetThresholdAlertType(previousState, nextState);

	logger.info('Evaluated budget threshold transition', {
		categoryId: params.categoryId,
		month: params.month,
		year: params.year,
		previousState,
		nextState,
		previousSpentAmount,
		currentSpentAmount
	});

	if (!alertType) {
		return;
	}

	const notification = buildBudgetThresholdNotification({
		alertType,
		categoryName: budgetSnapshot.categoryName,
		spentAmount: currentSpentAmount,
		budgetAmount: budgetSnapshot.amount,
		month: params.month,
		year: params.year
	});

	const sent = await sendBudgetAlerts(
		notification.message,
		notification.title,
		notification.priority
	);

	if (!sent) {
		logger.error('Failed to send budget threshold alert', {
			categoryId: params.categoryId,
			month: params.month,
			year: params.year,
			alertType
		});
		return;
	}

	logger.info('Sent budget threshold alert', {
		categoryId: params.categoryId,
		month: params.month,
		year: params.year,
		alertType
	});
}

function mergeUpdatedExpenseRecord(
	previousExpense: ExpenseBudgetAlertRecord,
	updatedData: Partial<ExpenseBudgetAlertRecord>
): ExpenseBudgetAlertRecord {
	return {
		id: previousExpense.id,
		userId: updatedData.userId ?? previousExpense.userId,
		categoryId: updatedData.categoryId ?? previousExpense.categoryId,
		amount: updatedData.amount ?? previousExpense.amount,
		date: updatedData.date ?? previousExpense.date,
		excludedFromBudget: updatedData.excludedFromBudget ?? previousExpense.excludedFromBudget
	};
}

export async function evaluateCreatedExpenseBudgetAlert(
	expenseRecord: ExpenseBudgetAlertRecord
): Promise<void> {
	if (expenseRecord.excludedFromBudget) {
		return;
	}

	const { month, year } = getMonthYearFromStoredExpenseDate(expenseRecord.date);
	await maybeSendBudgetThresholdAlert({
		categoryId: expenseRecord.categoryId,
		month,
		year,
		previousSpentFrom: (current) => current - expenseRecord.amount
	});
}

export async function buildExpenseBudgetAlertUpdateContext(
	expenseId: string
): Promise<ExpenseBudgetAlertUpdateContext> {
	const previousExpense = await getDb().query.expense.findFirst({
		columns: {
			id: true,
			userId: true,
			categoryId: true,
			amount: true,
			date: true,
			excludedFromBudget: true
		},
		where: eq(expense.id, expenseId)
	});

	return {
		previousExpense: previousExpense ?? null
	};
}

export async function evaluateUpdatedExpenseBudgetAlert(
	updatedData: Partial<ExpenseBudgetAlertRecord>,
	context?: ExpenseBudgetAlertUpdateContext
): Promise<void> {
	const previousExpense = context?.previousExpense;

	if (!previousExpense) {
		logger.error('Missing previous expense context for budget threshold update evaluation');
		return;
	}

	const nextExpense = mergeUpdatedExpenseRecord(previousExpense, updatedData);
	if (nextExpense.excludedFromBudget) {
		return;
	}

	const previousMonthYear = getMonthYearFromStoredExpenseDate(previousExpense.date);
	const nextMonthYear = getMonthYearFromStoredExpenseDate(nextExpense.date);
	const isSameBudgetBucket =
		!previousExpense.excludedFromBudget &&
		!nextExpense.excludedFromBudget &&
		previousExpense.categoryId === nextExpense.categoryId &&
		previousMonthYear.month === nextMonthYear.month &&
		previousMonthYear.year === nextMonthYear.year;

	if (isSameBudgetBucket) {
		await maybeSendBudgetThresholdAlert({
			categoryId: nextExpense.categoryId,
			month: nextMonthYear.month,
			year: nextMonthYear.year,
			previousSpentFrom: (current) => current - nextExpense.amount + previousExpense.amount
		});
		return;
	}

	await maybeSendBudgetThresholdAlert({
		categoryId: nextExpense.categoryId,
		month: nextMonthYear.month,
		year: nextMonthYear.year,
		previousSpentFrom: (current) => current - nextExpense.amount
	});
}

export const expenseBudgetAlertHooks = {
	afterCreate: async (_id: string, data: ExpenseBudgetAlertRecord) => {
		await evaluateCreatedExpenseBudgetAlert(data);
	},
	beforeUpdate: async (id: string) => {
		return buildExpenseBudgetAlertUpdateContext(id);
	},
	afterUpdate: async (
		_id: string,
		data: Partial<ExpenseBudgetAlertRecord>,
		context?: ExpenseBudgetAlertUpdateContext
	) => {
		await evaluateUpdatedExpenseBudgetAlert(data, context);
	}
};
