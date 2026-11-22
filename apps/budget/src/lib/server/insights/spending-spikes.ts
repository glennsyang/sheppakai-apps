import type { Budget, SpendingSpike, Expense } from '#lib/types.js';

// Require at least this many prior months of history before flagging anything, so a
// category with only 1-2 months on record doesn't produce a noisy "spike" on day one.
const MIN_PRIOR_MONTHS = 3;
// Skip categories whose trailing average is trivially small (e.g. a $5/mo category jumping
// to $8 isn't a meaningful spike, even though it's a large percentage change).
const MIN_BASELINE_AMOUNT = 30;
const SPIKE_RATIO = 1.25;
const MAX_SPIKES = 5;

export type HistoricalMonthRange = {
	monthStart: string;
	monthEnd: string;
};

export function computeSpendingSpikes(
	expenses: Expense[],
	historicalMonths: HistoricalMonthRange[],
	currentBudgets: Budget[] = []
): SpendingSpike[] {
	if (historicalMonths.length < MIN_PRIOR_MONTHS + 1) {
		return [];
	}

	const budgetByCategory = new Map(
		currentBudgets
			.filter((b): b is Budget & { category: NonNullable<Budget['category']> } => !!b.category)
			.map((b) => [b.category.id, b.amount])
	);

	const currentRange = historicalMonths[historicalMonths.length - 1];
	const priorRanges = historicalMonths.slice(0, -1);

	const categoryTotals = new Map<string, { name: string; current: number; priorTotal: number }>();

	for (const tx of expenses) {
		if (!tx.category) continue;

		const datePart = tx.date.substring(0, 10);
		const inCurrent = datePart >= currentRange.monthStart && datePart <= currentRange.monthEnd;
		const inPrior = priorRanges.some(
			(range) => datePart >= range.monthStart && datePart <= range.monthEnd
		);

		if (!inCurrent && !inPrior) continue;

		const existing = categoryTotals.get(tx.category.id) ?? {
			name: tx.category.name,
			current: 0,
			priorTotal: 0
		};

		if (inCurrent) {
			existing.current += tx.amount;
		} else {
			existing.priorTotal += tx.amount;
		}

		categoryTotals.set(tx.category.id, existing);
	}

	const spikes: SpendingSpike[] = [];

	for (const [categoryId, { name, current, priorTotal }] of categoryTotals) {
		const trailingAverage = priorTotal / priorRanges.length;

		if (trailingAverage < MIN_BASELINE_AMOUNT) continue;
		if (current <= trailingAverage * SPIKE_RATIO) continue;

		// Spending within (or exactly at) a budget the user set for this category isn't a
		// surprise, even if it's a big jump over the historical average.
		const budgetedAmount = budgetByCategory.get(categoryId) ?? 0;
		if (budgetedAmount > 0 && current <= budgetedAmount) continue;

		spikes.push({
			categoryId,
			categoryName: name,
			currentAmount: current,
			trailingAverage,
			percentOver: Math.round((current / trailingAverage - 1) * 100)
		});
	}

	return spikes.sort((a, b) => b.percentOver - a.percentOver).slice(0, MAX_SPIKES);
}
