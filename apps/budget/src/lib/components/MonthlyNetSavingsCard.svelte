<script lang="ts">
	import type { TimeRangeInOutData } from '#lib';
	import * as Card from '#lib/components/ui/card/index.js';
	import { formatCurrency } from '#lib/utils.js';

	interface Props {
		chartData: TimeRangeInOutData[];
		/** e.g. "May - Oct 2026" — the table covers only these months. */
		rangeLabel: string;
	}

	let { chartData, rangeLabel }: Props = $props();

	let totalIncome = $derived(chartData.reduce((sum, d) => sum + d.in, 0));
	let totalSpent = $derived(chartData.reduce((sum, d) => sum + d.out, 0));
	let totalBudgeted = $derived(chartData.reduce((sum, d) => sum + (d.budgeted ?? 0), 0));
	let totalNet = $derived(totalIncome - totalSpent);

	function signed(amount: number) {
		return `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${formatCurrency(Math.abs(amount))}`;
	}

	/** Spent vs budgeted, as text so the signal isn't colour alone. */
	function budgetDelta(budgeted: number, spent: number) {
		if (budgeted <= 0) return { over: false, label: '—' };
		const diff = spent - budgeted;
		return diff > 0
			? { over: true, label: `Over by ${formatCurrency(diff)}` }
			: { over: false, label: `${formatCurrency(-diff)} under` };
	}

	let totalDelta = $derived(budgetDelta(totalBudgeted, totalSpent));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-base tracking-tight">Month by month</Card.Title>
		<Card.Description
			>{rangeLabel}, spending against budget and income less all spending.</Card.Description
		>
	</Card.Header>
	<Card.Content>
		{#if chartData.length === 0}
			<p class="text-muted-foreground bg-muted/50 rounded-lg px-4 py-8 text-center text-sm">
				No months to show yet.
			</p>
		{:else}
			<div>
				<table class="w-full text-sm">
					<thead>
						<tr class="text-muted-foreground border-b text-left text-xs">
							<th class="pb-2 font-normal">Month</th>
							<th class="hidden pb-2 text-right font-normal md:table-cell">Income</th>
							<th class="hidden pb-2 text-right font-normal sm:table-cell">Budgeted</th>
							<th class="hidden pb-2 text-right font-normal sm:table-cell">Spent</th>
							<th class="hidden pb-2 text-right font-normal sm:table-cell">vs budget</th>
							<th class="pb-2 text-right font-normal">Net</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each chartData as row (row.month)}
							{@const net = row.in - row.out}
							{@const delta = budgetDelta(row.budgeted ?? 0, row.out)}
							<tr>
								<td class="py-2.5">
									{row.month}
									<span class="text-muted-foreground block text-xs tabular-nums sm:hidden"
										>{formatCurrency(row.in)} in · {formatCurrency(row.out)} of {formatCurrency(
											row.budgeted ?? 0
										)}</span
									>
									<span
										class={[
											'block text-xs tabular-nums sm:hidden',
											delta.over ? 'text-destructive font-medium' : 'text-muted-foreground'
										]}>{delta.label}</span
									>
									<span class="text-muted-foreground hidden text-xs tabular-nums sm:block md:hidden"
										>{formatCurrency(row.in)} in</span
									>
								</td>
								<td class="hidden py-2.5 text-right tabular-nums md:table-cell"
									>{formatCurrency(row.in)}</td
								>
								<td class="hidden py-2.5 text-right tabular-nums sm:table-cell"
									>{formatCurrency(row.budgeted ?? 0)}</td
								>
								<td class="hidden py-2.5 text-right tabular-nums sm:table-cell"
									>{formatCurrency(row.out)}</td
								>
								<td
									class={[
										'hidden py-2.5 text-right text-xs tabular-nums sm:table-cell',
										delta.over ? 'text-destructive font-medium' : 'text-muted-foreground'
									]}>{delta.label}</td
								>
								<td
									class={[
										'py-2.5 text-right font-medium tabular-nums',
										net >= 0 ? 'text-positive' : 'text-destructive'
									]}
								>
									{signed(net)}
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="border-t">
							<td class="pt-3 font-semibold">
								Total
								<span class="text-muted-foreground block text-xs font-normal tabular-nums sm:hidden"
									>{formatCurrency(totalIncome)} in · {formatCurrency(totalSpent)} of {formatCurrency(
										totalBudgeted
									)}</span
								>
								<span
									class={[
										'block text-xs tabular-nums sm:hidden',
										totalDelta.over
											? 'text-destructive font-medium'
											: 'text-muted-foreground font-normal'
									]}>{totalDelta.label}</span
								>
								<span
									class="text-muted-foreground hidden text-xs font-normal tabular-nums sm:block md:hidden"
									>{formatCurrency(totalIncome)} in</span
								>
							</td>
							<td class="hidden pt-3 text-right font-semibold tabular-nums md:table-cell"
								>{formatCurrency(totalIncome)}</td
							>
							<td class="hidden pt-3 text-right font-semibold tabular-nums sm:table-cell"
								>{formatCurrency(totalBudgeted)}</td
							>
							<td class="hidden pt-3 text-right font-semibold tabular-nums sm:table-cell"
								>{formatCurrency(totalSpent)}</td
							>
							<td
								class={[
									'hidden pt-3 text-right text-xs tabular-nums sm:table-cell',
									totalDelta.over ? 'text-destructive font-semibold' : 'text-muted-foreground'
								]}>{totalDelta.label}</td
							>
							<td
								class={[
									'pt-3 text-right font-semibold tabular-nums',
									totalNet >= 0 ? 'text-positive' : 'text-destructive'
								]}
							>
								{signed(totalNet)}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
