<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	import type { CategoryStatus } from '#lib';
	import * as Card from '#lib/components/ui/card/index.js';
	import { formatCurrency } from '#lib/utils.js';

	interface CategoryRow {
		id: string;
		name: string;
		/** From the server's Category Status module; this list only renders it. */
		status: CategoryStatus;
		color: string;
	}

	interface Props {
		categories: CategoryRow[];
		onSelect: (categoryId: string) => void;
	}

	let { categories, onSelect }: Props = $props();
</script>

<Card.Root class="gap-0 py-1.5">
	<ul class="divide-y">
		{#each categories as row (row.id)}
			{@const state = row.status.state}
			{@const pct = row.status.pctUsed}
			<li>
				<button
					type="button"
					onclick={() => onSelect(row.id)}
					class="group hover:bg-muted/60 focus-visible:bg-muted/60 grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors outline-none sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_9rem_1rem] sm:px-5"
				>
					<span class="flex min-w-0 items-center gap-2.5">
						<span
							class="size-2 shrink-0 rounded-full"
							style="background: {row.color}"
							aria-hidden="true"
						></span>
						<span class="truncate text-sm font-medium">{row.name}</span>
					</span>

					<span class="text-right text-sm tabular-nums sm:order-3">
						{#if state === 'over'}
							<span class="text-destructive font-medium"
								>{formatCurrency(row.status.overBy)} over</span
							>
						{:else if state === 'unbudgeted'}
							<span class="text-muted-foreground"
								>{formatCurrency(row.status.spent)} unbudgeted</span
							>
						{:else if state === 'empty'}
							<span class="text-muted-foreground">No budget</span>
						{:else}
							<span class={state === 'near' ? 'text-warning font-medium' : 'font-medium'}
								>{formatCurrency(row.status.budgeted - row.status.spent)}</span
							>
							<span class="text-muted-foreground">left</span>
						{/if}
					</span>

					<span class="col-span-2 flex items-center gap-3 sm:order-2 sm:col-span-1">
						<span class="bg-track h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden="true">
							<span
								class={[
									'block h-full rounded-full transition-[width] duration-500 ease-out',
									state === 'over'
										? 'bg-destructive'
										: state === 'near'
											? 'bg-warning'
											: state === 'unbudgeted'
												? 'bg-muted-foreground/50'
												: ''
								]}
								style="background-color: {state === 'ok' ? row.color : ''}; width: {state ===
								'unbudgeted'
									? 100
									: Math.min(pct, 100)}%"
							></span>
						</span>
						<span class="text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums">
							{formatCurrency(row.status.spent)}{#if row.status.budgeted > 0}<span
									class="text-muted-foreground/70"
									>&nbsp;/ {formatCurrency(row.status.budgeted)}</span
								>{/if}
						</span>
					</span>

					<ChevronRightIcon
						class="text-muted-foreground/50 group-hover:text-muted-foreground hidden size-4 transition-transform group-hover:translate-x-0.5 sm:order-4 sm:block"
						aria-hidden="true"
					/>
				</button>
			</li>
		{/each}
	</ul>
</Card.Root>
