<script lang="ts">
	import type { Category } from '#lib';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { months } from '#lib/utils.js';
	import { formatLocalTimestamp } from '#lib/utils/dates.js';

	/** Minimal row shape; full `Transaction`s satisfy it. */
	type SheetTransaction = {
		id: string;
		date: string;
		payee: string;
		amount: number;
		notes?: string | null;
		category?: { name: string } | null;
	};

	interface Props {
		openSheet: boolean;
		transactions: SheetTransaction[];
		category?: Category | null;
		/** Overrides the "<category> Transactions" title. */
		title?: string;
		/** Adds a Category column and shows notes under the description (multi-category lists). */
		showCategory?: boolean;
		month?: string;
		year?: number;
		timeRange?: string;
		footer?: import('svelte').Snippet;
	}

	let {
		openSheet = $bindable(),
		transactions,
		category,
		title,
		showCategory = false,
		month,
		year,
		timeRange,
		footer
	}: Props = $props();

	let categoryTotal = $derived(transactions.reduce((sum, t) => sum + t.amount, 0));
</script>

<Sheet.Root bind:open={openSheet}>
	<Sheet.Content side="right" class="flex w-full flex-col sm:max-w-lg">
		<Sheet.Header>
			<Sheet.Title>{title ?? `${category?.name} Transactions`}</Sheet.Title>
			<Sheet.Description>
				{#if timeRange}
					{timeRange}
				{:else}
					Transactions for {month ? months.find((m) => m.value === month)?.label : ''}
					{year || ''}
				{/if}
			</Sheet.Description>
		</Sheet.Header>

		<div class="flex-1 overflow-y-auto px-4 py-4">
			{#if transactions.length === 0}
				<div class="text-muted-foreground flex h-32 items-center justify-center">
					No transactions yet
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Date</Table.Head>
							{#if showCategory}
								<Table.Head>Category</Table.Head>
								<Table.Head>Description</Table.Head>
							{:else}
								<Table.Head>Payee</Table.Head>
							{/if}
							<Table.Head class="text-right">Amount</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each transactions as transaction (transaction.id)}
							<Table.Row>
								<Table.Cell>{formatLocalTimestamp(transaction.date)}</Table.Cell>
								{#if showCategory}
									<Table.Cell>{transaction.category?.name ?? 'Uncategorized'}</Table.Cell>
									<Table.Cell class="whitespace-normal">
										{transaction.payee}
										{#if transaction.notes}
											<span class="text-muted-foreground block text-xs">{transaction.notes}</span>
										{/if}
									</Table.Cell>
								{:else}
									<Table.Cell>{transaction.payee}</Table.Cell>
								{/if}
								<Table.Cell class="text-right font-medium">
									${transaction.amount.toLocaleString('en-US', {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2
									})}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</div>

		<Sheet.Footer class="border-t pt-4">
			{#if footer}
				{@render footer()}
			{:else}
				<div class="flex w-full justify-between font-semibold">
					<span>
						{transactions.length}
						{transactions.length === 1 ? 'transaction' : 'transactions'}
					</span>
					<span>
						${categoryTotal.toLocaleString('en-US', {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2
						})}
					</span>
				</div>
			{/if}
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
