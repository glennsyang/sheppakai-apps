import { APP_TIME_ZONE } from '$app/env/public';
import { and, eq, ne } from 'drizzle-orm';

import { getCategoryStatuses } from '#lib/server/budgets/category-status.js';
import { getDb } from '#lib/server/db/index.js';
import { category, expense, user } from '#lib/server/db/schema/index.js';
import { dateInRange } from '#lib/server/db/utils.js';
import {
	sendWeeklySummaryEmail,
	type WeeklySummaryCategory,
	type WeeklySummaryExcludedExpense
} from '#lib/server/email/index.js';
import { logger } from '#lib/server/logger.js';
import type { CategoryStatus } from '#lib/types.js';

type WeeklySummaryRunResult = {
	success: boolean;
	skipped: boolean;
	reason?: string;
	monthLabel: string;
	recipientsScanned: number;
	emailsSent: number;
	emailsFailed: number;
	overBudgetCount: number;
	nearLimitCount: number;
	excludedCount: number;
};

type AppDateParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	weekday: number;
};

function getAppDateParts(date: Date): AppDateParts {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: APP_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hour12: false,
		weekday: 'short'
	});

	const parts = formatter.formatToParts(date);
	const partMap = new Map(parts.map((part) => [part.type, part.value]));
	const weekdayMap: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6
	};

	const weekdayText = partMap.get('weekday') || 'Sun';

	return {
		year: Number(partMap.get('year')),
		month: Number(partMap.get('month')),
		day: Number(partMap.get('day')),
		hour: Number(partMap.get('hour')),
		weekday: weekdayMap[weekdayText] ?? 0
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

function buildMonthRange(date: Date) {
	const parts = getAppDateParts(date);
	const month = String(parts.month).padStart(2, '0');
	const day = String(parts.day).padStart(2, '0');

	return {
		year: String(parts.year),
		month,
		startDate: `${parts.year}-${month}-01`,
		endDate: `${parts.year}-${month}-${day}`,
		monthLabel: formatMonthLabel(parts.month, parts.year)
	};
}

function isMondayInAppTimeZone(date: Date): boolean {
	const parts = getAppDateParts(date);
	return parts.weekday === 1;
}

/** Over and near rows come straight from the Category Status states. */
function toSummaryRows(statuses: CategoryStatus[]): {
	overBudgetRows: WeeklySummaryCategory[];
	nearLimitRows: WeeklySummaryCategory[];
} {
	const overBudgetRows: WeeklySummaryCategory[] = statuses
		.filter((s) => s.state === 'over')
		.map((s) => ({
			categoryName: s.categoryName,
			budgetAmount: s.budgeted,
			spentAmount: s.spent,
			overByAmount: s.overBy
		}))
		.toSorted((a, b) => (b.overByAmount ?? 0) - (a.overByAmount ?? 0));

	const nearLimitRows: WeeklySummaryCategory[] = statuses
		.filter((s) => s.state === 'near')
		.map((s) => ({
			categoryName: s.categoryName,
			budgetAmount: s.budgeted,
			spentAmount: s.spent,
			remainingAmount: Math.max(s.budgeted - s.spent, 0)
		}))
		.toSorted((a, b) => (b.spentAmount ?? 0) - (a.spentAmount ?? 0));

	return { overBudgetRows, nearLimitRows };
}

export async function runWeeklySummaryEmail(date = new Date()): Promise<WeeklySummaryRunResult> {
	if (!isMondayInAppTimeZone(date)) {
		const monthRange = buildMonthRange(date);
		return {
			success: true,
			skipped: true,
			reason: 'Not Monday in app time zone',
			monthLabel: monthRange.monthLabel,
			recipientsScanned: 0,
			emailsSent: 0,
			emailsFailed: 0,
			overBudgetCount: 0,
			nearLimitCount: 0,
			excludedCount: 0
		};
	}

	const db = getDb();
	const monthRange = buildMonthRange(date);

	const recipients = await db
		.select({
			name: user.name,
			email: user.email
		})
		.from(user)
		.where(and(eq(user.banned, false), eq(user.emailVerified, true), ne(user.email, '')));

	const statuses = await getCategoryStatuses({
		month: Number(monthRange.month),
		year: Number(monthRange.year),
		through: monthRange.endDate
	});

	if (!statuses.some((s) => s.budgeted > 0)) {
		logger.info('No monthly budgets found for weekly summary email run', {
			month: monthRange.month,
			year: monthRange.year
		});
		return {
			success: true,
			skipped: true,
			reason: 'No budgets found for current month',
			monthLabel: monthRange.monthLabel,
			recipientsScanned: recipients.length,
			emailsSent: 0,
			emailsFailed: 0,
			overBudgetCount: 0,
			nearLimitCount: 0,
			excludedCount: 0
		};
	}

	// Excluded expenses don't count toward any budget; they're listed separately in the email.
	const excludedExpenses: WeeklySummaryExcludedExpense[] = await db
		.select({
			date: expense.date,
			payee: expense.payee,
			categoryName: category.name,
			amount: expense.amount
		})
		.from(expense)
		.innerJoin(category, eq(expense.categoryId, category.id))
		.where(
			and(
				eq(expense.excludedFromBudget, true),
				...dateInRange(expense.date, monthRange.startDate, monthRange.endDate)
			)
		);
	excludedExpenses.sort((a, b) => a.date.localeCompare(b.date));

	const { overBudgetRows, nearLimitRows } = toSummaryRows(statuses);

	const emailResults = await Promise.allSettled(
		recipients.map((recipient) =>
			sendWeeklySummaryEmail({
				to: recipient.email,
				name: recipient.name ?? 'there',
				monthLabel: monthRange.monthLabel,
				overBudgetCategories: overBudgetRows,
				nearLimitCategories: nearLimitRows,
				excludedExpenses
			})
		)
	);

	const emailsSent = emailResults.filter((r) => r.status === 'fulfilled').length;
	const emailsFailed = emailResults.filter((r) => r.status === 'rejected').length;

	emailResults.forEach((r, index) => {
		if (r.status === 'rejected') {
			logger.error('Failed to send weekly summary email to recipient', r.reason, {
				email: recipients[index].email
			});
		}
	});

	const runCompletedMeta = {
		recipientsScanned: recipients.length,
		emailsSent,
		emailsFailed,
		overBudgetCount: overBudgetRows.length,
		nearLimitCount: nearLimitRows.length,
		excludedCount: excludedExpenses.length,
		monthLabel: monthRange.monthLabel
	};

	if (emailsFailed > 0) {
		logger.warn('Weekly summary email run completed with failures', runCompletedMeta);
	} else {
		logger.info('Weekly summary email run completed', runCompletedMeta);
	}

	return {
		success: true,
		skipped: false,
		monthLabel: monthRange.monthLabel,
		recipientsScanned: recipients.length,
		emailsSent,
		emailsFailed,
		overBudgetCount: overBudgetRows.length,
		nearLimitCount: nearLimitRows.length,
		excludedCount: excludedExpenses.length
	};
}
