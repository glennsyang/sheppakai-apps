import type { UserWithRole } from 'better-auth/plugins';
import type { Component } from 'svelte';

import type { auth } from '#lib/server/auth.js';
import type { QueryRow } from '#lib/server/db/queries/factory.js';
import type { sessionQueries } from '#lib/server/db/queries/index.js';
import type { RecleanDue } from '#lib/utils/windowCleaningStats.js';

/**
 * Base props for all modal/dialog components in the application.
 * Provides common interface for open state, data initialization, and edit mode.
 *
 * @template T - The entity type for initialData (e.g., Expense, Income, Category)
 */
export interface BaseModalProps<T> {
	/** Controls modal visibility (bindable) */
	open: boolean;

	/** Initial data for editing mode - partial to allow creating with subset of fields */
	initialData?: Partial<T>;

	/** Whether modal is in edit mode (true) or create mode (false) */
	isEditing?: boolean;
}

// Entity types are derived from the Drizzle schema plus the relations each query object
// loads by default (`defaultRelations` in `#lib/server/db/queries/index.js`), so schema drift is a
// type error rather than a silent mismatch.

/** The signed-in user as better-auth returns it on `locals.user`. */
export type User = typeof auth.$Infer.Session.user;

/** A session row as shown on the admin users page: everything but the token. */
export type AdminSessionSummary = Awaited<
	ReturnType<typeof sessionQueries.findSummariesByUserIds>
>[number];

export type UserWithSessions = UserWithRole & {
	sessions: AdminSessionSummary[];
};

export type Category = QueryRow<'category'>;

export type Expense = QueryRow<'expense', { category: true; user: true }>;

export type Budget = QueryRow<'budget', { category: true; user: true }>;

/**
 * Where a Category stands against its Budget for a month. `over` and `near` need a Budget above
 * zero; `unbudgeted` is spend with no (or a $0) Budget, `empty` is neither. Built only by
 * `#lib/server/budgets/category-status.js`; components render it, never recompute it.
 */
export type CategoryStatusState = 'over' | 'near' | 'ok' | 'unbudgeted' | 'empty';

export type CategoryStatus = {
	categoryId: string;
	categoryName: string;
	budgeted: number;
	/** Spend that counts toward the Budget: Excluded Expenses are left out. */
	spent: number;
	/** How far spent is past budgeted; 0 unless `state` is `over`. */
	overBy: number;
	/** spent / budgeted × 100, unrounded; 0 when there is no Budget. */
	pctUsed: number;
	state: CategoryStatusState;
};

/**
 * A recurring bill as the UI and API see it: `amount`/`cadence` are the values in effect for
 * the period being viewed, and `paid` is whether that period's payment is recorded.
 */
export type RecurringBill = QueryRow<'recurringBill', { user: true }> & { paid: boolean };

/** A Recurring Bill due soon or an Overdue Bill (see `upcomingBills`). */
export type UpcomingBill<B = RecurringBill> = {
	bill: B;
	/** `YYYY-MM-DD` due date in the viewed month's payment period. */
	dueDate: string;
	/** Calendar days from `today` to `dueDate`; negative once the due date has passed. */
	daysUntilDue: number;
	/** An Overdue Bill: unpaid and past its due date. */
	overdue: boolean;
};

export type Income = QueryRow<'income'>;

export type SavingsAccount = QueryRow<'savingsAccount', { user: true }>;

export type SavingsGoal = QueryRow<'savingsGoal', { user: true }>;

export type SavingsGoalStatus = SavingsGoal['status'];

export type SavingsGoalWithProgress = SavingsGoal & {
	currentAmount: number;
	percentage: number;
};

/** Dashboard goal row: progress plus a projected finish date (see `computeGoalEta`). */
export type SavingsGoalWithEta = SavingsGoalWithProgress & {
	/** Average monthly contribution over the last 6 months (or since the first contribution). */
	monthlyRate: number;
	/** Projected finish date (YYYY-MM-DD); null when finished, not active, or no recent contributions. */
	etaDate: string | null;
	/** ETA is on or before the target date; null when the goal has no target date or no ETA applies. */
	onTrack: boolean | null;
};

export type ForecastRange = { low: number; mid: number; high: number };

/** Month-end projection for the current month; see `computeMonthEndForecast`. */
export type MonthEndForecast = {
	/** Blended daily discretionary spending rate used for the projection. */
	dailyRate: number;
	/** Projected discretionary (non-recurring) spend at month end. */
	discretionaryEnd: ForecastRange;
	/** Projected total spend at month end, recurring included. */
	totalEnd: number;
	/** Larger of income recorded this month and the previous 3 months' average. */
	expectedIncome: number;
	/** Expected income minus projected total spend. */
	net: ForecastRange;
	/** Weeks of history behind the baseline; under 4 means no band (low = mid = high). */
	baselineWeeks: number;
};

/** A month's cash flow on the Pacific `today`; see `monthProgress` in `server/dashboard/cash-flow.ts`. */
export type CashFlow = {
	status: 'past' | 'current' | 'future';
	daysInMonth: number;
	/** Days elapsed, today included; all days for a past month, 0 for a future one. */
	daysElapsed: number;
	/** Days left to spend in, today included; 0 for a past month, all days for a future one. */
	daysRemaining: number;
	safeToSpend: {
		/** Income less discretionary spend and recurring bills; negative when past income. */
		remaining: number;
		/** `remaining` (floored at 0) spread over the days left. */
		perDay: number;
	};
	/** Planned budget left (floored at 0) spread over the days left. */
	budgetLeftPerDay: number;
	/** Month-end forecast; current month only. */
	forecast: MonthEndForecast | null;
};

export type Contribution = QueryRow<'contribution', { goal: true; user: true }>;

export type ChartData = {
	date: Date;
	actual: number;
	planned: number;
};

export type MonthlySpentChartData = {
	month: string;
	spent: number;
	budget?: number;
	overbudget: number;
};

export type TimeRangeInOutData = {
	month: string;
	in: number;
	out: number;
	/** Planned total for the month (category budgets + recurring). Yearly view only. */
	budgeted?: number;
};

export type SpendingBreakdownData = {
	category: string;
	categoryId: string | null;
	amount: number;
	color: string;
};

export type ExcludedSpendCategory = {
	categoryId: string | null;
	categoryName: string;
	amount: number;
};

/** Lean row for an excluded-from-budget expense (yearly "Not counted" sheet). */
export type ExcludedExpense = {
	id: string;
	date: string;
	payee: string;
	notes: string;
	amount: number;
	categoryName: string;
};

export type SpendingSpike = {
	categoryId: string;
	categoryName: string;
	currentAmount: number;
	trailingAverage: number;
	percentOver: number;
};

export type MonthlyNetflowData = {
	month: string;
	net: number;
};

export type WindowCleaningCustomer = QueryRow<'windowCleaningCustomer', { user: true }>;

export type WindowCleaningJob = QueryRow<'windowCleaningJob', { customer: true; user: true }>;

export type WindowCleaningCustomerWithStats = WindowCleaningCustomer & {
	jobs: WindowCleaningJob[];
	totalEarned: number;
	lastJobDate: string | null;
	hourlyRate: number | null;
	tipPct: number | null;
	reclean: RecleanDue | null;
	/** Overdue Customer: their Reclean Interval has passed since their last Job. */
	overdue: boolean;
};

export type SidebarData = {
	navMain: {
		title: string;
		url?: string;
		icon?: Component;
		items?: { title: string; url: string }[];
	}[];
	navSavings: { title: string; url: string; icon?: Component }[];
	navReceipts: { title: string; url: string; icon?: Component }[];
	navWindows: { title: string; url: string; icon?: Component }[];
	navSetup: {
		title: string;
		url: string;
		icon?: Component;
		/** Shown only when the layout's `isAdmin` is true. */
		adminOnly?: boolean;
	}[];
};
