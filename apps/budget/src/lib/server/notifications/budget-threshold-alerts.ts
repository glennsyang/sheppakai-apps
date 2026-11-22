import { and, eq, sql } from 'drizzle-orm';

import { formatCurrency } from '#lib/utils.js';
import { getMonthDateRange, padMonth } from '#lib/utils/dates.js';

import { getDb } from '../db';
import { budget, expense } from '../db/schema';
import { dateInRange } from '../db/utils';
import { logger } from '../logger';
import { sendBudgetAlerts } from './index';

const NEAR_BUDGET_THRESHOLD_RATIO = 0.9;
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

type BudgetCategorySnapshot = {
	amount: number;
	categoryName: string;
};

type BudgetThresholdNotification = {
	title: string;
	message: string;
	priority: number;
};

export function getBudgetThresholdState(
	spentAmount: number,
	budgetAmount: number
): BudgetThresholdState {
	if (budgetAmount <= 0) {
		return 'below';
	}

	if (spentAmount > budgetAmount) {
		return 'over';
	}

	if (spentAmount >= budgetAmount * NEAR_BUDGET_THRESHOLD_RATIO) {
		return 'near';
	}

	return 'below';
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

async function loadBudgetCategorySnapshot(
	userId: string,
	categoryId: string,
	month: number,
	year: number
): Promise<BudgetCategorySnapshot | null> {
	const monthlyBudgets = await getDb().query.budget.findMany({
		with: {
			category: true
		},
		where: and(
			eq(budget.userId, userId),
			eq(budget.categoryId, categoryId),
			eq(budget.month, padMonth(month)),
			eq(budget.year, year.toString())
		)
	});

	if (monthlyBudgets.length === 0) {
		return null;
	}

	return {
		amount: monthlyBudgets.reduce((sum, row) => sum + row.amount, 0),
		categoryName: monthlyBudgets[0]?.category?.name ?? 'Category'
	};
}

async function loadCategoryMonthSpend(
	categoryId: string,
	month: number,
	year: number
): Promise<number> {
	const { startDate, endDate } = getMonthDateRange(month, year);
	const [row] = await getDb()
		.select({ total: sql<number>`coalesce(sum(${expense.amount}), 0)` })
		.from(expense)
		.where(
			and(
				eq(expense.categoryId, categoryId),
				eq(expense.excludedFromBudget, false),
				...dateInRange(expense.date, startDate, endDate)
			)
		);

	return row?.total ?? 0;
}

async function maybeSendBudgetThresholdAlert(params: {
	userId: string;
	categoryId: string;
	month: number;
	year: number;
	previousSpentAmount: number;
	currentSpentAmount: number;
}): Promise<void> {
	const budgetSnapshot = await loadBudgetCategorySnapshot(
		params.userId,
		params.categoryId,
		params.month,
		params.year
	);

	if (!budgetSnapshot) {
		logger.info('No budget found for category threshold evaluation', {
			categoryId: params.categoryId,
			month: params.month,
			year: params.year
		});
		return;
	}

	const previousState = getBudgetThresholdState(params.previousSpentAmount, budgetSnapshot.amount);
	const nextState = getBudgetThresholdState(params.currentSpentAmount, budgetSnapshot.amount);
	const alertType = getBudgetThresholdAlertType(previousState, nextState);

	logger.info('Evaluated budget threshold transition', {
		categoryId: params.categoryId,
		month: params.month,
		year: params.year,
		previousState,
		nextState,
		previousSpentAmount: params.previousSpentAmount,
		currentSpentAmount: params.currentSpentAmount
	});

	if (!alertType) {
		return;
	}

	const notification = buildBudgetThresholdNotification({
		alertType,
		categoryName: budgetSnapshot.categoryName,
		spentAmount: params.currentSpentAmount,
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
	const currentSpentAmount = await loadCategoryMonthSpend(expenseRecord.categoryId, month, year);
	const previousSpentAmount = Math.max(currentSpentAmount - expenseRecord.amount, 0);

	await maybeSendBudgetThresholdAlert({
		userId: expenseRecord.userId,
		categoryId: expenseRecord.categoryId,
		month,
		year,
		previousSpentAmount,
		currentSpentAmount
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
		previousExpense.userId === nextExpense.userId &&
		previousExpense.categoryId === nextExpense.categoryId &&
		previousMonthYear.month === nextMonthYear.month &&
		previousMonthYear.year === nextMonthYear.year;

	if (isSameBudgetBucket) {
		const currentSpentAmount = await loadCategoryMonthSpend(
			nextExpense.categoryId,
			nextMonthYear.month,
			nextMonthYear.year
		);
		const previousSpentAmount = Math.max(
			currentSpentAmount - nextExpense.amount + previousExpense.amount,
			0
		);

		await maybeSendBudgetThresholdAlert({
			userId: nextExpense.userId,
			categoryId: nextExpense.categoryId,
			month: nextMonthYear.month,
			year: nextMonthYear.year,
			previousSpentAmount,
			currentSpentAmount
		});
		return;
	}

	const currentSpentAmount = await loadCategoryMonthSpend(
		nextExpense.categoryId,
		nextMonthYear.month,
		nextMonthYear.year
	);
	const previousSpentAmount = Math.max(currentSpentAmount - nextExpense.amount, 0);

	await maybeSendBudgetThresholdAlert({
		userId: nextExpense.userId,
		categoryId: nextExpense.categoryId,
		month: nextMonthYear.month,
		year: nextMonthYear.year,
		previousSpentAmount,
		currentSpentAmount
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
