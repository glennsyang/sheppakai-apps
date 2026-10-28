import type { UserWithRole } from 'better-auth/plugins';
import type { Component } from 'svelte';

import type { auth } from '#lib/server/auth.js';
import type { QueryRow } from '#lib/server/db/queries/factory.js';
import type { sessionQueries } from '#lib/server/db/queries/index.js';

/**
 * Base props for all modal/dialog components in the application.
 * Provides common interface for open state, data initialization, and edit mode.
 *
 * @template T - The entity type for initialData (e.g., Transaction, Income, Category)
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

export type Transaction = QueryRow<'transaction', { category: true; user: true }>;

export type Budget = QueryRow<'budget', { category: true; user: true }>;

export type Recurring = QueryRow<'recurring', { user: true }>;

export type Income = QueryRow<'income'>;

export type Savings = QueryRow<'savings', { user: true }>;

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

export type CategoryAnomaly = {
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
